/**
 * Club Slot Management Repository — CRUD for admin slot operations
 *
 * Decision Context:
 * - Why separate from clubSlotRepository: clubSlotRepository is a read-only public
 *   access path (player-facing). This repository handles admin CRUD, soft-delete,
 *   block/unblock, audit log, and court pricing — all requiring user-scoped clients
 *   so RLS policies on each table can enforce clubs.ownerId = auth.uid().
 * - Egress prevention: all selects use explicit column constants (NEVER select('*')).
 * - SLOT_ADMIN_COLUMNS includes Phase-1 migration columns: blockReason, blockType,
 *   isActive, allowOnlineBooking, duration, updatedBy, updatedAt.
 * - cancelMatchesBySlotIds uses the service-role singleton (justified: administrative
 *   forced cancellation bypasses organizer-scoped RLS UPDATE policy — same rationale
 *   as matchRepository.updateMatchStatus).
 * - insertCancellationNotifications also uses service-role to write to notifications
 *   table for each affected player, providing in-app traceability even without email.
 * - updatedBy is now populated on every updateSlot call so the column is no longer
 *   always NULL (fix for P5 audit finding).
 * - slotAuditLog is insert-only from the service.
 * - courtPricing uses upsert on courtId (create-or-update in one operation).
 * - Previously fixed bugs:
 *   - MATCH_AT_SLOT_COLUMNS used 'title'/'slotId' (wrong columns). Fixed to
 *     'description'/'clubSlotId' to match actual matches table schema.
 *   - getPlayerCountForMatches queried 'matchPlayers' (non-existent). Fixed to
 *     'matchParticipants', deduplicating on 'playerId' not row 'id'.
 */

import { supabase, type SupabaseClient } from '../config/supabase.js';

// =====================================================
// Column Definitions (egress prevention)
// =====================================================

const CLUB_OWNER_COLUMNS = `id, name, "ownerId"`;

const COURT_COLUMNS = `id, name, "maxFormat", surface, "isIndoor"`;

const SLOT_ADMIN_COLUMNS = `
  id,
  "clubId",
  "courtId",
  "dayOfWeek",
  "startTime",
  "endTime",
  duration,
  "priceArs",
  "isBlocked",
  "blockReason",
  "blockType",
  "isActive",
  "allowOnlineBooking",
  "updatedBy",
  "updatedAt"
`;

const AUDIT_LOG_COLUMNS = `
  id,
  "slotId",
  action,
  "previousValue",
  "newValue",
  "changedBy",
  reason,
  "createdAt"
`;

const COURT_PRICING_COLUMNS = `
  id,
  "courtId",
  "basePrice",
  "peakStart",
  "peakEnd",
  "peakDays",
  "peakMultiplier",
  "offPeakDiscount",
  "createdAt"
`;

const MATCH_AT_SLOT_COLUMNS = `
  id,
  description,
  "scheduledAt",
  "clubSlotId"
`;

// playerId is the dedup key for counting unique players across matches
const PARTICIPANTS_COUNT_COLUMNS = `"playerId", "matchId"`;

// =====================================================
// Types
// =====================================================

export interface ClubOwnerRow {
  id: string;
  name: string;
  ownerId: string | null;
}

export interface CourtAdminRow {
  id: string;
  name: string;
  maxFormat: string;
  surface: string;
  isIndoor: boolean;
}

export interface ManagedSlotRow {
  id: string;
  clubId: string;
  courtId: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  duration: number;
  priceArs: number | null;
  isBlocked: boolean;
  blockReason: string | null;
  blockType: string | null;
  isActive: boolean;
  allowOnlineBooking: boolean;
  updatedBy: string | null;
  updatedAt: string | null;
  courts: CourtAdminRow;
}

export interface CreateSlotData {
  clubId: string;
  courtId: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  duration: number;
  priceArs: number | null;
  allowOnlineBooking: boolean;
}

export interface UpdateSlotData {
  startTime?: string;
  endTime?: string;
  duration?: number;
  priceArs?: number | null;
  allowOnlineBooking?: boolean;
  isBlocked?: boolean;
  blockReason?: string | null;
  blockType?: string | null;
  isActive?: boolean;
  updatedBy?: string | null;
  updatedAt?: string;
}

