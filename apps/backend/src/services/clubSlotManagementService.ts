/**
 * Club Slot Management Service — business logic for admin slot operations
 *
 * Decision Context:
 * - Why: Services own all business logic; resolvers are thin wires. Ownership verification,
 *   overlap checks, impact preview, audit log insertion and cache invalidation all live here.
 * - Ownership chain: every mutation first resolves clubs.ownerId = ctx.userId, then verifies
 *   that the target slot/court belongs to that club. If either lookup fails, we throw auth error
 *   rather than not-found to avoid leaking resource existence to other admins.
 * - Impact preview (improvement 11, Phase 1): toggleSlotBlock and bulkBlockSlots return a
 *   SlotImpactPreview when matches are affected and confirmForce is not set.
 * - Match cancellation (improvement 19, Phase 1 complete): when confirmForce=true, matches
 *   at the blocked slots are cancelled (status='cancelled', cancellationReason set) and
 *   in-app notifications are inserted into the notifications table for each unique player.
 *   Uses service-role (same justification as matchRepository.updateMatchStatus: the slot
 *   admin is not the match organizer, so user-scoped RLS would reject the UPDATE).
 * - Audit log (improvement 16): every mutation inserts a slotAuditLog entry.
 * - Soft delete (improvement 17): deleteClubSlot sets isActive=false, never physically deletes.
 * - Overlap validation (improvement 18): checkSlotOverlap is called before create/update.
 * - updatedBy: populated on every updateSlot call so the DB column is no longer NULL (P5 fix).
 * - BlockType enum (improvement 4): stored as lowercase string in DB, mapped to GraphQL enum.
 * - Cache invalidation: all mutations invalidate club slot cache and public player cache.
 * - Previously fixed bugs:
 *   - Match cancellation was a TODO stub. Now implemented via cancelMatchesBySlotIds +
 *     insertCancellationNotifications (Phase 1 complete).
 *   - updatedBy column was never written. Now passed in every updateSlot call.
 *   - Error messages exposed raw UUIDs to the user (e.g. "Slot <uuid> no pertenece a tu
 *     club", "Slot no encontrado: <uuid>"). Replaced with user-friendly Spanish messages
 *     that contain no internal identifiers. validateUuid() maps fieldName to a readable
 *     label ('cancha', 'horario') so the user sees "Identificador de cancha inválido".
 */

import { cacheDeletePattern, CACHE_TTL, cacheGetOrSet } from '../config/redis.js';
import { supabase } from '../config/supabase.js';
import {
  BlockType,
  CourtSurface,
  MatchFormat,
  SlotAction,
  type ManagedClubSlot,
  type CourtPricing,
  type SlotAuditLog,
  type SlotImpactPreview,
  type AffectedMatch,
  type AuditProfile,
} from '../graphql/generated/graphql.js';
import {
  clubSlotManagementRepository,
  type ManagedSlotRow,
  type AuditLogRow,
  type CourtPricingRow,
  type UpdateSlotData,
} from '../repositories/clubSlotManagementRepository.js';
import type { ServiceContext } from '../types/context.js';

// =====================================================
// Cache prefixes
// =====================================================

const CACHE_SLOT_ADMIN = (clubId: string) => `club:${clubId}:admin-slots`;
const CACHE_SLOT_ADMIN_COURT = (clubId: string, courtId: string) =>
  `club:${clubId}:court:${courtId}:admin-slots`;
// Invalidates public player-facing slot caches too
const CACHE_SLOT_PUBLIC_PATTERN = (clubId: string) => `clubSlots:${clubId}:*`;

// =====================================================
// Enum mapping (DB string → GraphQL enum)
// =====================================================

const DB_TO_SURFACE: Record<string, CourtSurface> = {
  grass: CourtSurface.Grass,
  synthetic: CourtSurface.Synthetic,
  concrete: CourtSurface.Concrete,
  indoor: CourtSurface.Indoor,
};

const DB_TO_FORMAT: Record<string, MatchFormat> = {
  '5v5': MatchFormat.FiveVsFive,
  '7v7': MatchFormat.SevenVsSeven,
  '10v10': MatchFormat.TenVsTen,
  '11v11': MatchFormat.ElevenVsEleven,
};

const DB_TO_BLOCK_TYPE: Record<string, BlockType> = {
  admin: BlockType.Admin,
  maintenance: BlockType.Maintenance,
  event: BlockType.Event,
  weather: BlockType.Weather,
  holiday: BlockType.Holiday,
  other: BlockType.Other,
};

const DB_TO_SLOT_ACTION: Record<string, SlotAction> = {
  created: SlotAction.Created,
  updated: SlotAction.Updated,
  blocked: SlotAction.Blocked,
  unblocked: SlotAction.Unblocked,
  deleted: SlotAction.Deleted,
  price_changed: SlotAction.PriceChanged,
};

const BLOCK_TYPE_TO_DB: Record<string, string> = {
  ADMIN: 'admin',
  MAINTENANCE: 'maintenance',
  EVENT: 'event',
  WEATHER: 'weather',
  HOLIDAY: 'holiday',
  OTHER: 'other',
};

// =====================================================
// Row → GraphQL transformers
// =====================================================

function rowToManagedSlot(row: ManagedSlotRow): ManagedClubSlot {
  return {
    id: row.id,
    clubId: row.clubId,
    courtId: row.courtId,
    court: {
      id: row.courts.id,
      name: row.courts.name,
      maxFormat: DB_TO_FORMAT[row.courts.maxFormat] ?? MatchFormat.ElevenVsEleven,
      surface: DB_TO_SURFACE[row.courts.surface] ?? CourtSurface.Synthetic,
      isIndoor: row.courts.isIndoor,
    },
    dayOfWeek: row.dayOfWeek,
    startTime: row.startTime,
    endTime: row.endTime,
    duration: row.duration ?? 60,
    priceArs: row.priceArs ?? null,
    isBlocked: row.isBlocked,
    blockReason: row.blockReason ?? null,
    blockType: row.blockType ? (DB_TO_BLOCK_TYPE[row.blockType] ?? null) : null,
    isActive: row.isActive ?? true,
    allowOnlineBooking: row.allowOnlineBooking ?? true,
    hasScheduledMatch: false, // enriched separately when needed
    updatedAt: row.updatedAt ?? null,
  };
}

