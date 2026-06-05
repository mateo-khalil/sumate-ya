/**
 * Match Auto-Cancel Repository — DB access for the background auto-cancellation worker.
 *
 * Decision Context:
 * - Why a dedicated repository: the auto-cancel worker reads/writes a different mix of
 *   tables (matches + matchReminders + notifications) than the request-time read path in
 *   matchRepository.ts. Keeping it separate stops the read repo from growing worker-only
 *   concerns and keeps the worker's service-role intent obvious (every function here writes
 *   with the service-role singleton — there is NO GraphQL request / RLS user to scope to,
 *   because this runs on a cron tick, not a resolver).
 * - cancelMatchesByIds is a deliberate near-copy of
 *   clubSlotManagementRepository.cancelMatchesBySlotIds: that variant is keyed by clubSlotId
 *   (admin blocks a slot) while the worker cancels by matchId. The UPDATE body, the
 *   `.in('status', ['open','full'])` idempotency filter, and the cancellationReason write are
 *   intentionally identical so both forced-cancel paths behave the same. We do NOT reuse the
 *   slot-keyed function because rewriting matchIds as slotIds would be a lossy detour.
 * - Egress: explicit columns only, never select('*') (backend.md). The participant count
 *   uses the `matchParticipants(count)` relation aggregate (same trick as
 *   matchRepository.getMatchesWithFilters) so one round-trip yields capacity-vs-filled
 *   without pulling participant rows.
 * - Notifications reuse: cancellation notifications are inserted via the existing
 *   clubSlotManagementRepository.insertCancellationNotifications (not duplicated here). Only
 *   the NEW reminder-notification shape lives here.
 * - matchReminders idempotency: insertReminderMarker relies on the UNIQUE(matchId, kind)
 *   constraint. A duplicate insert returns Postgres 23505; we map that to `false` ("someone
 *   already sent this reminder") so only the tick that wins the insert sends notifications.
 *   This is what makes reminders safe under a 5-min tick AND under multiple backend
 *   instances.
 * - Previously fixed bugs: none relevant (new module).
 */

import { supabase } from '../config/supabase.js';

// =====================================================
// Types
// =====================================================

/** A match the worker may need to act on, with its current filled-slot count. */
export interface AutoCancelCandidate {
  id: string;
  capacity: number;
  scheduledAt: string;
  organizerId: string;
  participantCount: number;
}

export type ReminderKind = 'reminder_4h' | 'reminder_3h' | 'reminder_2h';

// PostgREST shape for the `matchParticipants(count)` relation aggregate.
type CandidateRow = {
  id: string;
  capacity: number;
  scheduledAt: string;
  organizerId: string;
  matchParticipants?: { count: number }[] | null;
};

const CANDIDATE_COLUMNS = `id, capacity, "scheduledAt", "organizerId", matchParticipants(count)`;

function toCandidate(row: CandidateRow): AutoCancelCandidate {
  return {
    id: row.id,
    capacity: row.capacity,
    scheduledAt: row.scheduledAt,
    organizerId: row.organizerId,
    participantCount: row.matchParticipants?.[0]?.count ?? 0,
  };
}

// =====================================================
// Candidate reads (service-role)
// =====================================================

/**
 * Fetches non-terminal future matches whose scheduledAt falls within [now, windowEnd],
 * with their current participant count. The business rule (which to cancel vs. grace)
 * lives in the service — this repo returns raw data only.
 *
 * `full` rows are included for robustness (a stale `full` row with missing players would
 * still get evaluated), but a genuinely full match has participantCount === capacity and is
 * filtered out by the service's `missing > 0` guard.
 */
export async function getCancelCandidates(
  nowISO: string,
  windowEndISO: string,
): Promise<AutoCancelCandidate[]> {
  const { data, error } = await supabase
    .from('matches')
    .select(CANDIDATE_COLUMNS)
    .in('status', ['open', 'full'])
    .gte('scheduledAt', nowISO)
    .lte('scheduledAt', windowEndISO);

  if (error) {
    console.error(
      `[matchAutoCancelRepository.getCancelCandidates] Supabase error window=[${nowISO}..${windowEndISO}]:`,
      error.message,
    );
    throw new Error(error.message);
  }

  return ((data ?? []) as unknown as CandidateRow[]).map(toCandidate);
}

/**
 * Fetches non-terminal future matches whose scheduledAt falls within [now, windowEnd] for
 * the reminder windows (typically now+2h .. now+4h), with participant counts.
 */