export interface AuditLogRow {
  id: string;
  slotId: string | null;
  action: string;
  previousValue: string | null;
  newValue: string | null;
  changedBy: string | null;
  reason: string | null;
  createdAt: string;
}

export interface InsertAuditLogData {
  slotId: string | null;
  action: string;
  previousValue: object | null;
  newValue: object | null;
  changedBy: string;
  reason: string | null;
}

export interface CourtPricingRow {
  id: string;
  courtId: string;
  basePrice: number;
  peakStart: string | null;
  peakEnd: string | null;
  peakDays: number[];
  peakMultiplier: number;
  offPeakDiscount: number;
  createdAt: string;
}

export interface UpsertCourtPricingData {
  courtId: string;
  basePrice: number;
  peakStart: string | null;
  peakEnd: string | null;
  peakDays: number[];
  peakMultiplier: number;
  offPeakDiscount: number;
}

export interface MatchAtSlotRow {
  id: string;
  description: string | null;
  scheduledAt: string;
  clubSlotId: string;
  participantCount?: number;
}

export interface OverlapCheckParams {
  courtId: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  excludeSlotId?: string;
}

// =====================================================
// Club ownership helpers
// =====================================================

/**
 * Find the club owned by a specific user (1:1 relationship via clubs.ownerId).
 * Returns null if the user has no club (not a club_admin or club not yet created).
 */
export async function getClubByOwnerId(
  ownerId: string,
  client: SupabaseClient = supabase,
): Promise<ClubOwnerRow | null> {
  const { data, error } = await client
    .from('clubs')
    .select(CLUB_OWNER_COLUMNS)
    .eq('ownerId', ownerId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    console.error(
      `[clubSlotManagementRepository.getClubByOwnerId] Supabase error for ownerId=${ownerId}:`,
      error.message,
    );
    throw new Error(error.message);
  }

  return data as unknown as ClubOwnerRow;
}

/**
 * Returns all courts belonging to a club.
 */
export async function getCourtsByClubId(
  clubId: string,
  client: SupabaseClient = supabase,
): Promise<CourtAdminRow[]> {
  const { data, error } = await client
    .from('courts')
    .select(COURT_COLUMNS)
    .eq('clubId', clubId)
    .order('name', { ascending: true });

  if (error) {
    console.error(
      `[clubSlotManagementRepository.getCourtsByClubId] Supabase error for clubId=${clubId}:`,
      error.message,
    );
    throw new Error(error.message);
  }

  return (data as unknown as CourtAdminRow[]) ?? [];
}

// =====================================================
// Slot read operations
// =====================================================

/**
 * List all active managed slots for a club (admin view, includes blocked/inactive).
 */
export async function getManagedSlotsByClubId(
  clubId: string,
  client: SupabaseClient = supabase,
): Promise<ManagedSlotRow[]> {
  const { data, error } = await client
    .from('clubSlots')
    .select(`${SLOT_ADMIN_COLUMNS}, courts(${COURT_COLUMNS})`)
    .eq('clubId', clubId)
    .order('dayOfWeek', { ascending: true })
    .order('startTime', { ascending: true });

  if (error) {
    console.error(
      `[clubSlotManagementRepository.getManagedSlotsByClubId] Supabase error for clubId=${clubId}:`,
      error.message,
    );
    throw new Error(error.message);
  }

  return (data as unknown as ManagedSlotRow[]) ?? [];
}

/**
 * List active managed slots for a specific court (scoped to verify club ownership separately).
 */
export async function getManagedSlotsByCourtId(
  courtId: string,
  client: SupabaseClient = supabase,
): Promise<ManagedSlotRow[]> {
  const { data, error } = await client
    .from('clubSlots')
    .select(`${SLOT_ADMIN_COLUMNS}, courts(${COURT_COLUMNS})`)
    .eq('courtId', courtId)
    .order('dayOfWeek', { ascending: true })
    .order('startTime', { ascending: true });

  if (error) {
    console.error(
      `[clubSlotManagementRepository.getManagedSlotsByCourtId] Supabase error for courtId=${courtId}:`,
      error.message,
    );
    throw new Error(error.message);
  }

  return (data as unknown as ManagedSlotRow[]) ?? [];
}

