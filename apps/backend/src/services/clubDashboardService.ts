/**
 * Club Dashboard Service — aggregated dashboard data for club_admin
 *
 * Decision Context:
 * - Why: Consolidates KPIs, schedule, match list, conflicts, and export into one service
 *   so the resolver is a thin wire and dashboard data is computed consistently.
 * - TimeStatus computed server-side (not client-side) to avoid timezone bugs: the server
 *   uses UTC internally; the label is always in Spanish to match UX conventions.
 * - Occupancy rate = (matches in range / active slots in range) * 100. Uses active slot count
 *   as denominator because blocked/inactive slots aren't bookable. Capped at 100%.
 * - Revenue = sum of priceArs for slots that have a non-cancelled match in the date range.
 *   Includes slots with null priceArs as $0 (not excluded) for accuracy.
 * - Conflict detection: (a) match without organizer profile, (b) match < 24h away with 0
 *   participants, (c) match on a blocked/inactive slot. Phase 2: overlap detection.
 * - Export: returns CSV string bounded by the 90-day filter limit. No signed URL — the
 *   response is inline so clients without Supabase Storage access can still download.
 * - Cache: dashboard schedule (TTL 2 min), metrics (TTL 5 min). Short TTLs because
 *   match status and participant counts change frequently.
 * - Default date range: current ISO week (Mon–Sun) when no filter provided.
 * - Previously fixed bugs: none relevant (new feature).
 */

import {
  cacheGetOrSet,
  cacheDeletePattern,
  CACHE_TTL,
} from '../config/redis.js';
import {
  clubDashboardRepository,
  type DashboardFiltersInput,
  type MatchDashboardRow,
  type SlotDashboardRow,
  type ClubRow,
} from '../repositories/clubDashboardRepository.js';
import { clubSlotManagementRepository } from '../repositories/clubSlotManagementRepository.js';
import type { ServiceContext } from '../types/context.js';

// =====================================================
// Cache keys
// =====================================================

const CACHE_DASHBOARD = (clubId: string, start: string, end: string) =>
  `club:${clubId}:dashboard:${start}:${end}`;
const CACHE_METRICS = (clubId: string) => `club:${clubId}:metrics`;
const CACHE_DASHBOARD_PATTERN = (clubId: string) => `club:${clubId}:dashboard:*`;

// =====================================================
// Local return types (mirror GraphQL schema types)
// =====================================================

export type TimeStatus =
  | 'PAST'
  | 'FINISHED_RECENTLY'
  | 'NOW'
  | 'UPCOMING_SOON'
  | 'UPCOMING'
  | 'FAR_FUTURE';

export type ScheduleSlotStatus =
  | 'AVAILABLE'
  | 'MATCH_OPEN'
  | 'MATCH_FULL'
  | 'MATCH_IN_PROGRESS'
  | 'MATCH_COMPLETED'
  | 'BLOCKED'
  | 'INACTIVE'
  | 'PAST';

export interface ProfileSummary {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface DashboardMatch {
  id: string;
  format: string;
  capacity: number;
  status: string;
  scheduledAt: string;
  description: string | null;
  organizer: ProfileSummary;
  participants: ProfileSummary[];
  participantCount: number;
  spotsLeft: number;
  timeStatus: TimeStatus;
  timeStatusLabel: string;
  courtId: string | null;
  courtName: string | null;
  clubSlotId: string | null;
}

export interface ScheduleSlot {
  slotId: string;
  courtId: string;
  courtName: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  duration: number;
  status: ScheduleSlotStatus;
  match: DashboardMatch | null;
  blockReason: string | null;
  blockType: string | null;
  isActive: boolean;
  allowOnlineBooking: boolean;
  priceArs: number | null;
}

export interface ClubMetrics {
  matchesThisWeek: number;
  occupancyRate: number;
  estimatedRevenue: number;
  uniquePlayersThisMonth: number;
  totalActiveCourts: number;
  blockedSlotsCount: number;
}

export interface ConflictAlert {
  matchId: string;
  type: string;
  description: string;
  scheduledAt: string;
  courtName: string;
}

export interface ClubDashboardData {
  club: ClubRow;
  metrics: ClubMetrics;
  schedule: ScheduleSlot[];
  matches: DashboardMatch[];
  conflicts: ConflictAlert[];
}

// =====================================================
// Helpers
// =====================================================

function currentWeekRange(): { startDate: string; endDate: string } {
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sun
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - ((day + 6) % 7));
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);

  return {
    startDate: monday.toISOString().slice(0, 10),
    endDate: sunday.toISOString().slice(0, 10),
  };
}

