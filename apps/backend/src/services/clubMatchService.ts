/**
 * Club Match Service — admin-initiated match creation and slot availability
 *
 * Decision Context:
 * - Why separate from matchService: matchService.createMatch() hard-checks role=player
 *   and always auto-enrolls the organizer. This service is for club_admin who bypasses
 *   the role check, sets organizedByClub=true, and does NOT auto-enroll by default.
 * - Reuse strategy: calls matchRepository directly (not matchService) to avoid duplicating
 *   the shared validation logic but to control the enrollment step independently.
 * - allowOnlineBooking override: admin can create matches even on slots with
 *   allowOnlineBooking=false — it's their club. The check is intentionally skipped here.
 * - organizedByClub=true: this flag signals that the organizer may not be in matchParticipants.
 *   Frontend uses it to hide the "Organizado por" player card and show a club badge instead.
 * - Audit log: creation logged to slotAuditLog with action='CREATED' so the slot history
 *   records admin-initiated matches separately from player-created ones.
 * - Cache invalidation: invalidates dashboard cache + public match lists so new match
 *   appears immediately without waiting for TTL expiry.
 * - availableSlotsForClubMatch: expands weekly slot templates into concrete date occurrences
 *   within the requested range, then subtracts slots that already have an active match.
 *   The day-of-week expansion happens in the service (not the DB) to avoid complex SQL
 *   and keep the DB query simple and index-friendly.
 * - Bulk create: partial failures are tolerated. If one match fails the rest continue.
 *   The caller receives a per-match result list so they can retry failed ones.
 * - Phase 2 (not here): templates, popular slot heuristics.
 * - Previously fixed bugs:
 *   - expandSlotsToDateRange used `<= now` so same-day future slots were filtered out before
 *     reaching the frontend. Fixed: apply the same 15-min grace period as the frontend picker.
 *   - createClubMatch step 6 compared `scheduledDate = input.scheduledDate + 'T00:00:00Z'` (midnight
 *     UTC) against now, which always failed for same-day slots. Fixed: use the full slot start
 *     datetime (`input.scheduledDate + 'T' + slot.startTime`) with the 15-min grace period.
 */

import { cacheDelete, cacheDeletePattern, CACHE_PREFIX, CACHE_TTL, cacheGetOrSet } from '../config/redis.js';
import {
  matchRepository,
  type SlotAvailabilityFilter,
  type SlotWithDate,
} from '../repositories/matchRepository.js';
import { clubSlotManagementRepository } from '../repositories/clubSlotManagementRepository.js';
import { profileRepository } from '../repositories/profileRepository.js';
import {
  MatchFormat,
  MatchStatus,
} from '../graphql/generated/graphql.js';
import type { ServiceContext } from '../types/context.js';

// =====================================================
// Enum maps (mirror matchService.ts)
// =====================================================

const FORMAT_TO_DB: Record<MatchFormat, string> = {
  [MatchFormat.FiveVsFive]: '5v5',
  [MatchFormat.SevenVsSeven]: '7v7',
  [MatchFormat.TenVsTen]: '10v10',
  [MatchFormat.ElevenVsEleven]: '11v11',
};

const FORMAT_ORDER: Record<string, number> = {
  '5v5': 5,
  '7v7': 7,
  '10v10': 10,
  '11v11': 11,
};

const FORMAT_CAPACITY: Record<MatchFormat, number> = {
  [MatchFormat.FiveVsFive]: 10,
  [MatchFormat.SevenVsSeven]: 14,
  [MatchFormat.TenVsTen]: 20,
  [MatchFormat.ElevenVsEleven]: 22,
};

// Day-of-week ISO weekday number → DB enum string
const ISO_DOW_TO_DB: Record<number, string> = {
  1: 'monday',
  2: 'tuesday',
  3: 'wednesday',
  4: 'thursday',
  5: 'friday',
  6: 'saturday',
  0: 'sunday',
};

// =====================================================
// Service input types
// =====================================================

export interface CreateClubMatchInput {
  slotId: string;
  scheduledDate: string; // YYYY-MM-DD
  format: MatchFormat;
  capacity: number;
  description?: string | null;
  autoEnrollOrganizer?: boolean;
}

export interface BulkCreateClubMatchesInput {
  matches: CreateClubMatchInput[];
}

export interface AvailableSlotsFilters {
  startDate: string;
  endDate: string;
  courtIds?: string[];
  includeNonBookable?: boolean;
}

export interface CreateClubMatchResult {
  success: boolean;
  matchId: string | null;
  message: string | null;
}

export interface BulkClubMatchItem {
  slotId: string;
  date: string;
  success: boolean;
  matchId: string | null;
  message: string | null;
}

export interface BulkClubMatchResult {
  totalRequested: number;
  successCount: number;
  failureCount: number;
  results: BulkClubMatchItem[];
}

// =====================================================
// Helpers
// =====================================================