/**
 * Fetch a single managed slot by ID (for pre-mutation validation and response).
 */
export async function getManagedSlotById(
  slotId: string,
  client: SupabaseClient = supabase,
): Promise<ManagedSlotRow | null> {
  const { data, error } = await client
    .from('clubSlots')
    .select(`${SLOT_ADMIN_COLUMNS}, courts(${COURT_COLUMNS})`)
    .eq('id', slotId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    console.error(
      `[clubSlotManagementRepository.getManagedSlotById] Supabase error for slotId=${slotId}:`,
      error.message,
    );
    throw new Error(error.message);
  }

  return data as unknown as ManagedSlotRow;
}

// =====================================================
// Overlap validation (improvement 18)
// =====================================================

/**
 * Returns true if any other active slot on the same court+day would overlap the
 * given time window. Used before create/update to enforce no double-booking.
 */
export async function checkSlotOverlap(
  params: OverlapCheckParams,
  client: SupabaseClient = supabase,
): Promise<boolean> {
  const { courtId, dayOfWeek, startTime, endTime, excludeSlotId } = params;

  let query = client
    .from('clubSlots')
    .select('id', { count: 'exact' })
    .eq('courtId', courtId)
    .eq('dayOfWeek', dayOfWeek)
    .eq('isActive', true)
    // Overlaps when: existing.startTime < newEndTime AND existing.endTime > newStartTime
    .lt('startTime', endTime)
    .gt('endTime', startTime);

  if (excludeSlotId) {
    query = query.neq('id', excludeSlotId);
  }

  const { error, count } = await query;

  if (error) {
    console.error(
      `[clubSlotManagementRepository.checkSlotOverlap] Supabase error courtId=${courtId}:`,
      error.message,
    );
    throw new Error(error.message);
  }

  return (count ?? 0) > 0;
}

/**
 * Finds slots that conflict with a given time range. A conflict is a slot that is
 * not available (i.e., has a match or is manually blocked).
 *
 * This is a more specific check than checkSlotOverlap, used for advanced updates.
 */
export async function findConflictingSlots(
  params: OverlapCheckParams,
  client: SupabaseClient = supabase,
): Promise<string[]> {
  const { courtId, dayOfWeek, startTime, endTime, excludeSlotId } = params;

  // 1. Find overlapping slots that are manually blocked
  let blockedQuery = client
    .from('clubSlots')
    .select('id')
    .eq('courtId', courtId)
    .eq('dayOfWeek', dayOfWeek)
    .eq('isActive', true)
    .lt('startTime', endTime)
    .gt('endTime', startTime)
    .eq('isBlocked', true);

  if (excludeSlotId) {
    blockedQuery = blockedQuery.neq('id', excludeSlotId);
  }
  const { data: blockedSlots, error: blockedError } = await blockedQuery;

  if (blockedError) {
    console.error(`[findConflictingSlots] Error checking blocked slots:`, blockedError.message);
    throw new Error(blockedError.message);
  }
  const conflictingIds = new Set((blockedSlots as { id: string }[] ?? []).map((s) => s.id));

  // 2. Find overlapping slots that have a scheduled match
  let matchQuery = client
    .from('clubSlots')
    .select('id, matches!inner(id, status)')
    .eq('courtId', courtId)
    .eq('dayOfWeek', dayOfWeek)
    .eq('isActive', true)
    .lt('startTime', endTime)
    .gt('endTime', startTime)
    .in('matches.status', ['open', 'full', 'in_progress', 'completed']);

  if (excludeSlotId) {
    matchQuery = matchQuery.neq('id', excludeSlotId);
  }
  const { data: slotsWithMatches, error: matchError } = await matchQuery;


  if (matchError) {
    console.error(`[findConflictingSlots] Error checking slots with matches:`, matchError.message);
    throw new Error(matchError.message);
  }
  ((slotsWithMatches as { id: string }[] | null) ?? []).forEach((s) => conflictingIds.add(s.id));

  return Array.from(conflictingIds);
}

