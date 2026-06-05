/**
 * Tests for matchAutoCancelService — the auto-cancel + reminder business rules and the
 * tick orchestration that the cron scheduler drives.
 *
 * Decision Context:
 * - Why: lock in the roster-rule math (threshold, T-60 cancel vs grace, T-30 cancel) and
 *   the idempotency / privacy guarantees so future edits cannot silently regress them.
 * - Strategy: mock the auto-cancel repository, the clubSlotManagement notification helpers,
 *   and the redis cache helpers, so tests focus on the service-level decisions and the
 *   orchestration (who gets cancelled, who gets notified, what cache is invalidated). The
 *   repositories themselves are exercised against Supabase in integration, not here.
 * - Edge cases covered:
 *   - computeThreshold rounding (10→1, 20→2, 22→3, 2→1, 8→1)
 *   - classifyCandidate: T-60 missing>threshold→cancel; T-60 0<missing<=threshold→grace;
 *     T-30 any missing→cancel; full→skip; far-from-kickoff→skip
 *   - runAutoCancelTick: only 'cancel'-classified ids are cancelled; organizer is unioned
 *     into recipients; idempotency (no rows actually transitioned → no notification);
 *     cache invalidation fired
 *   - runRemindersTick: one reminder per (match,kind); marker-lost → no notification;
 *     full match → no reminder; organizer included
 * - Previously fixed bugs: none relevant (new module).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const repoMock = vi.hoisted(() => ({
  getCancelCandidates: vi.fn(),
  getReminderCandidates: vi.fn(),
  cancelMatchesByIds: vi.fn(),
  getAlreadySentReminderKinds: vi.fn(),
  insertReminderMarker: vi.fn(),
  insertReminderNotifications: vi.fn(),
}));

const clubSlotMock = vi.hoisted(() => ({
  getParticipantsByMatchIds: vi.fn(),
  insertCancellationNotifications: vi.fn(),
}));

const cacheMock = vi.hoisted(() => ({
  cacheDelete: vi.fn(),
  cacheDeletePattern: vi.fn(),
}));

vi.mock('../repositories/matchAutoCancelRepository.js', () => repoMock);

vi.mock('../repositories/clubSlotManagementRepository.js', () => ({
  getParticipantsByMatchIds: clubSlotMock.getParticipantsByMatchIds,
  insertCancellationNotifications: clubSlotMock.insertCancellationNotifications,
}));

vi.mock('../config/redis.js', () => ({
  cacheDelete: cacheMock.cacheDelete,
  cacheDeletePattern: cacheMock.cacheDeletePattern,
  CACHE_PREFIX: {
    MATCHES_OPEN: 'matches:open',
    MATCHES_LIST: 'matches:list',
    USER_MATCHES: 'user:matches:',
    MATCH_DETAIL: 'match:',
    MATCH_PARTICIPANTS: 'match:participants:',
  },
}));

import {
  computeThreshold,
  classifyCandidate,
  reminderKindFor,
  runAutoCancelTick,
  runRemindersTick,
} from './matchAutoCancelService.js';
import type { AutoCancelCandidate } from '../repositories/matchAutoCancelRepository.js';

const NOW = new Date('2026-06-05T12:00:00.000Z');

/** Builds a candidate whose kickoff is `minsAhead` minutes from NOW. */
function candidate(
  overrides: Partial<AutoCancelCandidate> & { minsAhead?: number } = {},
): AutoCancelCandidate {
  const { minsAhead = 60, ...rest } = overrides;
  return {
    id: 'm1',
    capacity: 10,
    organizerId: 'org1',
    participantCount: 5,
    scheduledAt: new Date(NOW.getTime() + minsAhead * 60_000).toISOString(),
    ...rest,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('computeThreshold', () => {
  it.each([
    [10, 1],
    [20, 2],
    [22, 3],
    [2, 1],
    [8, 1],
  ])('capacity %i → threshold %i', (capacity, expected) => {
    expect(computeThreshold(capacity)).toBe(expected);
  });
});

describe('classifyCandidate', () => {
  it('T-60 with missing > threshold → cancel (cap20, 5 missing, threshold 2)', () => {
    const c = candidate({ capacity: 20, participantCount: 15, minsAhead: 60 });
    expect(classifyCandidate(NOW, c)).toBe('cancel');
  });

  it('T-60 with 0 < missing <= threshold → grace (cap20, 2 missing, threshold 2)', () => {
    const c = candidate({ capacity: 20, participantCount: 18, minsAhead: 60 });
    expect(classifyCandidate(NOW, c)).toBe('grace');
  });

  it('T-60 with missing == 1 and threshold 1 → grace (cap10)', () => {
    const c = candidate({ capacity: 10, participantCount: 9, minsAhead: 60 });
    expect(classifyCandidate(NOW, c)).toBe('grace');
  });

  it('T-30 with any missing → cancel even within threshold', () => {
    const c = candidate({ capacity: 20, participantCount: 18, minsAhead: 30 });
    expect(classifyCandidate(NOW, c)).toBe('cancel');
  });

  it('full match → skip at T-60', () => {
    const c = candidate({ capacity: 10, participantCount: 10, minsAhead: 60 });
    expect(classifyCandidate(NOW, c)).toBe('skip');
  });

  it('full match → skip at T-30', () => {
    const c = candidate({ capacity: 10, participantCount: 10, minsAhead: 30 });
    expect(classifyCandidate(NOW, c)).toBe('skip');
  });

  it('far from kickoff (3h) → skip even if under-filled', () => {
    const c = candidate({ capacity: 10, participantCount: 4, minsAhead: 180 });
    expect(classifyCandidate(NOW, c)).toBe('skip');
  });

  it('small capacity (cap2) T-60 missing 2 > threshold 1 → cancel', () => {
    const c = candidate({ capacity: 2, participantCount: 0, minsAhead: 60 });
    expect(classifyCandidate(NOW, c)).toBe('cancel');
  });

  it('small capacity (cap2) T-60 missing 1 == threshold 1 → grace', () => {
    const c = candidate({ capacity: 2, participantCount: 1, minsAhead: 60 });
    expect(classifyCandidate(NOW, c)).toBe('grace');
  });
});

describe('reminderKindFor', () => {
  it('returns reminder_4h near 4h before', () => {
    expect(reminderKindFor(NOW, candidate({ minsAhead: 240 }))).toBe('reminder_4h');
  });
  it('returns reminder_2h near 2h before', () => {
    expect(reminderKindFor(NOW, candidate({ minsAhead: 120 }))).toBe('reminder_2h');
  });
  it('returns null outside any window', () => {
    expect(reminderKindFor(NOW, candidate({ minsAhead: 90 }))).toBeNull();
  });
});

describe('runAutoCancelTick', () => {
  it('cancels only candidates classified cancel and notifies participants + organizer', async () => {
    // m1: under-filled at T-60 → cancel. m2: full → skip.
    repoMock.getCancelCandidates.mockResolvedValue([
      candidate({ id: 'm1', capacity: 10, participantCount: 2, organizerId: 'orgA', minsAhead: 60 }),
      candidate({ id: 'm2', capacity: 10, participantCount: 10, organizerId: 'orgB', minsAhead: 60 }),
    ]);
    repoMock.cancelMatchesByIds.mockResolvedValue(['m1']);
    clubSlotMock.getParticipantsByMatchIds.mockResolvedValue([
      { playerId: 'p1', matchId: 'm1' },
      { playerId: 'p2', matchId: 'm1' },
    ]);
    clubSlotMock.insertCancellationNotifications.mockResolvedValue(3);

    const result = await runAutoCancelTick(NOW);

    expect(repoMock.cancelMatchesByIds).toHaveBeenCalledWith(['m1'], expect.any(String));
    // Organizer 'orgA' unioned into the recipients alongside the two participants.
    const notifyArg = clubSlotMock.insertCancellationNotifications.mock.calls[0][0];
    expect(notifyArg).toEqual(
      expect.arrayContaining([
        { playerId: 'p1', matchId: 'm1' },
        { playerId: 'p2', matchId: 'm1' },
        { playerId: 'orgA', matchId: 'm1' },
      ]),
    );
    expect(result).toEqual({ cancelled: 1, notified: 3 });
    // Cache invalidation fired.
    expect(cacheMock.cacheDeletePattern).toHaveBeenCalledWith('matches:list:*');
    expect(cacheMock.cacheDelete).toHaveBeenCalledWith('match:m1');
  });

  it('is a no-op when nothing classifies as cancel', async () => {
    repoMock.getCancelCandidates.mockResolvedValue([
      candidate({ id: 'm1', capacity: 10, participantCount: 10, minsAhead: 60 }), // full
    ]);

    const result = await runAutoCancelTick(NOW);

    expect(repoMock.cancelMatchesByIds).not.toHaveBeenCalled();
    expect(clubSlotMock.insertCancellationNotifications).not.toHaveBeenCalled();
    expect(result).toEqual({ cancelled: 0, notified: 0 });
  });

  it('idempotent: when no rows actually transition, no notifications are sent', async () => {
    repoMock.getCancelCandidates.mockResolvedValue([
      candidate({ id: 'm1', capacity: 10, participantCount: 2, minsAhead: 60 }),
    ]);
    // Already cancelled by a prior tick → update transitions 0 rows.
    repoMock.cancelMatchesByIds.mockResolvedValue([]);

    const result = await runAutoCancelTick(NOW);

    expect(clubSlotMock.insertCancellationNotifications).not.toHaveBeenCalled();
    expect(result).toEqual({ cancelled: 0, notified: 0 });
  });
});

describe('runRemindersTick', () => {
  it('sends one reminder per (match,kind) and includes the organizer', async () => {
    repoMock.getReminderCandidates.mockResolvedValue([
      candidate({ id: 'm1', capacity: 10, participantCount: 6, organizerId: 'orgA', minsAhead: 240 }),
    ]);
    repoMock.getAlreadySentReminderKinds.mockResolvedValue(new Set());
    repoMock.insertReminderMarker.mockResolvedValue(true);
    clubSlotMock.getParticipantsByMatchIds.mockResolvedValue([{ playerId: 'p1', matchId: 'm1' }]);
    repoMock.insertReminderNotifications.mockResolvedValue(2);

    const result = await runRemindersTick(NOW);

    expect(repoMock.insertReminderMarker).toHaveBeenCalledWith('m1', 'reminder_4h');
    const [recipients, missing, matchId] = repoMock.insertReminderNotifications.mock.calls[0];
    expect(recipients).toEqual(expect.arrayContaining(['p1', 'orgA']));
    expect(missing).toBe(4);
    expect(matchId).toBe('m1');
    expect(result).toEqual({ reminders: 1 });
  });

  it('does not notify when the marker insert was lost (already sent by another tick)', async () => {
    repoMock.getReminderCandidates.mockResolvedValue([
      candidate({ id: 'm1', capacity: 10, participantCount: 6, minsAhead: 240 }),
    ]);
    repoMock.getAlreadySentReminderKinds.mockResolvedValue(new Set());
    repoMock.insertReminderMarker.mockResolvedValue(false); // lost the race

    const result = await runRemindersTick(NOW);

    expect(repoMock.insertReminderNotifications).not.toHaveBeenCalled();
    expect(result).toEqual({ reminders: 0 });
  });

  it('skips full matches in the reminder window', async () => {
    repoMock.getReminderCandidates.mockResolvedValue([
      candidate({ id: 'm1', capacity: 10, participantCount: 10, minsAhead: 240 }),
    ]);
    repoMock.getAlreadySentReminderKinds.mockResolvedValue(new Set());

    const result = await runRemindersTick(NOW);

    expect(repoMock.insertReminderMarker).not.toHaveBeenCalled();
    expect(result).toEqual({ reminders: 0 });
  });

  it('skips a (match,kind) already recorded as sent', async () => {
    repoMock.getReminderCandidates.mockResolvedValue([
      candidate({ id: 'm1', capacity: 10, participantCount: 6, minsAhead: 240 }),
    ]);
    repoMock.getAlreadySentReminderKinds.mockResolvedValue(new Set(['m1:reminder_4h']));

    const result = await runRemindersTick(NOW);

    expect(repoMock.insertReminderMarker).not.toHaveBeenCalled();
    expect(result).toEqual({ reminders: 0 });
  });
});