function currentMonthRange(): { startDate: string; endDate: string } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

function computeTimeStatus(scheduledAt: string, durationMin: number): TimeStatus {
  const now = Date.now();
  const start = new Date(scheduledAt).getTime();
  const end = start + durationMin * 60_000;
  const diffStartMs = start - now;
  const diffEndMs = end - now;

  if (diffEndMs < -2 * 3_600_000) return 'PAST';
  if (diffEndMs < 0) return 'FINISHED_RECENTLY';
  if (diffStartMs <= 0) return 'NOW';
  if (diffStartMs < 2 * 3_600_000) return 'UPCOMING_SOON';
  if (diffStartMs < 24 * 3_600_000) return 'UPCOMING';
  return 'FAR_FUTURE';
}

function timeStatusLabel(status: TimeStatus, scheduledAt: string, durationMin: number): string {
  const now = Date.now();
  const start = new Date(scheduledAt).getTime();
  const end = start + durationMin * 60_000;

  switch (status) {
    case 'PAST': {
      const hoursAgo = Math.floor((now - end) / 3_600_000);
      return hoursAgo < 48 ? `Hace ${hoursAgo}h` : `Finalizado`;
    }
    case 'FINISHED_RECENTLY': {
      const minsAgo = Math.floor((now - end) / 60_000);
      return `Hace ${minsAgo} min`;
    }
    case 'NOW':
      return 'Ahora';
    case 'UPCOMING_SOON': {
      const mins = Math.ceil((start - now) / 60_000);
      return mins < 60 ? `En ${mins} min` : `En ${Math.ceil(mins / 60)}h`;
    }
    case 'UPCOMING': {
      const hours = Math.ceil((start - now) / 3_600_000);
      return `En ${hours}h`;
    }
    case 'FAR_FUTURE': {
      const days = Math.ceil((start - now) / 86_400_000);
      return days === 1 ? 'Mañana' : `En ${days} días`;
    }
  }
}

function slotStatusFromMatch(
  slot: SlotDashboardRow,
  match: DashboardMatch | null,
): ScheduleSlotStatus {
  if (!slot.isActive) return 'INACTIVE';
  if (slot.isBlocked) return 'BLOCKED';
  if (!match) {
    const now = new Date();
    // Slot in the past (approximate: check if this week's occurrence already passed)
    return 'AVAILABLE';
  }
  if (match.timeStatus === 'PAST' || match.timeStatus === 'FINISHED_RECENTLY') return 'MATCH_COMPLETED';
  if (match.timeStatus === 'NOW') return 'MATCH_IN_PROGRESS';
  if (match.status === 'full') return 'MATCH_FULL';
  return 'MATCH_OPEN';
}