/**
 * Soft-deletes slots that are AVAILABLE (not blocked, no match) and overlap with the
 * given time range. Used when a slot is expanded to consume others.
 *
 * Decision Context:
 * - Why soft-delete (isActive=false) and NOT physical .delete(): the project invariant is
 *   that slots are never physically removed (they back match foreign keys and the audit
 *   trail). The previous implementation hard-deleted the absorbed rows, which (a) violated
 *   that invariant, (b) left no audit history, and (c) was silent. Now we set isActive=false
 *   and RETURN the affected ids so the service can write a 'deleted' audit entry per slot and
 *   surface the count to the admin.
 * - Returns the ids (not just a count) so the caller can audit each absorbed slot.
 * - Previously fixed bugs: expanding a slot silently HARD-DELETED adjacent available slots
 *   with no audit entry and a misleading "actualizado correctamente" message.
 */
export async function softDeleteAvailableOverlappingSlots(
  params: OverlapCheckParams,
  client: SupabaseClient = supabase,
): Promise<string[]> {
  const { courtId, dayOfWeek, startTime, endTime, excludeSlotId } = params;

  // 1. Find all active slots that overlap the target range
  let baseQuery = client
    .from('clubSlots')
    .select('id')
    .eq('courtId', courtId)
    .eq('dayOfWeek', dayOfWeek)
    .eq('isActive', true)
    .lt('startTime', endTime)
    .gt('endTime', startTime);

  if (excludeSlotId) {
    baseQuery = baseQuery.neq('id', excludeSlotId);
  }

  const { data: overlappingSlots, error: overlapError } = await baseQuery;
  if (overlapError) {
    console.error(`[softDeleteAvailableOverlappingSlots] Error finding overlaps:`, overlapError.message);
    throw new Error(overlapError.message);
  }
  if (!overlappingSlots || overlappingSlots.length === 0) {
    return [];
  }
  const overlappingSlotIds = (overlappingSlots as { id: string }[]).map((s) => s.id);

  // 2. Find which of those are conflicting (and thus must NOT be absorbed)
  const conflictingSlotIds = await findConflictingSlots(params, client);
  const conflictingSet = new Set(conflictingSlotIds);

  // 3. The difference is the set of available slots to be soft-deleted
  const toDeleteIds = overlappingSlotIds.filter((id) => !conflictingSet.has(id));

  if (toDeleteIds.length === 0) {
    return [];
  }

  // 4. Soft-delete (preserve rows, FKs and audit history)
  const { error: deleteError } = await client
    .from('clubSlots')
    .update({ isActive: false, updatedAt: new Date().toISOString() })
    .in('id', toDeleteIds);

  if (deleteError) {
    console.error(`[softDeleteAvailableOverlappingSlots] Supabase error:`, deleteError.message);
    throw new Error(deleteError.message);
  }

  return toDeleteIds;
}

// =====================================================
// Slot write operations
// =====================================================


/**
 * Insert a new club slot. Uses user-scoped client for RLS enforcement.
 */
export async function createSlot(
  data: CreateSlotData,
  client: SupabaseClient = supabase,
): Promise<ManagedSlotRow> {
  const { data: inserted, error } = await client
    .from('clubSlots')
    .insert({
      clubId: data.clubId,
      courtId: data.courtId,
      dayOfWeek: data.dayOfWeek,
      startTime: data.startTime,
      endTime: data.endTime,
      duration: data.duration,
      priceArs: data.priceArs,
      allowOnlineBooking: data.allowOnlineBooking,
      isActive: true,
      isBlocked: false,
      updatedAt: new Date().toISOString(),
    })
    .select(`${SLOT_ADMIN_COLUMNS}, courts(${COURT_COLUMNS})`)
    .single();

  if (error) {
    console.error(
      `[clubSlotManagementRepository.createSlot] Supabase error for courtId=${data.courtId}:`,
      error.message,
    );
    throw new Error(error.message);
  }

  return inserted as unknown as ManagedSlotRow;
}

/**
 * Update mutable slot fields. Uses user-scoped client for RLS.
 */
export async function updateSlot(
  slotId: string,
  updates: UpdateSlotData,
  client: SupabaseClient = supabase,
): Promise<ManagedSlotRow> {
  const { data, error } = await client
    .from('clubSlots')
    .update({ ...updates, updatedAt: new Date().toISOString() })
    .eq('id', slotId)
    .select(`${SLOT_ADMIN_COLUMNS}, courts(${COURT_COLUMNS})`)
    .single();

  if (error) {
    console.error(
      `[clubSlotManagementRepository.updateSlot] Supabase error for slotId=${slotId}:`,
      error.message,
    );
    throw new Error(error.message);
  }

  return data as unknown as ManagedSlotRow;
}