export async function getReminderCandidates(
  nowISO: string,
  windowEndISO: string,
): Promise<AutoCancelCandidate[]> {
  const { data, error } = await supabase
    .from('matches')
    .select(CANDIDATE_COLUMNS)
    .in('status', ['open', 'full'])
    .gte('scheduledAt', nowISO)
    .lte('scheduledAt', windowEndISO);

  if (error) {
    console.error(
      `[matchAutoCancelRepository.getReminderCandidates] Supabase error window=[${nowISO}..${windowEndISO}]:`,
      error.message,
    );
    throw new Error(error.message);
  }

  return ((data ?? []) as unknown as CandidateRow[]).map(toCandidate);
}

// =====================================================
// Cancellation (service-role, forced)
// =====================================================

/**
 * Cancels the given matches by id. Returns the ids that were actually transitioned, so the
 * caller only notifies players for real cancellations.
 *
 * Idempotent: the `.in('status', ['open','full'])` filter means a match already cancelled
 * (or completed/in_progress) updates zero rows and is excluded from the returned ids — so a
 * double tick never re-cancels or double-notifies.
 */
export async function cancelMatchesByIds(
  matchIds: string[],
  reason: string,
): Promise<string[]> {
  if (matchIds.length === 0) return [];

  const { data, error } = await supabase
    .from('matches')
    .update({ status: 'cancelled', cancellationReason: reason })
    .in('id', matchIds)
    .in('status', ['open', 'full'])
    .select('id');

  if (error) {
    console.error(
      `[matchAutoCancelRepository.cancelMatchesByIds] Supabase error matchIds=${matchIds.join(',')}:`,
      error.message,
    );
    throw new Error(error.message);
  }

  return (data ?? []).map((r: { id: string }) => r.id);
}

// =====================================================
// Reminder markers + notifications (service-role)
// =====================================================

const UNIQUE_VIOLATION = '23505';

/**
 * Batch-reads which reminder kinds were already sent for the given matches. Used to
 * pre-filter before attempting inserts; the UNIQUE constraint remains the real guard.
 * Returns a Set of `"${matchId}:${kind}"` keys.
 */
export async function getAlreadySentReminderKinds(matchIds: string[]): Promise<Set<string>> {
  if (matchIds.length === 0) return new Set();

  const { data, error } = await supabase
    .from('matchReminders')
    .select('"matchId", kind')
    .in('matchId', matchIds);

  if (error) {
    console.error(
      `[matchAutoCancelRepository.getAlreadySentReminderKinds] Supabase error:`,
      error.message,
    );
    throw new Error(error.message);
  }

  return new Set((data ?? []).map((r: { matchId: string; kind: string }) => `${r.matchId}:${r.kind}`));
}

/**
 * Inserts a reminder marker. Returns true if THIS call won the insert (caller should send
 * notifications), false if the marker already existed (unique violation → another tick/
 * instance already handled it). Any other error is thrown.
 */
export async function insertReminderMarker(matchId: string, kind: ReminderKind): Promise<boolean> {
  const { error } = await supabase.from('matchReminders').insert({ matchId, kind });

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return false; // Already sent — expected under concurrent/repeated ticks.
    }
    console.error(
      `[matchAutoCancelRepository.insertReminderMarker] Supabase error matchId=${matchId} kind=${kind}:`,
      error.message,
    );
    throw new Error(error.message);
  }

  return true;
}

/**
 * Inserts "players still missing" in-app notifications for the given recipients (deduped),
 * mirroring insertCancellationNotifications but with the reminder type/copy. Returns the
 * number of unique recipients notified.
 */
export async function insertReminderNotifications(
  recipientIds: string[],
  missingCount: number,
  matchId: string,
): Promise<number> {
  const uniqueIds = [...new Set(recipientIds)];
  if (uniqueIds.length === 0) return 0;

  const records = uniqueIds.map((userId) => ({
    userId,
    title: 'Faltan jugadores',
    body: `Faltan ${missingCount} jugador(es) para completar tu partido. ¡Invitá a alguien para que no se cancele!`,
    type: 'match_needs_players',
    referenceId: matchId,
    isRead: false,
  }));

  const { error } = await supabase.from('notifications').insert(records);

  if (error) {
    console.error(
      `[matchAutoCancelRepository.insertReminderNotifications] Supabase error matchId=${matchId}:`,
      error.message,
    );
    throw new Error(error.message);
  }

  console.info(
    `[matchAutoCancelRepository.insertReminderNotifications] Inserted ${uniqueIds.length} reminder notifications for matchId=${matchId}`,
  );
  return uniqueIds.length;
}
