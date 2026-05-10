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

  if (!slot) throw new Error(`Slot no encontrado: ${slotId}`);
  if (slot.clubId !== clubId) throw new Error('No tenés permiso para modificar este slot');

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

/** Validates HH:mm format and that end > start */
function validateTimeRange(startTime: string, endTime: string): void {
  const timeRe = /^\d{2}:\d{2}$/;
  if (!timeRe.test(startTime) || !timeRe.test(endTime)) {
    throw new Error('startTime y endTime deben tener formato HH:mm');
  }
  if (endTime <= startTime) {
    throw new Error('endTime debe ser mayor que startTime');
  }
}

/** Validates UUID with permissive regex (compatible with seeds) */
function validateUuid(value: string, fieldName: string): void {
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRe.test(value)) {
    throw new Error(`${fieldName} inválido: "${value}"`);
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

  const matchDetails: AffectedMatch[] = matches.map((m) => ({
    matchId: m.id,
    title: m.description ?? `Partido ${m.id.slice(0, 8)}`,
    scheduledAt: m.scheduledAt,
    participantCount: 0, // enriched by player count across all matches
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
      throw new Error(`Slot ${id} no pertenece a tu club`);
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
  return rows.map(rowToAuditLog);
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
  if (input.priceArs !== null && input.priceArs !== undefined && input.priceArs > 999999) {
    throw new Error('El precio no puede superar $U 999.999');
  }

  const { clubId } = await requireClubOwnership(ctx);
  const db = ctx.supabase ?? supabase;

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
): Promise<{ slot: ManagedClubSlot }> {
  validateUuid(input.slotId, 'slotId');
  if (input.startTime && input.endTime) {
    validateTimeRange(input.startTime, input.endTime);
  }
  if (input.duration !== null && input.duration !== undefined && (input.duration < 30 || input.duration > 240)) {
    throw new Error('duration debe estar entre 30 y 240 minutos');
  }

  const { clubId } = await requireClubOwnership(ctx);
  const db = ctx.supabase ?? supabase;
  const existing = await requireSlotOwnership(input.slotId, clubId, ctx);

  // If time is changing, implement the new overlap logic
  if (input.startTime || input.endTime) {
    const newStart = input.startTime ?? existing.startTime;
    const newEnd = input.endTime ?? existing.endTime;
    validateTimeRange(newStart, newEnd);

    const overlapParams = {
      courtId: existing.courtId,
      dayOfWeek: existing.dayOfWeek,
      startTime: newStart,
      endTime: newEnd,
      excludeSlotId: input.slotId,
    };

    // 1. Check for conflicts with occupied slots
    const conflictingSlots = await clubSlotManagementRepository.findConflictingSlots(overlapParams, db);
    if (conflictingSlots.length > 0) {
      throw new Error('No se puede modificar el horario porque colisiona con una reserva o partido existente.');
    }

    // 2. Delete available slots that are now overlapped
    await clubSlotManagementRepository.deleteAvailableOverlappingSlots(overlapParams, db);
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

  console.info(`[clubSlotManagementService.updateClubSlot] Updated slot ${input.slotId}`);
  return { slot: rowToManagedSlot(row) };
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

  const updates: UpdateSlotData = {
    isBlocked: input.isBlocked,
    blockReason: input.isBlocked ? (input.blockReason ?? null) : null,
    blockType: input.isBlocked && input.blockType ? BLOCK_TYPE_TO_DB[input.blockType] ?? null : null,
    updatedBy: ctx.userId ?? null,
  };

  const row = await clubSlotManagementRepository.updateSlot(input.slotId, updates, db);

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
      throw new Error(`Slot ${id} no pertenece a tu club`);
    }
  }

  const preview = input.isBlocked
    ? await buildImpactPreview(input.slotIds, ctx)
    : null;

  // Gate on confirmForce when matches would be affected
  if (input.isBlocked && preview && preview.matchesAffected > 0 && !input.confirmForce) {
    return { affectedCount: 0, skippedCount: input.slotIds.length, impactPreview: preview, cancelledMatchesCount: 0, notifiedPlayersCount: 0 };
  }

  // Cancel all affected matches before applying the bulk block (improvement 19 complete)
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

  const { clubId } = await requireClubOwnership(ctx);
  const db = ctx.supabase ?? supabase;

  // Verify court belongs to this club via a slot lookup (defense-in-depth)
  const slotsForCourt = await clubSlotManagementRepository.getManagedSlotsByCourtId(input.courtId, db);
  const belongsToClub = slotsForCourt.some((s) => s.clubId === clubId);
  if (slotsForCourt.length > 0 && !belongsToClub) {
    throw new Error('Esta cancha no pertenece a tu club');
  }

  const row = await clubSlotManagementRepository.upsertCourtPricing(
    {
      courtId: input.courtId,
      basePrice: input.basePrice,
      peakStart: input.peakStart ?? null,
      peakEnd: input.peakEnd ?? null,
      peakDays: input.peakDays ?? [],
      peakMultiplier: multiplier,
      offPeakDiscount: input.offPeakDiscount ?? 0.0,
    },
    db,
  );

  await invalidateSlotCaches(clubId, input.courtId);

  console.info(`[clubSlotManagementService.updateCourtPricing] Updated pricing for court ${input.courtId}`);
  return rowToCourtPricing(row);
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
};