/**
 * Soft-delete: set isActive=false. Preserves slot for audit history and foreign keys
 * from matches. Physical deletion is never done (improvement 17).
 */
export async function softDeleteSlot(
  slotId: string,
  client: SupabaseClient = supabase,
): Promise<ManagedSlotRow> {
  const { data, error } = await client
    .from('clubSlots')
    .update({ isActive: false, updatedAt: new Date().toISOString() })
    .eq('id', slotId)
    .select(`${SLOT_ADMIN_COLUMNS}, courts(${COURT_COLUMNS})`)
    .single();

  if (error) {
    console.error(
      `[clubSlotManagementRepository.softDeleteSlot] Supabase error for slotId=${slotId}:`,
      error.message,
    );
    throw new Error(error.message);
  }

  return data as unknown as ManagedSlotRow;
}

// =====================================================
// Match impact helpers
// =====================================================

/**
 * Returns all future matches scheduled at the given slots (for impact preview before blocking).
 */
export async function getMatchesAtSlots(
  slotIds: string[],
  client: SupabaseClient = supabase,
): Promise<MatchAtSlotRow[]> {
  const { data, error } = await client
    .from('matches')
    .select(MATCH_AT_SLOT_COLUMNS)
    .in('clubSlotId', slotIds)
    .gte('scheduledAt', new Date().toISOString())
    .neq('status', 'cancelled');

  if (error) {
    console.error(
      '[clubSlotManagementRepository.getMatchesAtSlots] Supabase error:',
      error.message,
    );
    throw new Error(error.message);
  }

  return (data as unknown as MatchAtSlotRow[]) ?? [];
}

/**
 * Count distinct players across the given match IDs (for notification impact).
 * Returns unique player IDs (joining matchPlayers table).
 */
export async function getPlayerCountForMatches(
  matchIds: string[],
  client: SupabaseClient = supabase,
): Promise<number> {
  if (matchIds.length === 0) return 0;

  const { data, error } = await client
    .from('matchParticipants')
    .select(PARTICIPANTS_COUNT_COLUMNS)
    .in('matchId', matchIds);

  if (error) {
    console.error(
      '[clubSlotManagementRepository.getPlayerCountForMatches] Supabase error:',
      error.message,
    );
    throw new Error(error.message);
  }

  // Unique player count via playerId dedupe
  const playerIds = new Set((data ?? []).map((r: { playerId: string }) => r.playerId));
  return playerIds.size;
}

/**
 * Returns the distinct participant count per match, keyed by matchId, for the given matches.
 * Used to enrich SlotImpactPreview.matchDetails so each affected match shows its own player
 * count (the aggregate playersToNotify dedupes across all matches and cannot be shown per row).
 * Previously fixed bugs: matchDetails.participantCount was hardcoded to 0, so the block
 * confirmation dialog always rendered "0 jugador(es)" next to each match.
 */
export async function getParticipantCountsByMatch(
  matchIds: string[],
  client: SupabaseClient = supabase,
): Promise<Record<string, number>> {
  if (matchIds.length === 0) return {};

  const { data, error } = await client
    .from('matchParticipants')
    .select(PARTICIPANTS_COUNT_COLUMNS)
    .in('matchId', matchIds);

  if (error) {
    console.error(
      '[clubSlotManagementRepository.getParticipantCountsByMatch] Supabase error:',
      error.message,
    );
    throw new Error(error.message);
  }

  // Dedupe playerId within each match, then count.
  const byMatch = new Map<string, Set<string>>();
  for (const row of (data ?? []) as { matchId: string; playerId: string }[]) {
    if (!byMatch.has(row.matchId)) byMatch.set(row.matchId, new Set());
    byMatch.get(row.matchId)!.add(row.playerId);
  }
  const counts: Record<string, number> = {};
  for (const [matchId, players] of byMatch) counts[matchId] = players.size;
  return counts;
}

// =====================================================
// Match cancellation (admin forced, uses service-role)
// =====================================================