async function requireClubAdminWithClub(ctx: ServiceContext) {
  if (!ctx.userId) throw new Error('Autenticación requerida');
  const profile = await profileRepository.getProfileById(ctx.userId);
  if (!profile || profile.role !== 'club_admin') {
    throw new Error('Solo administradores de club pueden crear partidos desde el panel');
  }
  const client = ctx.supabase ?? (await import('../config/supabase.js')).supabase;
  const club = await clubSlotManagementRepository.getClubByOwnerId(ctx.userId, client);
  if (!club) throw new Error('No se encontró un club asociado a este administrador');
  return { profile, club, client };
}

function expandSlotsToDateRange(
  slots: Array<{ id: string; courtId: string; dayOfWeek: string; startTime: string; endTime: string; duration: number; priceArs: number | null; allowOnlineBooking: boolean }>,
  courts: Map<string, string>,
  startDate: string,
  endDate: string,
  matchedSlotIds: Set<string>,
): SlotWithDate[] {
  const result: SlotWithDate[] = [];
  const start = new Date(startDate + 'T00:00:00Z');
  const end = new Date(endDate + 'T00:00:00Z');
  const now = new Date();

  // 15-minute grace: allow booking up to 15 min after slot start (mirrors frontend isWithinGracePeriod).
  // A slot is still bookable if now < slotStart + 15 min, i.e. slotStart + 15 min > now.
  const GRACE_MS = 15 * 60 * 1000;

  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const dayStr = ISO_DOW_TO_DB[d.getUTCDay()];
    const dateStr = d.toISOString().slice(0, 10);

    for (const slot of slots) {
      if (slot.dayOfWeek !== dayStr) continue;

      const scheduledAt = `${dateStr}T${slot.startTime}`;
      // Skip slots whose grace period has elapsed (slotStart + 15 min <= now)
      if (new Date(scheduledAt).getTime() + GRACE_MS <= now.getTime()) continue;

      result.push({
        slotId: slot.id,
        courtId: slot.courtId,
        courtName: courts.get(slot.courtId) ?? 'Cancha',
        dayOfWeek: slot.dayOfWeek,
        startTime: slot.startTime,
        endTime: slot.endTime,
        duration: slot.duration,
        priceArs: slot.priceArs,
        date: dateStr,
        scheduledAt,
        hasMatch: matchedSlotIds.has(slot.id),
        allowOnlineBooking: slot.allowOnlineBooking,
      });
    }
  }

  return result;
}

async function invalidateCaches(clubId: string): Promise<void> {
  await Promise.all([
    cacheDelete(CACHE_PREFIX.MATCHES_OPEN),
    cacheDeletePattern(`${CACHE_PREFIX.MATCHES_LIST}:*`),
    cacheDeletePattern(`club:${clubId}:dashboard:*`),
    cacheDeletePattern(`club:${clubId}:metrics*`),
  ]);
}

// =====================================================
// Service
// =====================================================