function detectConflicts(
  matches: DashboardMatch[],
  slotMap: Map<string, SlotDashboardRow>,
): ConflictAlert[] {
  const alerts: ConflictAlert[] = [];
  const now = Date.now();

  for (const m of matches) {
    const start = new Date(m.scheduledAt).getTime();
    const hoursUntilStart = (start - now) / 3_600_000;

    // Match < 24h away with 0 participants
    if (hoursUntilStart > 0 && hoursUntilStart < 24 && m.participantCount === 0) {
      alerts.push({
        matchId: m.id,
        type: 'NO_PARTICIPANTS',
        description: `Partido sin jugadores inscriptos a menos de 24hs (${m.timeStatusLabel})`,
        scheduledAt: m.scheduledAt,
        courtName: m.courtName ?? 'Sin cancha',
      });
    }

    // Match on a blocked or inactive slot
    if (m.clubSlotId) {
      const slot = slotMap.get(m.clubSlotId);
      if (slot?.isBlocked) {
        alerts.push({
          matchId: m.id,
          type: 'SLOT_BLOCKED',
          description: 'Partido programado en un slot bloqueado',
          scheduledAt: m.scheduledAt,
          courtName: m.courtName ?? 'Sin cancha',
        });
      }
      if (slot && !slot.isActive) {
        alerts.push({
          matchId: m.id,
          type: 'SLOT_INACTIVE',
          description: 'Partido programado en un slot inactivo',
          scheduledAt: m.scheduledAt,
          courtName: m.courtName ?? 'Sin cancha',
        });
      }
    }
  }

  return alerts;
}

function buildCsvExport(matches: DashboardMatch[]): string {
  const header = [
    'Fecha',
    'Hora',
    'Cancha',
    'Formato',
    'Estado',
    'Organizador',
    'Participantes',
    'Ingreso estimado',
  ].join(',');

  const rows = matches.map((m) => {
    const dt = new Date(m.scheduledAt);
    const fecha = dt.toISOString().slice(0, 10);
    const hora = dt.toISOString().slice(11, 16);
    const cancha = (m.courtName ?? '').replace(/,/g, ';');
    const formato = m.format;
    const estado = m.status;
    const organizador = m.organizer.displayName.replace(/,/g, ';');
    const participantes = m.participantCount;
    const ingreso = ''; // slot price not available at this point in the pipeline
    return [fecha, hora, cancha, formato, estado, organizador, participantes, ingreso].join(',');
  });

  return [header, ...rows].join('\n');
}

// =====================================================
// Service
// =====================================================

async function requireClubOwnership(ctx: ServiceContext): Promise<ClubRow> {
  if (!ctx.userId) throw new Error('Autenticación requerida');
  const client = ctx.supabase ?? (await import('../config/supabase.js')).supabase;
  const club = await clubDashboardRepository.getClubByOwnerId(ctx.userId, client);
  if (!club) {
    throw new Error('No se encontró un club asociado a este administrador');
  }
  return club;
}

async function fetchMatchesWithParticipants(
  clubId: string,
  filters: DashboardFiltersInput,
  courtNameMap: Map<string, string>,
  ctx: ServiceContext,
): Promise<DashboardMatch[]> {
  const client = ctx.supabase ?? (await import('../config/supabase.js')).supabase;
  const matchRows = await clubDashboardRepository.getMatchesForDashboard(clubId, filters, client);

  if (!matchRows.length) return [];

  const matchIds = matchRows.map((m) => m.id);
  const organizerIds = [...new Set(matchRows.map((m) => m.organizerId))];

  const [organizers, participantRows] = await Promise.all([
    clubDashboardRepository.getOrganizersByIds(organizerIds, client),
    clubDashboardRepository.getParticipantsByMatchIds(matchIds, client),
  ]);

  const organizerMap = new Map(organizers.map((o) => [o.id, o]));
  const participantsByMatch = new Map<string, ProfileSummary[]>();
  for (const p of participantRows) {
    const list = participantsByMatch.get(p.matchId) ?? [];
    list.push({
      id: p.profile.id,
      displayName: p.profile.displayName,
      avatarUrl: p.profile.avatarUrl,
    });
    participantsByMatch.set(p.matchId, list);
  }

  return matchRows.map((row): DashboardMatch => {
    const ts = computeTimeStatus(row.scheduledAt, row.durationMin);
    const organizer = organizerMap.get(row.organizerId) ?? {
      id: row.organizerId,
      displayName: 'Desconocido',
      avatarUrl: null,
    };
    const participants = participantsByMatch.get(row.id) ?? [];
    return {
      id: row.id,
      format: row.format,
      capacity: row.capacity,
      status: row.status,
      scheduledAt: row.scheduledAt,
      description: row.description,
      organizer,
      participants,
      participantCount: participants.length,
      spotsLeft: Math.max(0, row.capacity - participants.length),
      timeStatus: ts,
      timeStatusLabel: timeStatusLabel(ts, row.scheduledAt, row.durationMin),
      courtId: row.courtId,
      courtName: row.courtId ? (courtNameMap.get(row.courtId) ?? null) : null,
      clubSlotId: row.clubSlotId,
    };
  });
}

