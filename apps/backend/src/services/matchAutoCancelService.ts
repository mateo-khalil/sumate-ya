/**
 * Match Auto-Cancel Service — business rules + orchestration for the background worker.
 *
 * Decision Context:
 * - Why this exists: a match that never fills its roster used to sit `open` forever; the
 *   frontend only disguised past ones as "completed" (effectiveStatus), leaving enrolled
 *   players waiting for a game that won't happen. This service runs on a cron tick (see
 *   matchScheduler.ts) and authoritatively cancels under-filled matches before kickoff, and
 *   nudges almost-full ones with reminder notifications.
 *
 * - Business rules (confirmed with product):
 *     missing   = capacity - participants
 *     threshold = ceil(0.10 * capacity)   // 10% rounded UP → flexible: cap10→1, 20→2, 22→3
 *   T-60min: missing > threshold      → CANCEL now.
 *   T-60min: 0 < missing <= threshold → GRACE (wait, re-evaluated at T-30).
 *   T-30min: missing > 0              → CANCEL.
 *   missing === 0 (full)             → never cancel.
 *   Reminders: at 4h/3h/2h before kickoff, if missing > 0, notify participants + organizer.
 *
 * - Tick tolerance: the cron fires every ~5 min, so the exact T-60 / T-30 / 4h / 3h / 2h
 *   instants will rarely line up with a tick. Each decision uses a ±MATCH_TICK_TOLERANCE_MIN
 *   window so a match cannot slip *between* two ticks unevaluated. Idempotency guards (the
 *   status-filtered cancel UPDATE and the matchReminders UNIQUE constraint) make it safe for
 *   a match to fall into two consecutive windows — it is still only acted on once.
 *
 * - DST / timezones: scheduledAt is timestamptz. minutesUntil is computed purely from epoch
 *   millis (Date.getTime()), never from wall-clock components, so DST transitions cannot
 *   shift the decision window.
 *
 * - Rule exception (services-return-data-only): backend.md says services return data and
 *   side effects (notifications) live in resolvers. This service is the orchestration
 *   boundary for a *background worker* — there is no resolver / request lifecycle to host
 *   the notification side effect, so performing it here (via repository helpers) is the
 *   correct and documented exception. Cache invalidation lives here for the same reason.
 *
 * - Previously fixed bugs: none relevant (new module).
 */

import {
  cacheDelete,
  cacheDeletePattern,
  CACHE_PREFIX,
} from '../config/redis.js';
import * as autoCancelRepo from '../repositories/matchAutoCancelRepository.js';
import type {
  AutoCancelCandidate,
  ReminderKind,
} from '../repositories/matchAutoCancelRepository.js';
import {
  getParticipantsByMatchIds,
  insertCancellationNotifications,
} from '../repositories/clubSlotManagementRepository.js';

const MS_PER_MIN = 60_000;

/** ±tolerance around each decision instant to cover the gap between 5-min ticks. */
export const TICK_TOLERANCE_MIN = 5;

const CANCEL_REASON = 'No se alcanzó el cupo mínimo de jugadores antes del inicio';

/** Reminder windows in minutes-before-kickoff, mapped to their marker kind. */
const REMINDER_WINDOWS: { kind: ReminderKind; minutesBefore: number }[] = [
  { kind: 'reminder_4h', minutesBefore: 240 },
  { kind: 'reminder_3h', minutesBefore: 180 },
  { kind: 'reminder_2h', minutesBefore: 120 },
];

// =====================================================
// Pure rule helpers (unit-tested)
// =====================================================

/** Minimum players that may be missing while still granting the grace period. */
export function computeThreshold(capacity: number): number {
  return Math.ceil(0.1 * capacity);
}

function minutesUntil(now: Date, scheduledAt: string): number {
  return (new Date(scheduledAt).getTime() - now.getTime()) / MS_PER_MIN;
}

function within(value: number, target: number, tolerance: number): boolean {
  return value >= target - tolerance && value <= target + tolerance;
}

export type Decision = 'cancel' | 'grace' | 'skip';

/**
 * Decides what to do with a single candidate at the current tick. Pure and deterministic.
 * - At T-60 (±tolerance): cancel if missing > threshold; grace if 0 < missing <= threshold.
 * - At T-30 (±tolerance): cancel if any player is still missing.
 * - Otherwise (full, or not near a decision instant): skip.
 */
export function classifyCandidate(now: Date, candidate: AutoCancelCandidate): Decision {
  const missing = candidate.capacity - candidate.participantCount;
  if (missing <= 0) return 'skip'; // full → never cancel

  const mins = minutesUntil(now, candidate.scheduledAt);
  const threshold = computeThreshold(candidate.capacity);

  // T-30: last chance — any missing player cancels.
  if (within(mins, 30, TICK_TOLERANCE_MIN)) {
    return 'cancel';
  }

  // T-60: cancel the clearly-underfilled; grant grace to the almost-full.
  if (within(mins, 60, TICK_TOLERANCE_MIN)) {
    return missing > threshold ? 'cancel' : 'grace';
  }

  return 'skip';
}

/** Picks the reminder kind whose window the candidate currently sits in, or null. */
export function reminderKindFor(now: Date, candidate: AutoCancelCandidate): ReminderKind | null {
  const mins = minutesUntil(now, candidate.scheduledAt);
  for (const { kind, minutesBefore } of REMINDER_WINDOWS) {
    if (within(mins, minutesBefore, TICK_TOLERANCE_MIN)) return kind;
  }
  return null;
}