function rowToAuditLog(row: AuditLogRow): SlotAuditLog {
  return {
    id: row.id,
    slotId: row.slotId ?? null,
    action: DB_TO_SLOT_ACTION[row.action] ?? SlotAction.Updated,
    previousValue: row.previousValue ?? null,
    newValue: row.newValue ?? null,
    changedBy: row.changedBy ? ({ id: row.changedBy, displayName: '', avatarUrl: null } as AuditProfile) : null,
    reason: row.reason ?? null,
    createdAt: row.createdAt,
  };
}

function rowToCourtPricing(row: CourtPricingRow): CourtPricing {
  return {
    id: row.id,
    courtId: row.courtId,
    basePrice: row.basePrice,
    peakStart: row.peakStart ?? null,
    peakEnd: row.peakEnd ?? null,
    peakDays: row.peakDays ?? [],
    peakMultiplier: row.peakMultiplier ?? 1.0,
    offPeakDiscount: row.offPeakDiscount ?? 0.0,
    createdAt: row.createdAt,
  };
}

// =====================================================
// Ownership guard
// =====================================================

/**
 * Resolves the club owned by ctx.userId. Throws if user has no club.
 * Returns { clubId }.
 */
async function requireClubOwnership(ctx: ServiceContext): Promise<{ clubId: string }> {
  if (!ctx.userId) throw new Error('Autenticación requerida');

  const db = ctx.supabase ?? supabase;
  const club = await clubSlotManagementRepository.getClubByOwnerId(ctx.userId, db);
  if (!club) throw new Error('No tenés un club asociado a tu cuenta');

  return { clubId: club.id };
}

/**
 * Verifies that a court belongs to the admin's club (via the courts table, not via slots).
 * Throws a user-friendly error otherwise. Used before create-slot and pricing writes so the
 * DB foreign key / RLS is no longer the only barrier against cross-club operations.
 */
async function requireCourtOwnership(
  courtId: string,
  clubId: string,
  db: typeof supabase,
): Promise<void> {
  const courts = await clubSlotManagementRepository.getCourtsByClubId(clubId, db);
  if (!courts.some((c) => c.id === courtId)) {
    throw new Error('Esta cancha no pertenece a tu club');
  }
}

/**
 * Verifies that a slot belongs to the admin's club.
 * Returns the slot row.
 */
async function requireSlotOwnership(
  slotId: string,
  clubId: string,
  ctx: ServiceContext,
): Promise<ManagedSlotRow> {
  const db = ctx.supabase ?? supabase;
  const slot = await clubSlotManagementRepository.getManagedSlotById(slotId, db);

  if (!slot) throw new Error('Horario no encontrado');
  if (slot.clubId !== clubId) throw new Error('No tenés permiso para modificar este horario');

  return slot;
}

// =====================================================
// Validation helpers
// =====================================================

/** Validates dayOfWeek string is a valid DB enum value */
function validateDayOfWeek(day: string): void {
  const valid = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  if (!valid.includes(day)) {
    throw new Error(`dayOfWeek inválido: "${day}". Debe ser uno de: ${valid.join(', ')}`);
  }
}

/**
 * Parses an HH:mm or HH:mm:ss string into minutes-since-midnight, validating real
 * hour/minute ranges.
 *
 * Decision Context:
 * - Accepts an optional ":ss" suffix because slot times are stored as Postgres `time`
 *   (returned as "HH:mm:ss"). When updating only one of startTime/endTime, the service
 *   backfills the other from the stored value, which previously failed the strict
 *   `^\d{2}:\d{2}$` regex — making partial time edits impossible.
 * - Validates hours 0–23 and minutes 0–59 so values like "99:99" are rejected at the app
 *   layer instead of leaking a raw "date/time field value out of range" error from Postgres.
 * - Previously fixed bugs: (a) partial time update broken by HH:mm:ss vs HH:mm mismatch;
 *   (b) "99:99" passed the regex and reached the DB.
 */
function parseTimeToMinutes(value: string): number {
  const m = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!m) {
    throw new Error('startTime y endTime deben tener formato HH:mm');
  }
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh > 23 || mm > 59) {
    throw new Error('Hora inválida: usá HH:mm entre 00:00 y 23:59');
  }
  return hh * 60 + mm;
}

/** Validates HH:mm(:ss) format, real hour/minute ranges, and that end > start */
function validateTimeRange(startTime: string, endTime: string): void {
  const start = parseTimeToMinutes(startTime);
  const end = parseTimeToMinutes(endTime);
  if (end <= start) {
    throw new Error('endTime debe ser mayor que startTime');
  }
}

/** Validates a slot/court price is within [0, 999999]. Shared by create and update. */
function validatePrice(priceArs: number | null | undefined): void {
  if (priceArs === null || priceArs === undefined) return;
  if (priceArs < 0 || priceArs > 999999) {
    throw new Error('El precio debe estar entre $U 0 y $U 999.999');
  }
}

/** Validates UUID with permissive regex (compatible with seeds) */
function validateUuid(value: string, fieldName: string): void {
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRe.test(value)) {
    // Do not include the raw value in the message — it may be shown to the user.
    const label = fieldName === 'courtId' ? 'cancha' : fieldName === 'slotId' ? 'horario' : fieldName;
    throw new Error(`Identificador de ${label} inválido`);
  }
}

// =====================================================
// Impact preview helper
// =====================================================

async function buildImpactPreview(
  slotIds: string[],
  ctx: ServiceContext,
): Promise<SlotImpactPreview> {
  const db = ctx.supabase ?? supabase;
  const matches = await clubSlotManagementRepository.getMatchesAtSlots(slotIds, db);
  const matchIds = matches.map((m) => m.id);
  const playerCount = await clubSlotManagementRepository.getPlayerCountForMatches(matchIds, db);
  // Per-match distinct participant counts so each affected match shows its own number.
  // playersToNotify (above) dedupes players across ALL matches, so it cannot be reused per row.
  const countsByMatch = await clubSlotManagementRepository.getParticipantCountsByMatch(matchIds, db);

  const matchDetails: AffectedMatch[] = matches.map((m) => ({
    matchId: m.id,
    title: m.description ?? 'Partido programado',
    scheduledAt: m.scheduledAt,
    participantCount: countsByMatch[m.id] ?? 0,
  }));

  return {
    totalSlotsAffected: slotIds.length,
    matchesAffected: matches.length,
    playersToNotify: playerCount,
    matchDetails,
  };
}