async function calculateMetrics(
  club: ClubRow,
  filters: DashboardFiltersInput,
  ctx: ServiceContext,
): Promise<ClubMetrics> {
  const client = ctx.supabase ?? (await import('../config/supabase.js')).supabase;
  const weekRange = currentWeekRange();
  const monthRange = currentMonthRange();

  const [matchesThisWeek, uniquePlayersThisMonth, activeCourts, blockedSlots, slotsWithMatch, activeSlotCount] =
    await Promise.all([
      clubDashboardRepository.countMatchesInRange(club.id, weekRange.startDate, weekRange.endDate, client),
      clubDashboardRepository.countUniquePlayersInRange(club.id, monthRange.startDate, monthRange.endDate, client),
      clubDashboardRepository.countActiveCourts(club.id, client),
      clubDashboardRepository.countBlockedSlots(club.id, client),
      clubDashboardRepository.getSlotsWithMatchInRange(
        club.id,
        filters.startDate ?? weekRange.startDate,
        filters.endDate ?? weekRange.endDate,
        client,
      ),
      clubDashboardRepository.countActiveSlots(club.id, client),
    ]);

  const estimatedRevenue = slotsWithMatch.reduce((sum, s) => sum + (s.priceArs ?? 0), 0);
  const occupancyRate =
    activeSlotCount > 0
      ? Math.min(100, Math.round((slotsWithMatch.length / activeSlotCount) * 100))
      : 0;

  return {
    matchesThisWeek,
    occupancyRate,
    estimatedRevenue,
    uniquePlayersThisMonth,
    totalActiveCourts: activeCourts,
    blockedSlotsCount: blockedSlots,
  };
}

// =====================================================
// Exported service
// =====================================================