/**
 * Cancels all future non-terminal matches at the given slot IDs.
 * Returns cancelled match IDs so the caller can insert notifications.
 * Uses the service-role singleton — RLS UPDATE policy restricts writes to the
 * match organizer, but forced admin cancellations must bypass that.
 */
export async function cancelMatchesBySlotIds(
  slotIds: string[],
  reason: string | null,
): Promise<{ cancelledMatchIds: string[]; cancelledCount: number }> {
  if (slotIds.length === 0) return { cancelledMatchIds: [], cancelledCount: 0 };

  const { data, error } = await supabase
    .from('matches')
    .update({
      status: 'cancelled',
      cancellationReason: reason ?? 'Horario bloqueado por el administrador del club',
    })
    .in('clubSlotId', slotIds)
    .in('status', ['open', 'full', 'in_progress'])
    .gte('scheduledAt', new Date().toISOString())
    .select('id');

  if (error) {
    console.error(
      `[clubSlotManagementRepository.cancelMatchesBySlotIds] Supabase error slotIds=${slotIds.join(',')}:`,
      error.message,
    );
    throw new Error(error.message);
  }

  const cancelledMatchIds = (data ?? []).map((r: { id: string }) => r.id);
  return { cancelledMatchIds, cancelledCount: cancelledMatchIds.length };
}

/**
 * Fetches participant player IDs for the given match IDs (for notification targeting).
 * Uses service-role since this is part of an admin forced-cancellation flow.
 */
export async function getParticipantsByMatchIds(
  matchIds: string[],
): Promise<Array<{ playerId: string; matchId: string }>> {
  if (matchIds.length === 0) return [];

  const { data, error } = await supabase
    .from('matchParticipants')
    .select('"playerId", "matchId"')
    .in('matchId', matchIds);

  if (error) {
    console.error(
      `[clubSlotManagementRepository.getParticipantsByMatchIds] Supabase error:`,
      error.message,
    );
    throw new Error(error.message);
  }

  return (data ?? []) as Array<{ playerId: string; matchId: string }>;
}

/**
 * Inserts in-app notifications in the notifications table for each unique player
 * affected by a forced match cancellation. Uses service-role (admin action).
 * Returns the number of unique players notified.
 */
export async function insertCancellationNotifications(
  participants: Array<{ playerId: string; matchId: string }>,
  reason: string | null,
): Promise<number> {
  if (participants.length === 0) return 0;

  const uniquePlayerIds = [...new Set(participants.map((p) => p.playerId))];

  const records = uniquePlayerIds.map((playerId) => ({
    userId: playerId,
    title: 'Partido cancelado',
    body: reason
      ? `Tu partido fue cancelado por el club. Motivo: ${reason}`
      : 'Tu partido fue cancelado por el administrador del club.',
    type: 'match_cancelled',
    referenceId: participants.find((p) => p.playerId === playerId)?.matchId ?? null,
    isRead: false,
  }));

  const { error } = await supabase.from('notifications').insert(records);

  if (error) {
    console.error(
      `[clubSlotManagementRepository.insertCancellationNotifications] Supabase error:`,
      error.message,
    );
    throw new Error(error.message);
  }

  console.info(
    `[clubSlotManagementRepository.insertCancellationNotifications] Inserted ${uniquePlayerIds.length} notifications`,
  );
  return uniquePlayerIds.length;
}

// =====================================================
// Audit log
// =====================================================

/**
 * Fetch audit log entries for a slot, ordered by most recent first.
 */
export async function getAuditLogBySlotId(
  slotId: string,
  limit = 20,
  offset = 0,
  client: SupabaseClient = supabase,
): Promise<AuditLogRow[]> {
  const { data, error } = await client
    .from('slotAuditLog')
    .select(AUDIT_LOG_COLUMNS)
    .eq('slotId', slotId)
    .order('createdAt', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error(
      `[clubSlotManagementRepository.getAuditLogBySlotId] Supabase error for slotId=${slotId}:`,
      error.message,
    );
    throw new Error(error.message);
  }

  return (data as unknown as AuditLogRow[]) ?? [];
}

/**
 * Insert a manual audit log entry (for service-level events not captured by DB trigger).
 */