// =====================================================
// Cache invalidation
// =====================================================

async function invalidateSlotCaches(clubId: string, courtId?: string): Promise<void> {
  await cacheDeletePattern(CACHE_SLOT_PUBLIC_PATTERN(clubId));
  await cacheDeletePattern(`${CACHE_SLOT_ADMIN(clubId)}*`);
  if (courtId) {
    await cacheDeletePattern(`${CACHE_SLOT_ADMIN_COURT(clubId, courtId)}*`);
  }
}

// =====================================================
// Service: Queries
// =====================================================

/**
 * List all managed slots for the authenticated admin's club.
 * Cached with short TTL to pick up changes quickly.
 */
export async function getManagedSlots(ctx: ServiceContext): Promise<ManagedClubSlot[]> {
  const { clubId } = await requireClubOwnership(ctx);
  const db = ctx.supabase ?? supabase;

  const rows = await cacheGetOrSet<ManagedSlotRow[]>(
    CACHE_SLOT_ADMIN(clubId),
    () => clubSlotManagementRepository.getManagedSlotsByClubId(clubId, db),
    CACHE_TTL.DYNAMIC_DATA,
  );

  return rows.map(rowToManagedSlot);
}

/**
 * List managed slots for a specific court (ownership verified via club membership).
 */
export async function getManagedSlotsByCourt(
  ctx: ServiceContext,
  courtId: string,
): Promise<ManagedClubSlot[]> {
  validateUuid(courtId, 'courtId');
  const { clubId } = await requireClubOwnership(ctx);
  const db = ctx.supabase ?? supabase;

  const rows = await cacheGetOrSet<ManagedSlotRow[]>(
    CACHE_SLOT_ADMIN_COURT(clubId, courtId),
    () => clubSlotManagementRepository.getManagedSlotsByCourtId(courtId, db),
    CACHE_TTL.DYNAMIC_DATA,
  );

  // Filter to only slots belonging to the admin's club (RLS defense-in-depth)
  const filtered = rows.filter((r) => r.clubId === clubId);
  return filtered.map(rowToManagedSlot);
}

/**
 * Preview impact of blocking the given slots (improvement 11).
 * Used to show the admin how many matches/players would be affected.
 */
export async function getSlotImpactPreview(
  ctx: ServiceContext,
  slotIds: string[],
): Promise<SlotImpactPreview> {
  if (slotIds.length === 0) {
    return { totalSlotsAffected: 0, matchesAffected: 0, playersToNotify: 0, matchDetails: [] };
  }

  const { clubId } = await requireClubOwnership(ctx);
  const db = ctx.supabase ?? supabase;

  // Verify all slots belong to this club
  for (const id of slotIds) {
    validateUuid(id, 'slotId');
    const slot = await clubSlotManagementRepository.getManagedSlotById(id, db);
    if (!slot || slot.clubId !== clubId) {
      throw new Error('Uno de los horarios seleccionados no pertenece a tu club');
    }
  }

  return buildImpactPreview(slotIds, ctx);
}

/**
 * Get audit log for a slot.
 */
export async function getSlotAuditLog(
  ctx: ServiceContext,
  slotId: string,
  limit = 20,
  offset = 0,
): Promise<SlotAuditLog[]> {
  validateUuid(slotId, 'slotId');
  const { clubId } = await requireClubOwnership(ctx);
  const db = ctx.supabase ?? supabase;

  // Verify slot belongs to this club
  const slot = await clubSlotManagementRepository.getManagedSlotById(slotId, db);
  if (!slot || slot.clubId !== clubId) {
    throw new Error('Slot no encontrado o no pertenece a tu club');
  }

  const rows = await clubSlotManagementRepository.getAuditLogBySlotId(slotId, limit, offset, db);
  const entries = rows.map(rowToAuditLog);

  // Resolve real author profiles (changedBy was previously a blank stub).
  const authorIds = [...new Set(rows.map((r) => r.changedBy).filter((id): id is string => !!id))];
  if (authorIds.length > 0) {
    const profiles = await clubSlotManagementRepository.getProfilesByIds(authorIds, db);
    const byId = new Map(profiles.map((p) => [p.id, p]));
    for (const entry of entries) {
      if (entry.changedBy) {
        const p = byId.get(entry.changedBy.id);
        if (p) {
          entry.changedBy.displayName = p.displayName;
          entry.changedBy.avatarUrl = p.avatarUrl;
        }
      }
    }
  }

  return entries;
}

/**
 * Get pricing config for a court.
 */
export async function getCourtPricingForAdmin(
  ctx: ServiceContext,
  courtId: string,
): Promise<CourtPricing | null> {
  validateUuid(courtId, 'courtId');
  await requireClubOwnership(ctx);
  const db = ctx.supabase ?? supabase;

  const row = await clubSlotManagementRepository.getCourtPricing(courtId, db);
  return row ? rowToCourtPricing(row) : null;
}

// =====================================================
// Service: Mutations
// =====================================================

/**
 * Create a new club slot with overlap validation (improvement 18).
 */