// =====================================================
// Orchestration (called by the scheduler)
// =====================================================

async function invalidateMatchCaches(matchIds: string[]): Promise<void> {
  // Mirror the join/leave invalidation in matchService so the public list, the per-match
  // detail, and the per-user "Mis partidos" reflect the cancellation immediately. Helpers
  // null-guard when Redis is disabled (dev), so this is a no-op without Redis.
  await cacheDelete(CACHE_PREFIX.MATCHES_OPEN);
  await cacheDeletePattern(`${CACHE_PREFIX.MATCHES_LIST}:*`);
  await cacheDeletePattern(`${CACHE_PREFIX.USER_MATCHES}*`);
  for (const id of matchIds) {
    await cacheDelete(`${CACHE_PREFIX.MATCH_DETAIL}${id}`);
    await cacheDelete(`${CACHE_PREFIX.MATCH_PARTICIPANTS}${id}`);
  }
}

/**
 * One auto-cancel pass: find candidates in [now, now+65min], cancel those that fail the
 * roster rule, notify their participants + organizer, and invalidate caches.
 * Returns a small summary for logging/tests.
 */
export async function runAutoCancelTick(
  now: Date = new Date(),
): Promise<{ cancelled: number; notified: number }> {
  // Upper bound = 60min decision + tolerance, so a match a few minutes past T-60 is still
  // caught by this tick rather than waiting for the next one.
  const windowEnd = new Date(now.getTime() + (60 + TICK_TOLERANCE_MIN) * MS_PER_MIN);
  const candidates = await autoCancelRepo.getCancelCandidates(
    now.toISOString(),
    windowEnd.toISOString(),
  );

  const organizerById = new Map<string, string>();
  const toCancel: string[] = [];
  for (const c of candidates) {
    if (classifyCandidate(now, c) === 'cancel') {
      toCancel.push(c.id);
      organizerById.set(c.id, c.organizerId);
    }
  }

  if (toCancel.length === 0) {
    return { cancelled: 0, notified: 0 };
  }

  // Idempotent: only ids actually transitioned (status was open/full) come back.
  const cancelledIds = await autoCancelRepo.cancelMatchesByIds(toCancel, CANCEL_REASON);
  if (cancelledIds.length === 0) {
    return { cancelled: 0, notified: 0 };
  }

  // Notify participants (reuse the existing cancellation-notification helper) and union the
  // organizer, who may not be a participant on club-organized matches.
  const participants = await getParticipantsByMatchIds(cancelledIds);
  const withOrganizers = [
    ...participants,
    ...cancelledIds
      .map((id) => ({ playerId: organizerById.get(id) as string, matchId: id }))
      .filter((p) => Boolean(p.playerId)),
  ];
  const notified = await insertCancellationNotifications(withOrganizers, CANCEL_REASON);

  await invalidateMatchCaches(cancelledIds);

  console.info(
    `[matchAutoCancelService.runAutoCancelTick] cancelled=${cancelledIds.length} notified=${notified}`,
  );
  return { cancelled: cancelledIds.length, notified };
}

/**
 * One reminder pass: for matches in the 2h–4h window that are still under-filled, send a
 * one-shot "faltan jugadores" notification per (match, window). Dedup is enforced by the
 * matchReminders UNIQUE constraint — only the tick that wins the marker insert notifies.
 */
export async function runRemindersTick(
  now: Date = new Date(),
): Promise<{ reminders: number }> {
  // Widen the read window slightly past the 4h boundary so a match just entering the 4h
  // window isn't missed between ticks.
  const windowEnd = new Date(now.getTime() + (240 + TICK_TOLERANCE_MIN) * MS_PER_MIN);
  const lowerBound = new Date(now.getTime() + (120 - TICK_TOLERANCE_MIN) * MS_PER_MIN);
  const candidates = await autoCancelRepo.getReminderCandidates(
    lowerBound.toISOString(),
    windowEnd.toISOString(),
  );

  // Pair each candidate with the window it currently sits in (if any) and is under-filled.
  const due = candidates
    .map((c) => ({ candidate: c, kind: reminderKindFor(now, c) }))
    .filter(
      (x): x is { candidate: AutoCancelCandidate; kind: ReminderKind } =>
        x.kind !== null && x.candidate.capacity - x.candidate.participantCount > 0,
    );

  if (due.length === 0) return { reminders: 0 };

  // Pre-filter against already-sent markers to cut down on doomed inserts (the UNIQUE
  // constraint is still the real guard for races).
  const alreadySent = await autoCancelRepo.getAlreadySentReminderKinds(
    due.map((x) => x.candidate.id),
  );

  let sent = 0;
  for (const { candidate, kind } of due) {
    if (alreadySent.has(`${candidate.id}:${kind}`)) continue;

    const won = await autoCancelRepo.insertReminderMarker(candidate.id, kind);
    if (!won) continue; // another tick/instance already handled this (match, kind).

    const participants = await getParticipantsByMatchIds([candidate.id]);
    const recipientIds = [
      ...participants.map((p) => p.playerId),
      candidate.organizerId,
    ];
    const missing = candidate.capacity - candidate.participantCount;
    await autoCancelRepo.insertReminderNotifications(recipientIds, missing, candidate.id);
    sent += 1;
  }

  if (sent > 0) {
    console.info(`[matchAutoCancelService.runRemindersTick] reminders sent=${sent}`);
  }
  return { reminders: sent };
}