export async function insertAuditLogEntry(
  entry: InsertAuditLogData,
  client: SupabaseClient = supabase,
): Promise<void> {
  const { error } = await client
    .from('slotAuditLog')
    .insert({
      slotId: entry.slotId,
      action: entry.action,
      previousValue: entry.previousValue ? JSON.stringify(entry.previousValue) : null,
      newValue: entry.newValue ? JSON.stringify(entry.newValue) : null,
      changedBy: entry.changedBy,
      reason: entry.reason,
    });

  if (error) {
    console.error(
      `[clubSlotManagementRepository.insertAuditLogEntry] Supabase error slotId=${entry.slotId}:`,
      error.message,
    );
    throw new Error(error.message);
  }
}

// =====================================================
// Audit author resolution (improvement: changedBy was a stub)
// =====================================================

export interface AuditProfileRow {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

/**
 * Batch-fetch minimal profile info for audit-log attribution.
 *
 * Decision Context:
 * - Why: rowToAuditLog previously returned changedBy with displayName='' (a stub), so the
 *   audit UI showed blank authors. We resolve the actual profiles in one batched query
 *   (no N+1) keyed by the distinct changedBy ids.
 * - Explicit columns only (egress prevention). Empty input short-circuits.
 * - Previously fixed bugs: audit log changedBy.displayName/avatarUrl were never populated.
 */
export async function getProfilesByIds(
  ids: string[],
  client: SupabaseClient = supabase,
): Promise<AuditProfileRow[]> {
  if (ids.length === 0) return [];

  const { data, error } = await client
    .from('profiles')
    .select('id, "displayName", "avatarUrl"')
    .in('id', ids);

  if (error) {
    console.error(`[clubSlotManagementRepository.getProfilesByIds] Supabase error:`, error.message);
    throw new Error(error.message);
  }

  return (data as unknown as AuditProfileRow[]) ?? [];
}

// =====================================================
// Court pricing
// =====================================================

/**
 * Fetch pricing config for a court, or null if none configured.
 */
export async function getCourtPricing(
  courtId: string,
  client: SupabaseClient = supabase,
): Promise<CourtPricingRow | null> {
  const { data, error } = await client
    .from('courtPricing')
    .select(COURT_PRICING_COLUMNS)
    .eq('courtId', courtId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    console.error(
      `[clubSlotManagementRepository.getCourtPricing] Supabase error for courtId=${courtId}:`,
      error.message,
    );
    throw new Error(error.message);
  }

  return data as unknown as CourtPricingRow;
}

/**
 * Upsert pricing config for a court (insert or update).
 */
export async function upsertCourtPricing(
  pricingData: UpsertCourtPricingData,
  client: SupabaseClient = supabase,
): Promise<CourtPricingRow> {
  const { data, error } = await client
    .from('courtPricing')
    .upsert(
      {
        courtId: pricingData.courtId,
        basePrice: pricingData.basePrice,
        peakStart: pricingData.peakStart,
        peakEnd: pricingData.peakEnd,
        peakDays: pricingData.peakDays,
        peakMultiplier: pricingData.peakMultiplier,
        offPeakDiscount: pricingData.offPeakDiscount,
      },
      { onConflict: 'courtId' },
    )
    .select(COURT_PRICING_COLUMNS)
    .single();

  if (error) {
    console.error(
      `[clubSlotManagementRepository.upsertCourtPricing] Supabase error for courtId=${pricingData.courtId}:`,
      error.message,
    );
    throw new Error(error.message);
  }

  return data as unknown as CourtPricingRow;
}

export const clubSlotManagementRepository = {
  getClubByOwnerId,
  getCourtsByClubId,
  getManagedSlotsByClubId,
  getManagedSlotsByCourtId,
  getManagedSlotById,
  checkSlotOverlap,
  findConflictingSlots,
  softDeleteAvailableOverlappingSlots,
  createSlot,
  updateSlot,
  softDeleteSlot,
  getMatchesAtSlots,
  getPlayerCountForMatches,
  getParticipantCountsByMatch,
  cancelMatchesBySlotIds,
  getParticipantsByMatchIds,
  insertCancellationNotifications,
  getAuditLogBySlotId,
  insertAuditLogEntry,
  getProfilesByIds,
  getCourtPricing,
  upsertCourtPricing,
};