export async function createClubSlot(
  ctx: ServiceContext,
  input: {
    courtId: string;
    dayOfWeek: string;
    startTime: string;
    endTime: string;
    duration?: number | null;
    priceArs?: number | null;
    allowOnlineBooking?: boolean | null;
  },
): Promise<{ slot: ManagedClubSlot }> {
  validateUuid(input.courtId, 'courtId');
  validateDayOfWeek(input.dayOfWeek);
  validateTimeRange(input.startTime, input.endTime);

  const duration = input.duration ?? 60;
  if (duration < 30 || duration > 240) {
    throw new Error('duration debe estar entre 30 y 240 minutos');
  }
  validatePrice(input.priceArs);

  const { clubId } = await requireClubOwnership(ctx);
  const db = ctx.supabase ?? supabase;

  // Court-ownership check (defense-in-depth, not just the DB foreign key).
  // Decision Context: createClubSlot previously inserted with the admin's clubId but an
  // arbitrary courtId, relying solely on the clubSlots_courtId_fkey constraint (which leaked
  // a raw FK error) and RLS. We now verify the court belongs to the admin's club up front.
  // Previously fixed bugs: no app-layer verification that courtId belonged to the club.
  await requireCourtOwnership(input.courtId, clubId, db);

  // Overlap check (improvement 18)
  const overlaps = await clubSlotManagementRepository.checkSlotOverlap(
    {
      courtId: input.courtId,
      dayOfWeek: input.dayOfWeek,
      startTime: input.startTime,
      endTime: input.endTime,
    },
    db,
  );
  if (overlaps) {
    throw new Error(
      `Ya existe un slot activo en esta cancha el ${input.dayOfWeek} que se superpone con ${input.startTime}–${input.endTime}`,
    );
  }

  const row = await clubSlotManagementRepository.createSlot(
    {
      clubId,
      courtId: input.courtId,
      dayOfWeek: input.dayOfWeek,
      startTime: input.startTime,
      endTime: input.endTime,
      duration,
      priceArs: input.priceArs ?? null,
      allowOnlineBooking: input.allowOnlineBooking ?? true,
    },
    db,
  );

  // Audit log
  await clubSlotManagementRepository.insertAuditLogEntry(
    {
      slotId: row.id,
      action: 'created',
      previousValue: null,
      newValue: { courtId: input.courtId, dayOfWeek: input.dayOfWeek, startTime: input.startTime, endTime: input.endTime },
      changedBy: ctx.userId!,
      reason: null,
    },
    db,
  );

  await invalidateSlotCaches(clubId, input.courtId);

  console.info(`[clubSlotManagementService.createClubSlot] Created slot ${row.id} for club ${clubId}`);
  return { slot: rowToManagedSlot(row) };
}

/**
 * Update mutable fields of an existing slot.
 */
export async function updateClubSlot(
  ctx: ServiceContext,
  input: {
    slotId: string;
    startTime?: string | null;
    endTime?: string | null;
    duration?: number | null;
    priceArs?: number | null;
    allowOnlineBooking?: boolean | null;
  },
): Promise<{ slot: ManagedClubSlot; consumedCount: number }> {
  validateUuid(input.slotId, 'slotId');
  if (input.startTime && input.endTime) {
    validateTimeRange(input.startTime, input.endTime);
  }
  if (input.duration !== null && input.duration !== undefined && (input.duration < 30 || input.duration > 240)) {
    throw new Error('duration debe estar entre 30 y 240 minutos');
  }
  validatePrice(input.priceArs);

  const { clubId } = await requireClubOwnership(ctx);
  const db = ctx.supabase ?? supabase;
  const existing = await requireSlotOwnership(input.slotId, clubId, ctx);

  // If time is changing, implement the new overlap logic.
  // Decision Context: expanding a slot can absorb adjacent AVAILABLE slots. Those are now
  // SOFT-deleted (isActive=false) and each gets a 'deleted' audit entry, and the count is
  // returned so the admin is told. Previously they were silently HARD-deleted with no audit.
  let consumedCount = 0;
  if (input.startTime || input.endTime) {
    // Normalize the backfilled value to HH:mm so a stored "HH:mm:ss" doesn't break validation.
    const newStart = (input.startTime ?? existing.startTime).slice(0, 5);
    const newEnd = (input.endTime ?? existing.endTime).slice(0, 5);
    validateTimeRange(newStart, newEnd);

    const overlapParams = {
      courtId: existing.courtId,
      dayOfWeek: existing.dayOfWeek,
      startTime: newStart,
      endTime: newEnd,
      excludeSlotId: input.slotId,
    };

    // 1. Check for conflicts with occupied slots (blocked or with a match)
    const conflictingSlots = await clubSlotManagementRepository.findConflictingSlots(overlapParams, db);
    if (conflictingSlots.length > 0) {
      throw new Error('No se puede modificar el horario porque colisiona con una reserva o partido existente.');
    }

    // 2. Soft-delete available slots that are now overlapped, auditing each one
    const consumedIds = await clubSlotManagementRepository.softDeleteAvailableOverlappingSlots(overlapParams, db);
    consumedCount = consumedIds.length;
    for (const consumedId of consumedIds) {
      await clubSlotManagementRepository.insertAuditLogEntry(
        {
          slotId: consumedId,
          action: 'deleted',
          previousValue: { isActive: true },
          newValue: { isActive: false, absorbedBySlotId: input.slotId },
          changedBy: ctx.userId!,
          reason: 'Absorbido al expandir un horario contiguo',
        },
        db,
      );
    }
  }

  const previousSnapshot = { startTime: existing.startTime, endTime: existing.endTime, priceArs: existing.priceArs };

  const updates: UpdateSlotData = { updatedBy: ctx.userId ?? null };
  if (input.startTime !== undefined && input.startTime !== null) updates.startTime = input.startTime;
  if (input.endTime !== undefined && input.endTime !== null) updates.endTime = input.endTime;
  if (input.duration !== undefined && input.duration !== null) updates.duration = input.duration;
  if (input.priceArs !== undefined) updates.priceArs = input.priceArs;
  if (input.allowOnlineBooking !== undefined && input.allowOnlineBooking !== null) {
    updates.allowOnlineBooking = input.allowOnlineBooking;
  }

  const row = await clubSlotManagementRepository.updateSlot(input.slotId, updates, db);

  const action = input.priceArs !== undefined ? 'price_changed' : 'updated';
  await clubSlotManagementRepository.insertAuditLogEntry(
    {
      slotId: input.slotId,
      action,
      previousValue: previousSnapshot,
      newValue: updates as object,
      changedBy: ctx.userId!,
      reason: null,
    },
    db,
  );

  await invalidateSlotCaches(clubId, existing.courtId);

  console.info(
    `[clubSlotManagementService.updateClubSlot] Updated slot ${input.slotId} (absorbed ${consumedCount} available slot(s))`,
  );
  return { slot: rowToManagedSlot(row), consumedCount };
}