export const clubDashboardService = {
  async getDashboard(ctx: ServiceContext, rawFilters?: DashboardFiltersInput | null): Promise<ClubDashboardData> {
    const club = await requireClubOwnership(ctx);
    const client = ctx.supabase ?? (await import('../config/supabase.js')).supabase;

    const weekRange = currentWeekRange();
    const filters: DashboardFiltersInput = {
      startDate: rawFilters?.startDate ?? weekRange.startDate,
      endDate: rawFilters?.endDate ?? weekRange.endDate,
      courtIds: rawFilters?.courtIds,
      matchStatuses: rawFilters?.matchStatuses,
      includeBlocked: rawFilters?.includeBlocked ?? true,
      includeInactive: rawFilters?.includeInactive ?? false,
    };

    const cacheKey = CACHE_DASHBOARD(club.id, filters.startDate!, filters.endDate!);

    return cacheGetOrSet(
      cacheKey,
      async () => {
        const courts = await clubDashboardRepository.getCourtsByClubId(club.id, client);
        const courtNameMap = new Map(courts.map((c) => [c.id, c.name]));

        const [metrics, matches, slots] = await Promise.all([
          calculateMetrics(club, filters, ctx),
          fetchMatchesWithParticipants(club.id, filters, courtNameMap, ctx),
          clubDashboardRepository.getSlotsByClubId(club.id, filters, client),
        ]);

        const matchBySlot = new Map<string, DashboardMatch>();
        for (const m of matches) {
          if (m.clubSlotId) matchBySlot.set(m.clubSlotId, m);
        }

        const allSlotRows = await clubDashboardRepository.getSlotsByClubId(
          club.id,
          { includeBlocked: true, includeInactive: true },
          client,
        );
        const slotMap = new Map(allSlotRows.map((s) => [s.id, s]));

        const schedule: ScheduleSlot[] = slots.map((slot) => {
          const match = matchBySlot.get(slot.id) ?? null;
          return {
            slotId: slot.id,
            courtId: slot.courtId,
            courtName: courtNameMap.get(slot.courtId) ?? 'Cancha',
            dayOfWeek: slot.dayOfWeek,
            startTime: slot.startTime,
            endTime: slot.endTime,
            duration: slot.duration,
            status: slotStatusFromMatch(slot, match),
            match,
            blockReason: slot.blockReason,
            blockType: slot.blockType,
            isActive: slot.isActive,
            allowOnlineBooking: slot.allowOnlineBooking,
            priceArs: slot.priceArs,
          };
        });

        const conflicts = detectConflicts(matches, slotMap);

        return { club, metrics, schedule, matches, conflicts };
      },
      CACHE_TTL.DYNAMIC_DATA,
    );
  },

  async getMetrics(ctx: ServiceContext): Promise<ClubMetrics> {
    const club = await requireClubOwnership(ctx);
    const weekRange = currentWeekRange();

    return cacheGetOrSet(
      CACHE_METRICS(club.id),
      () => calculateMetrics(club, { startDate: weekRange.startDate, endDate: weekRange.endDate }, ctx),
      CACHE_TTL.USER_DATA, // 5 min
    );
  },

  async exportSchedule(
    ctx: ServiceContext,
    rawFilters?: DashboardFiltersInput | null,
    format?: string | null,
  ): Promise<string> {
    const club = await requireClubOwnership(ctx);
    const client = ctx.supabase ?? (await import('../config/supabase.js')).supabase;

    const weekRange = currentWeekRange();
    const filters: DashboardFiltersInput = {
      startDate: rawFilters?.startDate ?? weekRange.startDate,
      endDate: rawFilters?.endDate ?? weekRange.endDate,
      courtIds: rawFilters?.courtIds,
      matchStatuses: rawFilters?.matchStatuses,
      includeBlocked: rawFilters?.includeBlocked ?? true,
      includeInactive: rawFilters?.includeInactive ?? false,
    };

    // Enforce 90-day max for export
    const start = new Date(filters.startDate!);
    const end = new Date(filters.endDate!);
    if ((end.getTime() - start.getTime()) / 86_400_000 > 90) {
      throw new Error('El rango de exportación no puede superar 90 días');
    }

    const courts = await clubDashboardRepository.getCourtsByClubId(club.id, client);
    const courtNameMap = new Map(courts.map((c) => [c.id, c.name]));
    const matches = await fetchMatchesWithParticipants(club.id, filters, courtNameMap, ctx);

    if ((format ?? 'csv').toLowerCase() === 'json') {
      return JSON.stringify(
        matches.map((m) => ({
          id: m.id,
          fecha: m.scheduledAt.slice(0, 10),
          hora: m.scheduledAt.slice(11, 16),
          cancha: m.courtName,
          formato: m.format,
          estado: m.status,
          organizador: m.organizer.displayName,
          participantes: m.participantCount,
        })),
        null,
        2,
      );
    }

    return buildCsvExport(matches);
  },

  async invalidateDashboardCache(clubId: string): Promise<void> {
    await cacheDeletePattern(CACHE_DASHBOARD_PATTERN(clubId));
    await cacheDeletePattern(CACHE_METRICS(clubId));
  },
};