export const clubMatchService = {
  async getAvailableSlots(
    ctx: ServiceContext,
    filters: AvailableSlotsFilters,
  ): Promise<SlotWithDate[]> {
    const { club, client } = await requireClubAdminWithClub(ctx);

    const cacheKey = `club:${club.id}:available-slots:${filters.startDate}:${filters.endDate}`;

    return cacheGetOrSet(
      cacheKey,
      async () => {
        const filter: SlotAvailabilityFilter = {
          clubId: club.id,
          startDate: filters.startDate,
          endDate: filters.endDate,
          courtIds: filters.courtIds,
        };

        const { slots, matchedSlotIds } = await matchRepository.getClubSlotsAndMatches(filter, client);

        // Build court name map
        const courts = await clubSlotManagementRepository.getCourtsByClubId(club.id, client);
        const courtMap = new Map(courts.map((c) => [c.id, c.name]));

        // Filter by allowOnlineBooking if needed
        const filteredSlots = filters.includeNonBookable
          ? slots
          : slots.filter((s) => s.allowOnlineBooking);

        return expandSlotsToDateRange(filteredSlots, courtMap, filters.startDate, filters.endDate, matchedSlotIds);
      },
      CACHE_TTL.DYNAMIC_DATA,
    );
  },

  async createClubMatch(
    ctx: ServiceContext,
    input: CreateClubMatchInput,
  ): Promise<CreateClubMatchResult> {
    const { club, client } = await requireClubAdminWithClub(ctx);

    // 1. Load slot (with court info for validation)
    const slot = await clubSlotManagementRepository.getManagedSlotById(input.slotId, client);
    if (!slot) throw new Error('El horario seleccionado no existe');

    // 2. Verify slot belongs to admin's club
    if (slot.clubId !== club.id) {
      throw new Error('No tenés permiso para crear partidos en este horario');
    }

    // 3. Active / not blocked check
    if (!slot.isActive) throw new Error('El horario fue desactivado y no está disponible');
    if (slot.isBlocked) throw new Error('El horario está bloqueado. Desbloquealo antes de crear un partido');

    // 4. Format vs court.maxFormat check
    const dbFormat = FORMAT_TO_DB[input.format];
    if (!dbFormat) throw new Error('Formato de partido inválido');
    const courtMaxFormat = slot.courts?.maxFormat as string | undefined;
    if (courtMaxFormat && (FORMAT_ORDER[dbFormat] ?? 0) > (FORMAT_ORDER[courtMaxFormat] ?? 99)) {
      throw new Error(`Esta cancha soporta hasta ${courtMaxFormat}. El formato ${dbFormat} no es compatible`);
    }

    // 5. Capacity check
    const maxCap = FORMAT_CAPACITY[input.format];
    if (input.capacity < 2 || input.capacity > maxCap) {
      throw new Error(`La capacidad para ${dbFormat} debe estar entre 2 y ${maxCap} jugadores`);
    }

    // 6. Date/time validation: use full slot start datetime + 15-min grace period.
    // Previously used input.scheduledDate + 'T00:00:00Z' (midnight UTC) which always
    // failed for same-day slots because midnight < now. Fix: compare the actual slot
    // start time against now with the same 15-min grace the frontend shows in the picker.
    // Previously fixed bugs: same-day slots rejected even when the slot time was future.
    const GRACE_MS = 15 * 60 * 1000;
    const slotStartAt = new Date(`${input.scheduledDate}T${slot.startTime}`);
    const now = new Date();
    if (slotStartAt.getTime() + GRACE_MS <= now.getTime()) {
      throw new Error('La fecha del partido debe ser futura');
    }
    const maxDate = new Date(now);
    maxDate.setDate(maxDate.getDate() + 90);
    if (slotStartAt > maxDate) throw new Error('La fecha no puede ser más de 90 días en el futuro');

    // 7. Day-of-week check (use local day from slotStartAt, consistent with how the date was parsed)
    const expectedDay = ISO_DOW_TO_DB[slotStartAt.getDay()];
    if (slot.dayOfWeek !== expectedDay) {
      throw new Error(`El horario seleccionado es para ${slot.dayOfWeek}, pero la fecha elegida corresponde a ${expectedDay}`);
    }

    // 8. Check no existing active match at this slot on this date
    const scheduledAt = `${input.scheduledDate}T${slot.startTime}`;
    const filter: SlotAvailabilityFilter = {
      clubId: club.id,
      startDate: input.scheduledDate,
      endDate: input.scheduledDate,
    };
    const { matchedSlotIds } = await matchRepository.getClubSlotsAndMatches(filter, client);
    if (matchedSlotIds.has(slot.id)) {
      throw new Error('Ya existe un partido en este horario para esa fecha');
    }

    // 9. Create match with organizedByClub=true (user-scoped client for RLS)
    console.info(
      `[clubMatchService.createClubMatch] admin=${ctx.userId} slot=${slot.id} date=${input.scheduledDate} format=${dbFormat}`,
    );

    const newMatch = await matchRepository.createMatch(
      {
        organizerId: ctx.userId!,
        clubId: club.id,
        courtId: slot.courtId,
        clubSlotId: slot.id,
        format: dbFormat,
        capacity: input.capacity,
        scheduledAt,
        description: input.description,
        organizedByClub: true,
      },
      client,
    );

    // 10. Optionally enroll organizer
    if (input.autoEnrollOrganizer) {
      await matchRepository.createMatchParticipant(newMatch.id, ctx.userId!, 'a', client);
      console.info(`[clubMatchService.createClubMatch] Admin enrolled as team A participant matchId=${newMatch.id}`);
    }

    // 11. Audit log
    const supabaseAdmin = (await import('../config/supabase.js')).supabase;
    await supabaseAdmin
      .from('slotAuditLog')
      .insert({
        slotId: slot.id,
        action: 'CREATED',
        changedBy: ctx.userId,
        newValue: JSON.stringify({ matchId: newMatch.id, organizedByClub: true }),
        reason: 'Partido creado por administrador del club',
      })
      .then(({ error }) => {
        if (error) console.warn('[clubMatchService.createClubMatch] Audit log insert failed:', error.message);
      });

    // 12. Invalidate caches
    await invalidateCaches(club.id);

    console.info(`[clubMatchService.createClubMatch] Created matchId=${newMatch.id}`);
    return { success: true, matchId: newMatch.id, message: null };
  },

  async bulkCreateClubMatches(
    ctx: ServiceContext,
    input: BulkCreateClubMatchesInput,
  ): Promise<BulkClubMatchResult> {
    const results: BulkClubMatchItem[] = [];
    let successCount = 0;

    for (const matchInput of input.matches) {
      try {
        const result = await clubMatchService.createClubMatch(ctx, matchInput);
        results.push({
          slotId: matchInput.slotId,
          date: matchInput.scheduledDate,
          success: true,
          matchId: result.matchId,
          message: null,
        });
        successCount++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Error al crear el partido';
        console.error(`[clubMatchService.bulkCreateClubMatches] Failed slotId=${matchInput.slotId} date=${matchInput.scheduledDate}:`, msg);
        results.push({
          slotId: matchInput.slotId,
          date: matchInput.scheduledDate,
          success: false,
          matchId: null,
          message: msg,
        });
      }
    }

    return {
      totalRequested: input.matches.length,
      successCount,
      failureCount: input.matches.length - successCount,
      results,
    };
  },
};