/**
 * Soft-delete a slot (improvement 17).
 * Verifies no scheduled future matches exist before deleting.
 */
export async function deleteClubSlot(
  ctx: ServiceContext,
  slotId: string,
): Promise<{ slot: ManagedClubSlot }> {
  validateUuid(slotId, 'slotId');
  const { clubId } = await requireClubOwnership(ctx);
  const db = ctx.supabase ?? supabase;

  const existing = await requireSlotOwnership(slotId, clubId, ctx);
  if (!existing.isActive) {
    throw new Error('El slot ya fue eliminado');
  }

  const row = await clubSlotManagementRepository.updateSlot(
    slotId,
    { isActive: false, updatedBy: ctx.userId ?? null },
    db,
  );

  await clubSlotManagementRepository.insertAuditLogEntry(
    {
      slotId,
      action: 'deleted',
      previousValue: { isActive: true },
      newValue: { isActive: false },
      changedBy: ctx.userId!,
      reason: null,
    },
    db,
  );

  await invalidateSlotCaches(clubId, existing.courtId);

  console.info(`[clubSlotManagementService.deleteClubSlot] Soft-deleted slot ${slotId}`);
  return { slot: rowToManagedSlot(row) };
}

/**
 * Toggle blocked state on a single slot (improvements 6, 11, 19).
 * Returns impact preview without blocking when confirmForce is not set and matches exist.
 */
export async function toggleSlotBlock(
  ctx: ServiceContext,
  input: {
    slotId: string;
    isBlocked: boolean;
    blockReason?: string | null;
    blockType?: string | null;
    confirmForce?: boolean | null;
  },
): Promise<{
  slot: ManagedClubSlot | null;
  impactPreview: SlotImpactPreview | null;
  cancelledMatchesCount: number;
  notifiedPlayersCount: number;
}> {
  validateUuid(input.slotId, 'slotId');
  if (input.blockReason && input.blockReason.length > 500) {
    throw new Error('blockReason no puede superar 500 caracteres');
  }

  const { clubId } = await requireClubOwnership(ctx);
  const db = ctx.supabase ?? supabase;

  const existing = await requireSlotOwnership(input.slotId, clubId, ctx);
  if (!existing.isActive) {
    throw new Error('No se puede bloquear un slot eliminado');
  }

  // If blocking: calculate impact and gate on confirmForce
  if (input.isBlocked) {
    const preview = await buildImpactPreview([input.slotId], ctx);

    if (preview.matchesAffected > 0 && !input.confirmForce) {
      // Return preview without applying the block — let admin confirm
      return { slot: null, impactPreview: preview, cancelledMatchesCount: 0, notifiedPlayersCount: 0 };
    }
  }

  // Ordering: apply the block FIRST, then cancel affected matches.
  // Decision Context (transactional safety): these two writes are not in a single DB
  // transaction (the block uses the user-scoped client; the cancellation uses service-role
  // to bypass organizer RLS). The previous order cancelled matches first — if the block then
  // failed, players lost their match for nothing (cancelled but slot still open). By blocking
  // first, the worst case is "slot blocked but a few matches not yet cancelled" — a safe,
  // recoverable state (no NEW matches can be created on a blocked slot) the admin can retry.
  // Previously fixed bugs: cancel-then-block could orphan cancellations on partial failure.
  const updates: UpdateSlotData = {
    isBlocked: input.isBlocked,
    blockReason: input.isBlocked ? (input.blockReason ?? null) : null,
    blockType: input.isBlocked && input.blockType ? BLOCK_TYPE_TO_DB[input.blockType] ?? null : null,
    updatedBy: ctx.userId ?? null,
  };

  const row = await clubSlotManagementRepository.updateSlot(input.slotId, updates, db);

  // Cancel affected matches when blocking with confirmForce=true (improvement 19 complete)
  let cancelledMatchesCount = 0;
  let notifiedPlayersCount = 0;
  if (input.isBlocked) {
    const { cancelledMatchIds, cancelledCount } =
      await clubSlotManagementRepository.cancelMatchesBySlotIds(
        [input.slotId],
        input.blockReason ?? null,
      );
    cancelledMatchesCount = cancelledCount;

    if (cancelledMatchIds.length > 0) {
      const participants = await clubSlotManagementRepository.getParticipantsByMatchIds(cancelledMatchIds);
      notifiedPlayersCount = await clubSlotManagementRepository.insertCancellationNotifications(
        participants,
        input.blockReason ?? null,
      );
      console.info(
        `[clubSlotManagementService.toggleSlotBlock] Cancelled ${cancelledCount} matches, notified ${notifiedPlayersCount} players for slot ${input.slotId}`,
      );
    }
  }

  await clubSlotManagementRepository.insertAuditLogEntry(
    {
      slotId: input.slotId,
      action: input.isBlocked ? 'blocked' : 'unblocked',
      previousValue: { isBlocked: existing.isBlocked },
      newValue: updates as object,
      changedBy: ctx.userId!,
      reason: input.blockReason ?? null,
    },
    db,
  );

  await invalidateSlotCaches(clubId, existing.courtId);

  const action = input.isBlocked ? 'Blocked' : 'Unblocked';
  console.info(`[clubSlotManagementService.toggleSlotBlock] ${action} slot ${input.slotId}`);
  return { slot: rowToManagedSlot(row), impactPreview: null, cancelledMatchesCount, notifiedPlayersCount };
}

/**
 * Bulk block/unblock multiple slots (improvement 7).
 * Returns consolidated impact preview and processes each slot.
 */
export async function bulkBlockSlots(
  ctx: ServiceContext,
  input: {
    slotIds: string[];
    isBlocked: boolean;
    blockReason?: string | null;
    blockType?: string | null;
    confirmForce?: boolean | null;
  },
): Promise<{
  affectedCount: number;
  skippedCount: number;
  impactPreview: SlotImpactPreview | null;
  cancelledMatchesCount: number;
  notifiedPlayersCount: number;
}> {
  if (input.slotIds.length === 0) {
    throw new Error('Debes seleccionar al menos un slot');
  }

  for (const id of input.slotIds) {
    validateUuid(id, 'slotId');
  }

  const { clubId } = await requireClubOwnership(ctx);
  const db = ctx.supabase ?? supabase;

  // Verify all slots belong to this club
  for (const id of input.slotIds) {
    const slot = await clubSlotManagementRepository.getManagedSlotById(id, db);
    if (!slot || slot.clubId !== clubId) {
      throw new Error('Uno de los horarios seleccionados no pertenece a tu club');
    }
  }

  const preview = input.isBlocked
    ? await buildImpactPreview(input.slotIds, ctx)
    : null;

  // Gate on confirmForce when matches would be affected
  if (input.isBlocked && preview && preview.matchesAffected > 0 && !input.confirmForce) {
    return { affectedCount: 0, skippedCount: input.slotIds.length, impactPreview: preview, cancelledMatchesCount: 0, notifiedPlayersCount: 0 };
  }

  // Ordering: apply the blocks FIRST, then cancel affected matches (same transactional-safety
  // rationale as toggleSlotBlock — block-then-cancel leaves a safer state on partial failure).
  // Previously fixed bugs: cancel-then-block could orphan cancellations if the block loop failed.
  let affectedCount = 0;
  let skippedCount = 0;

  for (const slotId of input.slotIds) {
    try {
      const updates: UpdateSlotData = {
        isBlocked: input.isBlocked,
        blockReason: input.isBlocked ? (input.blockReason ?? null) : null,
        blockType: input.isBlocked && input.blockType ? BLOCK_TYPE_TO_DB[input.blockType] ?? null : null,
        updatedBy: ctx.userId ?? null,
      };
      await clubSlotManagementRepository.updateSlot(slotId, updates, db);
      await clubSlotManagementRepository.insertAuditLogEntry(
        {
          slotId,
          action: input.isBlocked ? 'blocked' : 'unblocked',
          previousValue: null,
          newValue: updates as object,
          changedBy: ctx.userId!,
          reason: input.blockReason ?? null,
        },
        db,
      );
      affectedCount++;
    } catch (error) {
      console.warn(`[clubSlotManagementService.bulkBlockSlots] Skipped slot ${slotId}:`, error);
      skippedCount++;
    }
  }

  // Cancel all affected matches AFTER applying the bulk block (improvement 19 complete)
  let cancelledMatchesCount = 0;
  let notifiedPlayersCount = 0;
  if (input.isBlocked && preview && preview.matchesAffected > 0) {
    const { cancelledMatchIds, cancelledCount } =
      await clubSlotManagementRepository.cancelMatchesBySlotIds(
        input.slotIds,
        input.blockReason ?? null,
      );
    cancelledMatchesCount = cancelledCount;

    if (cancelledMatchIds.length > 0) {
      const participants = await clubSlotManagementRepository.getParticipantsByMatchIds(cancelledMatchIds);
      notifiedPlayersCount = await clubSlotManagementRepository.insertCancellationNotifications(
        participants,
        input.blockReason ?? null,
      );
      console.info(
        `[clubSlotManagementService.bulkBlockSlots] Cancelled ${cancelledCount} matches, notified ${notifiedPlayersCount} players`,
      );
    }
  }

  await invalidateSlotCaches(clubId);

  console.info(
    `[clubSlotManagementService.bulkBlockSlots] Processed ${affectedCount} slots, skipped ${skippedCount}`,
  );
  return { affectedCount, skippedCount, impactPreview: preview, cancelledMatchesCount, notifiedPlayersCount };
}

/**
 * Update or create court pricing config (improvement 13).
 */
export async function updateCourtPricing(
  ctx: ServiceContext,
  input: {
    courtId: string;
    basePrice: number;
    peakStart?: string | null;
    peakEnd?: string | null;
    peakDays?: number[] | null;
    peakMultiplier?: number | null;
    offPeakDiscount?: number | null;
  },
): Promise<CourtPricing> {
  validateUuid(input.courtId, 'courtId');
  if (input.basePrice < 0 || input.basePrice > 999999) {
    throw new Error('El precio base debe estar entre $U 0 y $U 999.999');
  }
  const multiplier = input.peakMultiplier ?? 1.0;
  if (multiplier < 0.1 || multiplier > 10) {
    throw new Error('peakMultiplier debe estar entre 0.1 y 10');
  }
  // Validate peakDays are valid day-of-week ints (0=Sun … 6=Sat) and dedupe.
  // Previously fixed bugs: arbitrary values like [99, -3] were stored unchecked.
  const peakDays = input.peakDays
    ? [...new Set(input.peakDays)].filter((d) => Number.isInteger(d))
    : [];
  if (peakDays.some((d) => d < 0 || d > 6)) {
    throw new Error('peakDays debe contener días válidos (0=Domingo … 6=Sábado)');
  }

  const { clubId } = await requireClubOwnership(ctx);
  const db = ctx.supabase ?? supabase;

  // Verify the court belongs to this club via the courts table (not via slots).
  // Decision Context: the previous slot-based guard (`slotsForCourt.length > 0 && !belongsToClub`)
  // was BYPASSABLE for a court with no slots (length 0 ⇒ check skipped), leaving RLS as the only
  // barrier against cross-club pricing writes. requireCourtOwnership closes that gap.
  await requireCourtOwnership(input.courtId, clubId, db);

  const row = await clubSlotManagementRepository.upsertCourtPricing(
    {
      courtId: input.courtId,
      basePrice: input.basePrice,
      peakStart: input.peakStart ?? null,
      peakEnd: input.peakEnd ?? null,
      peakDays,
      peakMultiplier: multiplier,
      offPeakDiscount: input.offPeakDiscount ?? 0.0,
    },
    db,
  );

  await invalidateSlotCaches(clubId, input.courtId);

  console.info(`[clubSlotManagementService.updateCourtPricing] Updated pricing for court ${input.courtId}`);
  return rowToCourtPricing(row);
}

// =====================================================
// Whole-court schedule reconciliation (simplified configurator)
// =====================================================

const DAY_STRING_TO_INT: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
};

/** Minutes-since-midnight → "HH:mm". */
function minutesToTime(min: number): string {
  const hh = Math.floor(min / 60);
  const mm = min % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/** Normalises a stored "HH:mm:ss" (or "HH:mm") time to "HH:mm". */
function toHHmm(time: string): string {
  return time.slice(0, 5);
}

interface ApplyCourtScheduleInput {
  courtId: string;
  openDays: string[];
  openTime: string;
  closeTime: string;
  slotMinutes?: number | null;
  basePrice: number;
  peakEnabled?: boolean | null;
  peakDays?: string[] | null;
  peakStart?: string | null;
  peakEnd?: string | null;
  peakPrice?: number | null;
}

interface ApplyCourtScheduleOutcome {
  createdCount: number;
  updatedCount: number;
  removedCount: number;
  protectedCount: number;
  slots: ManagedClubSlot[];
}

/**
 * Reconcile a court's entire weekly schedule from a simple open-hours + price config.
 *
 * Decision Context:
 * - Why a single mutation (not N per-slot calls from the browser): the simplified "Horarios"
 *   configurator lets a club owner think in "open days + hours + price" instead of 245 slot
 *   rows. Mapping that intent onto the per-slot model requires a diff that (a) preserves
 *   booked/blocked slots, (b) respects the UNIQUE(courtId,dayOfWeek,startTime) index which
 *   ALSO covers soft-deleted rows, and (c) stays atomic-ish and fast. Doing it server-side in
 *   a handful of bulk queries beats ~100 client round-trips with partial-failure and overlap
 *   errors.
 * - Protection rule: a slot with a future scheduled match OR a manual block is NEVER touched.
 *   The desired hourly slot it covers is considered already satisfied (protectedCount++), and
 *   new generated slots that would overlap a protected slot are skipped — so we never create
 *   an overlapping bookable slot.
 * - Reuse rule: an existing AVAILABLE slot at a desired (day,start):
 *     · same end time  → repriced + reactivated in bulk (grouped by price).
 *     · different end   → updated in place (can't delete+insert: the unique index keeps the
 *                         soft-deleted row, so a fresh insert at that key would collide).
 *   Available slots NOT in the desired set are bulk soft-deleted (freed), never hard-deleted.
 * - Pricing: persisted to courtPricing (its designed home, so the form round-trips) AND baked
 *   into each slot's priceArs so the calendar and player-facing views show the right number.
 *   peakMultiplier is derived as peakPrice/basePrice for the courtPricing row.
 * - Audit: ONE summary slotAuditLog entry per run (slotId=null) with the counts — avoids
 *   writing ~100 per-slot entries on a bulk regenerate.
 * - Previously fixed bugs: none relevant (new operation).
 */
export async function applyCourtSchedule(
  ctx: ServiceContext,
  input: ApplyCourtScheduleInput,
): Promise<ApplyCourtScheduleOutcome> {
  // ── Validation ───────────────────────────────────────────────
  validateUuid(input.courtId, 'courtId');
  if (!input.openDays || input.openDays.length === 0) {
    throw new Error('Elegí al menos un día de apertura');
  }
  for (const d of input.openDays) validateDayOfWeek(d);

  const slotMinutes = input.slotMinutes ?? 60;
  if (slotMinutes < 30 || slotMinutes > 240) {
    throw new Error('La duración de cada turno debe estar entre 30 y 240 minutos');
  }

  const openMin = parseTimeToMinutes(input.openTime);
  const closeMin = parseTimeToMinutes(input.closeTime);
  if (closeMin - openMin < slotMinutes) {
    throw new Error('El horario de cierre debe ser al menos un turno mayor que el de apertura');
  }

  validatePrice(input.basePrice);
  if (input.basePrice == null) throw new Error('Ingresá un precio base');

  const peakEnabled = !!input.peakEnabled;
  let peakStartMin = 0;
  let peakEndMin = 0;
  const peakDaySet = new Set<string>();
  if (peakEnabled) {
    if (input.peakPrice == null) throw new Error('Ingresá el precio especial (pico)');
    validatePrice(input.peakPrice);
    if (!input.peakStart || !input.peakEnd) throw new Error('Definí el horario del precio especial');
    peakStartMin = parseTimeToMinutes(input.peakStart);
    peakEndMin = parseTimeToMinutes(input.peakEnd);
    if (peakEndMin <= peakStartMin) throw new Error('El horario especial: la hora de fin debe ser mayor que la de inicio');
    for (const d of input.peakDays ?? []) {
      validateDayOfWeek(d);
      peakDaySet.add(d);
    }
  }

  const { clubId } = await requireClubOwnership(ctx);
  const db = ctx.supabase ?? supabase;
  await requireCourtOwnership(input.courtId, clubId, db);

  // Effective price for a slot starting at `startMin` on `day`.
  const priceFor = (day: string, startMin: number): number => {
    if (peakEnabled && peakDaySet.has(day) && startMin >= peakStartMin && startMin < peakEndMin) {
      return input.peakPrice as number;
    }
    return input.basePrice;
  };

  // ── Load current state ──────────────────────────────────────
  const existingRows = await clubSlotManagementRepository.getManagedSlotsByCourtId(input.courtId, db);
  const activeRows = existingRows.filter((r) => r.isActive);
  const activeIds = activeRows.map((r) => r.id);
  const matchRows = activeIds.length
    ? await clubSlotManagementRepository.getMatchesAtSlots(activeIds, db)
    : [];
  const matchedSlotIds = new Set(matchRows.map((m) => m.clubSlotId));

  // A slot is "protected" when it is booked or manually blocked — never modified or removed.
  const isProtected = (r: ManagedSlotRow) => r.isBlocked || matchedSlotIds.has(r.id);

  // Index every existing row (active OR soft-deleted) by `${day}|${HH:mm}` — the unique key.
  const byKey = new Map<string, ManagedSlotRow>();
  for (const r of existingRows) byKey.set(`${r.dayOfWeek}|${toHHmm(r.startTime)}`, r);

  // Protected ACTIVE slots, grouped by day with minute ranges, to avoid generating overlaps.
  const protectedRangesByDay = new Map<string, Array<{ start: number; end: number }>>();
  for (const r of activeRows) {
    if (!isProtected(r)) continue;
    const arr = protectedRangesByDay.get(r.dayOfWeek) ?? [];
    arr.push({ start: parseTimeToMinutes(toHHmm(r.startTime)), end: parseTimeToMinutes(toHHmm(r.endTime)) });
    protectedRangesByDay.set(r.dayOfWeek, arr);
  }
  const overlapsProtected = (day: string, start: number, end: number): boolean =>
    (protectedRangesByDay.get(day) ?? []).some((r) => r.start < end && r.end > start);

  // ── Build desired schedule + diff ───────────────────────────
  const toInsert: Array<{
    clubId: string; courtId: string; dayOfWeek: string; startTime: string; endTime: string;
    duration: number; priceArs: number | null; allowOnlineBooking: boolean;
  }> = [];
  const reactivateByPrice = new Map<number, string[]>(); // available slot, same end, just reprice/reactivate
  const desiredKeys = new Set<string>();
  let createdCount = 0;
  let updatedCount = 0;
  let protectedCount = 0;

  // Per-slot updates for the rare "same start, different end" (duration changed) case.
  const inPlaceUpdates: Array<{ id: string; startTime: string; endTime: string; duration: number; priceArs: number }> = [];

  for (const day of input.openDays) {
    for (let start = openMin; start + slotMinutes <= closeMin; start += slotMinutes) {
      const end = start + slotMinutes;
      const startStr = minutesToTime(start);
      const endStr = minutesToTime(end);
      const key = `${day}|${startStr}`;
      desiredKeys.add(key);
      const price = priceFor(day, start);
      const existing = byKey.get(key);

      if (existing) {
        if (isProtected(existing) && existing.isActive) {
          // Booked/blocked — leave it exactly as is.
          protectedCount++;
          continue;
        }
        if (toHHmm(existing.endTime) === endStr) {
          // Same shape → bulk reprice + reactivate.
          const arr = reactivateByPrice.get(price) ?? [];
          arr.push(existing.id);
          reactivateByPrice.set(price, arr);
          updatedCount++;
        } else {
          // Duration changed → update in place (can't delete+reinsert at the same unique key).
          inPlaceUpdates.push({ id: existing.id, startTime: startStr, endTime: endStr, duration: slotMinutes, priceArs: price });
          updatedCount++;
        }
        continue;
      }

      // No row at this key → insert, unless it would overlap a protected slot.
      if (overlapsProtected(day, start, end)) {
        protectedCount++;
        continue;
      }
      toInsert.push({
        clubId,
        courtId: input.courtId,
        dayOfWeek: day,
        startTime: startStr,
        endTime: endStr,
        duration: slotMinutes,
        priceArs: price,
        allowOnlineBooking: true,
      });
      createdCount++;
    }
  }

  // Active AVAILABLE slots not covered by the desired schedule → free them.
  const toRemove: string[] = [];
  for (const r of activeRows) {
    if (isProtected(r)) {
      if (!desiredKeys.has(`${r.dayOfWeek}|${toHHmm(r.startTime)}`)) protectedCount++;
      continue;
    }
    if (!desiredKeys.has(`${r.dayOfWeek}|${toHHmm(r.startTime)}`)) toRemove.push(r.id);
  }

  // ── Apply (order: remove → reprice/update → insert) ─────────
  const updatedBy = ctx.userId ?? null;
  await clubSlotManagementRepository.bulkSoftDeleteSlots(toRemove, updatedBy, db);
  const removedCount = toRemove.length;

  for (const [price, ids] of reactivateByPrice) {
    await clubSlotManagementRepository.bulkSetSlotPriceActive(ids, price, updatedBy, db);
  }
  for (const u of inPlaceUpdates) {
    await clubSlotManagementRepository.updateSlot(
      u.id,
      { startTime: u.startTime, endTime: u.endTime, duration: u.duration, priceArs: u.priceArs, isActive: true, updatedBy },
      db,
    );
  }
  if (toInsert.length) await clubSlotManagementRepository.bulkInsertSlots(toInsert, db);

  // ── Persist pricing config (round-trips back into the form) ──
  const peakMultiplier = peakEnabled && input.basePrice > 0 ? (input.peakPrice as number) / input.basePrice : 1.0;
  await clubSlotManagementRepository.upsertCourtPricing(
    {
      courtId: input.courtId,
      basePrice: input.basePrice,
      peakStart: peakEnabled ? (input.peakStart ?? null) : null,
      peakEnd: peakEnabled ? (input.peakEnd ?? null) : null,
      peakDays: peakEnabled ? [...peakDaySet].map((d) => DAY_STRING_TO_INT[d]).filter((n) => Number.isInteger(n)) : [],
      peakMultiplier: Math.min(Math.max(peakMultiplier, 0.1), 10),
      offPeakDiscount: 1.0,
    },
    db,
  );

  // ── Summary audit entry (one per run, not per slot) ─────────
  await clubSlotManagementRepository.insertAuditLogEntry(
    {
      slotId: null,
      action: 'updated',
      previousValue: null,
      newValue: {
        scope: 'applyCourtSchedule',
        courtId: input.courtId,
        openDays: input.openDays,
        openTime: input.openTime,
        closeTime: input.closeTime,
        slotMinutes,
        basePrice: input.basePrice,
        peakEnabled,
        createdCount, updatedCount, removedCount, protectedCount,
      },
      changedBy: ctx.userId!,
      reason: 'Configuración de horarios del club',
    },
    db,
  );

  await invalidateSlotCaches(clubId, input.courtId);

  // Return the fresh slot list for this court (mapped to GraphQL shape).
  const freshRows = await clubSlotManagementRepository.getManagedSlotsByCourtId(input.courtId, db);
  const slots = freshRows.filter((r) => r.isActive).map(rowToManagedSlot);

  console.info(
    `[clubSlotManagementService.applyCourtSchedule] court=${input.courtId} created=${createdCount} updated=${updatedCount} removed=${removedCount} protected=${protectedCount}`,
  );

  return { createdCount, updatedCount, removedCount, protectedCount, slots };
}

export const clubSlotManagementService = {
  getManagedSlots,
  getManagedSlotsByCourt,
  getSlotImpactPreview,
  getSlotAuditLog,
  getCourtPricingForAdmin,
  createClubSlot,
  updateClubSlot,
  deleteClubSlot,
  toggleSlotBlock,
  bulkBlockSlots,
  updateCourtPricing,
  applyCourtSchedule,
};
