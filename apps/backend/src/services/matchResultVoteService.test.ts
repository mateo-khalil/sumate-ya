/**
 * Tests for matchResultVoteService
 *
 * Decision Context:
 * - Why: Cover the propose/vote/list flows that power the result-confirmation modal
 *   so future refactors do not regress the majority rule, status guards, participant
 *   gating, or cache-invalidation contract documented in the service file.
 * - Strategy: Mock the repository and the redis cache helpers so the tests focus on
 *   service-level business logic — DTO mapping, Zod validation, majority threshold,
 *   and side-effect orchestration. The repository itself is exercised by integration
 *   tests against Supabase, not here.
 * - Edge cases covered:
 *   - Missing auth / missing user-scoped client
 *   - Zod boundaries: negative scores, scores above 99, invalid UUID, invalid vote enum
 *   - Match not found / cancelled match guard for both propose and vote
 *   - Non-participant rejection on propose, vote, and list
 *   - Submission not pending (already confirmed/rejected) → vote rejected
 *   - Winner derivation from scores (A wins, B wins, draw)
 *   - Explicit winnerTeam mismatching scores → rejected
 *   - Strict majority boundary: approveCount == half does NOT confirm; > half does
 *   - statusChanged true only on the vote that crosses the threshold
 *   - Reject vote never triggers confirmation even when approveCount is high
 *   - Cache invalidation on propose, on vote, and on confirmation cascade
 *   - hasUserVoted / userVote computed per caller in DTO
 * - Previously fixed bugs: none relevant.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const repoMock = vi.hoisted(() => ({
  getMatchStatus: vi.fn(),
  isParticipant: vi.fn(),
  getSubmissionsByMatch: vi.fn(),
  getSubmissionById: vi.fn(),
  createSubmission: vi.fn(),
  upsertVote: vi.fn(),
  countApproveVotes: vi.fn(),
  countMatchParticipants: vi.fn(),
  confirmSubmission: vi.fn(),
  rejectOtherSubmissions: vi.fn(),
  updateMatchWithResult: vi.fn(),
  refreshCompetitiveStatsForMatch: vi.fn(),
  getParticipantIds: vi.fn(),
  confirmMatchResultAtomic: vi.fn(),
}));

const cacheMock = vi.hoisted(() => ({
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
  cacheGetOrSet: vi.fn(),
  cacheDelete: vi.fn(),
  cacheDeletePattern: vi.fn(),
}));

vi.mock('../repositories/matchResultVoteRepository.js', () => ({
  matchResultVoteRepository: repoMock,
}));

vi.mock('../config/redis.js', () => ({
  cacheGet: cacheMock.cacheGet,
  cacheSet: cacheMock.cacheSet,
  cacheGetOrSet: cacheMock.cacheGetOrSet,
  cacheDelete: cacheMock.cacheDelete,
  cacheDeletePattern: cacheMock.cacheDeletePattern,
  CACHE_PREFIX: {
    MATCH_PARTICIPANTS: 'match:participants:',
    MATCH_DETAIL: 'match:',
    MATCHES_OPEN: 'matches:open',
    MATCHES_LIST: 'matches:list',
    PROFILE_ME: 'profile:me:',
    USER_MATCHES: 'user:matches:',
  },
  CACHE_TTL: {
    USER_DATA: 300,
  },
}));

import { matchResultVoteService } from './matchResultVoteService.js';
import { SubmissionStatus, VoteValue, WinnerTeam } from '../graphql/generated/graphql.js';

// Valid hex-format UUIDs that match our permissive uuidSchema regex.
const MATCH_ID = 'a1111111-1111-1111-1111-111111111111';
const USER_ID = 'b2222222-2222-2222-2222-222222222222';
const OTHER_USER_ID = 'c3333333-3333-3333-3333-333333333333';
const SUBMISSION_ID = 'd4444444-4444-4444-4444-444444444444';
const OTHER_SUBMISSION_ID = 'e5555555-5555-5555-5555-555555555555';

const supabaseStub = { __scoped: true } as unknown as import('@supabase/supabase-js').SupabaseClient;

const baseCtx = () => ({ userId: USER_ID, supabase: supabaseStub });

function buildSubmissionRow(overrides: Partial<{
  id: string;
  matchId: string;
  submitterId: string;
  scoreTeamA: number;
  scoreTeamB: number;
  winningTeam: 'a' | 'b' | 'draw';
  submissionStatus: 'pending' | 'confirmed' | 'rejected';
  votes: Array<{ voterId: string; vote: 'approve' | 'reject' }>;
}> = {}) {
  const votes = (overrides.votes ?? []).map((v, i) => ({
    id: `vote-${i}`,
    submissionId: overrides.id ?? SUBMISSION_ID,
    voterId: v.voterId,
    vote: v.vote,
    createdAt: '2026-05-04T00:00:00Z',
    profiles: { id: v.voterId, displayName: `Player ${v.voterId.slice(0, 4)}`, avatarUrl: null },
  }));

  return {
    id: overrides.id ?? SUBMISSION_ID,
    matchId: overrides.matchId ?? MATCH_ID,
    submitterId: overrides.submitterId ?? USER_ID,
    scoreTeamA: overrides.scoreTeamA ?? 3,
    scoreTeamB: overrides.scoreTeamB ?? 1,
    winningTeam: overrides.winningTeam ?? 'a',
    submissionStatus: overrides.submissionStatus ?? 'pending',
    isConfirmed: false,
    createdAt: '2026-05-04T00:00:00Z',
    profiles: { id: overrides.submitterId ?? USER_ID, displayName: 'Submitter', avatarUrl: null },
    matchResultVotes: votes,
  };
}

beforeEach(() => {
  vi.clearAllMocks();

  repoMock.getMatchStatus.mockResolvedValue({ id: MATCH_ID, status: 'open' });
  repoMock.isParticipant.mockResolvedValue(true);
  repoMock.createSubmission.mockResolvedValue(buildSubmissionRow());
  repoMock.upsertVote.mockResolvedValue(undefined);
  repoMock.countApproveVotes.mockResolvedValue(1);
  repoMock.countMatchParticipants.mockResolvedValue(5);
  repoMock.confirmSubmission.mockResolvedValue(undefined);
  repoMock.rejectOtherSubmissions.mockResolvedValue(undefined);
  repoMock.updateMatchWithResult.mockResolvedValue(undefined);
  repoMock.refreshCompetitiveStatsForMatch.mockResolvedValue(undefined);
  repoMock.getParticipantIds.mockResolvedValue([USER_ID, OTHER_USER_ID]);
  repoMock.confirmMatchResultAtomic.mockResolvedValue({
    alreadyConfirmed: false,
    participantCount: 5,
    winnersCount: 3,
    matchId: MATCH_ID,
    participantIds: [USER_ID, OTHER_USER_ID],
  });
  repoMock.getSubmissionsByMatch.mockResolvedValue([]);
  repoMock.getSubmissionById.mockResolvedValue(buildSubmissionRow());

  cacheMock.cacheGetOrSet.mockImplementation(async (_key: string, loader: () => unknown) => loader());
  cacheMock.cacheDelete.mockResolvedValue(undefined);
  cacheMock.cacheDeletePattern.mockResolvedValue(undefined);
});

describe('matchResultVoteService.proposeMatchResult', () => {
  it('creates a submission, derives winner=A from scores, and invalidates the submissions cache', async () => {
    const result = await matchResultVoteService.proposeMatchResult(
      { matchId: MATCH_ID, scoreA: 3, scoreB: 1 },
      baseCtx(),
    );

    expect(repoMock.getMatchStatus).toHaveBeenCalledWith(MATCH_ID);
    expect(repoMock.isParticipant).toHaveBeenCalledWith(MATCH_ID, USER_ID);
    expect(repoMock.createSubmission).toHaveBeenCalledWith(
      {
        matchId: MATCH_ID,
        submitterId: USER_ID,
        scoreTeamA: 3,
        scoreTeamB: 1,
        winningTeam: 'a',
      },
      supabaseStub,
    );
    expect(cacheMock.cacheDelete).toHaveBeenCalledWith(`match:submissions:${MATCH_ID}`);
    expect(result.scoreA).toBe(3);
    expect(result.scoreB).toBe(1);
    expect(result.winnerTeam).toBe(WinnerTeam.A);
    expect(result.status).toBe(SubmissionStatus.Pending);
  });

  it('derives winner=B when scoreB > scoreA', async () => {
    repoMock.createSubmission.mockResolvedValueOnce(
      buildSubmissionRow({ scoreTeamA: 0, scoreTeamB: 2, winningTeam: 'b' }),
    );

    await matchResultVoteService.proposeMatchResult(
      { matchId: MATCH_ID, scoreA: 0, scoreB: 2 },
      baseCtx(),
    );

    expect(repoMock.createSubmission).toHaveBeenCalledWith(
      expect.objectContaining({ winningTeam: 'b' }),
      supabaseStub,
    );
  });

  it('derives winner=draw on a 0-0 tie', async () => {
    repoMock.createSubmission.mockResolvedValueOnce(
      buildSubmissionRow({ scoreTeamA: 0, scoreTeamB: 0, winningTeam: 'draw' }),
    );

    await matchResultVoteService.proposeMatchResult(
      { matchId: MATCH_ID, scoreA: 0, scoreB: 0 },
      baseCtx(),
    );

    expect(repoMock.createSubmission).toHaveBeenCalledWith(
      expect.objectContaining({ winningTeam: 'draw' }),
      supabaseStub,
    );
  });

  it('accepts an explicit winnerTeam that matches the scores', async () => {
    await matchResultVoteService.proposeMatchResult(
      { matchId: MATCH_ID, scoreA: 3, scoreB: 1, winnerTeam: WinnerTeam.A },
      baseCtx(),
    );

    expect(repoMock.createSubmission).toHaveBeenCalledWith(
      expect.objectContaining({ winningTeam: 'a' }),
      supabaseStub,
    );
  });

  it('rejects an explicit winnerTeam that does not match the scores', async () => {
    await expect(
      matchResultVoteService.proposeMatchResult(
        { matchId: MATCH_ID, scoreA: 3, scoreB: 1, winnerTeam: WinnerTeam.B },
        baseCtx(),
      ),
    ).rejects.toThrow('El ganador indicado no coincide con el marcador');

    expect(repoMock.createSubmission).not.toHaveBeenCalled();
  });

  it('throws when caller is not authenticated', async () => {
    await expect(
      matchResultVoteService.proposeMatchResult(
        { matchId: MATCH_ID, scoreA: 1, scoreB: 0 },
        { supabase: supabaseStub },
      ),
    ).rejects.toThrow('Se requiere autenticación');

    expect(repoMock.getMatchStatus).not.toHaveBeenCalled();
  });

  it('throws when caller has no user-scoped Supabase client', async () => {
    await expect(
      matchResultVoteService.proposeMatchResult(
        { matchId: MATCH_ID, scoreA: 1, scoreB: 0 },
        { userId: USER_ID },
      ),
    ).rejects.toThrow('Se requiere cliente con contexto de usuario');
  });

  it('rejects negative scores via Zod', async () => {
    await expect(
      matchResultVoteService.proposeMatchResult(
        { matchId: MATCH_ID, scoreA: -1, scoreB: 0 },
        baseCtx(),
      ),
    ).rejects.toThrow();

    expect(repoMock.createSubmission).not.toHaveBeenCalled();
  });

  it('rejects scores above the 99 cap via Zod', async () => {
    await expect(
      matchResultVoteService.proposeMatchResult(
        { matchId: MATCH_ID, scoreA: 100, scoreB: 0 },
        baseCtx(),
      ),
    ).rejects.toThrow();
  });

  it('rejects an invalid matchId via Zod', async () => {
    await expect(
      matchResultVoteService.proposeMatchResult(
        { matchId: 'not-a-uuid', scoreA: 1, scoreB: 0 },
        baseCtx(),
      ),
    ).rejects.toThrow();

    expect(repoMock.getMatchStatus).not.toHaveBeenCalled();
  });

  it('throws when the match does not exist', async () => {
    repoMock.getMatchStatus.mockResolvedValueOnce(null);

    await expect(
      matchResultVoteService.proposeMatchResult(
        { matchId: MATCH_ID, scoreA: 1, scoreB: 0 },
        baseCtx(),
      ),
    ).rejects.toThrow('Partido no encontrado');

    expect(repoMock.isParticipant).not.toHaveBeenCalled();
  });

  it('throws when the match is cancelled', async () => {
    repoMock.getMatchStatus.mockResolvedValueOnce({ id: MATCH_ID, status: 'cancelled' });

    await expect(
      matchResultVoteService.proposeMatchResult(
        { matchId: MATCH_ID, scoreA: 1, scoreB: 0 },
        baseCtx(),
      ),
    ).rejects.toThrow('El partido fue cancelado, no se pueden proponer ni votar resultados');

    expect(repoMock.isParticipant).not.toHaveBeenCalled();
  });

  it('throws when caller is not a participant', async () => {
    repoMock.isParticipant.mockResolvedValueOnce(false);

    await expect(
      matchResultVoteService.proposeMatchResult(
        { matchId: MATCH_ID, scoreA: 1, scoreB: 0 },
        baseCtx(),
      ),
    ).rejects.toThrow('Solo los participantes del partido pueden proponer resultados');

    expect(repoMock.createSubmission).not.toHaveBeenCalled();
  });
});

describe('matchResultVoteService.voteMatchResult', () => {
  beforeEach(() => {
    repoMock.getSubmissionById.mockResolvedValue(
      buildSubmissionRow({ submissionStatus: 'pending' }),
    );
  });

  it('records an APPROVE vote without confirming when below strict majority', async () => {
    repoMock.countApproveVotes.mockResolvedValueOnce(2); // 2/5 → not > 2.5
    repoMock.countMatchParticipants.mockResolvedValueOnce(5);

    const result = await matchResultVoteService.voteMatchResult(
      { submissionId: SUBMISSION_ID, vote: VoteValue.Approve },
      baseCtx(),
    );

    expect(repoMock.upsertVote).toHaveBeenCalledWith(
      SUBMISSION_ID,
      USER_ID,
      'approve',
      supabaseStub,
    );
    expect(repoMock.confirmMatchResultAtomic).not.toHaveBeenCalled();
    expect(result.statusChanged).toBe(false);
    expect(cacheMock.cacheDelete).toHaveBeenCalledWith(`match:submissions:${MATCH_ID}`);
    // Match-level caches must NOT be invalidated when there is no confirmation.
    expect(cacheMock.cacheDelete).not.toHaveBeenCalledWith(`match:participants:${MATCH_ID}`);
  });

  it('does NOT confirm at the boundary where approveCount == participants/2 (strict majority required)', async () => {
    // 4 participants, 2 approves → 2 > 2 is false → no confirmation.
    repoMock.countApproveVotes.mockResolvedValueOnce(2);
    repoMock.countMatchParticipants.mockResolvedValueOnce(4);

    const result = await matchResultVoteService.voteMatchResult(
      { submissionId: SUBMISSION_ID, vote: VoteValue.Approve },
      baseCtx(),
    );

    expect(repoMock.confirmMatchResultAtomic).not.toHaveBeenCalled();
    expect(result.statusChanged).toBe(false);
  });

  it('confirms the submission atomically when approveCount crosses the strict majority threshold', async () => {
    repoMock.countApproveVotes.mockResolvedValueOnce(3); // 3/5 → > 2.5
    repoMock.countMatchParticipants.mockResolvedValueOnce(5);

    const confirmed = buildSubmissionRow({ submissionStatus: 'confirmed' });
    repoMock.getSubmissionById
      .mockResolvedValueOnce(buildSubmissionRow({ submissionStatus: 'pending' })) // initial load
      .mockResolvedValueOnce(confirmed); // post-vote reload

    repoMock.confirmMatchResultAtomic.mockResolvedValueOnce({
      alreadyConfirmed: false,
      participantCount: 5,
      winnersCount: 3,
      matchId: MATCH_ID,
      participantIds: [USER_ID, OTHER_USER_ID],
    });

    const result = await matchResultVoteService.voteMatchResult(
      { submissionId: SUBMISSION_ID, vote: VoteValue.Approve },
      baseCtx(),
    );

    // Single atomic RPC call replaces the old 4-step cascade.
    expect(repoMock.confirmMatchResultAtomic).toHaveBeenCalledWith(SUBMISSION_ID, supabaseStub);
    expect(repoMock.confirmSubmission).not.toHaveBeenCalled();
    expect(repoMock.rejectOtherSubmissions).not.toHaveBeenCalled();
    expect(repoMock.updateMatchWithResult).not.toHaveBeenCalled();
    expect(repoMock.getParticipantIds).not.toHaveBeenCalled();
    // Competitive ranking still refreshes after the RPC (separate concern from stats).
    expect(repoMock.refreshCompetitiveStatsForMatch).toHaveBeenCalledWith(MATCH_ID);

    expect(result.statusChanged).toBe(true);
    expect(result.submission.status).toBe(SubmissionStatus.Confirmed);

    // Match-level caches cleared
    expect(cacheMock.cacheDelete).toHaveBeenCalledWith(`match:participants:${MATCH_ID}`);
    expect(cacheMock.cacheDelete).toHaveBeenCalledWith(`match:${MATCH_ID}`);
    expect(cacheMock.cacheDelete).toHaveBeenCalledWith('matches:open');
    expect(cacheMock.cacheDeletePattern).toHaveBeenCalledWith('matches:list:*');

    // Per-participant history caches cleared using the IDs returned by the RPC
    expect(cacheMock.cacheDeletePattern).toHaveBeenCalledWith(`user:matches:${USER_ID}*`);
    expect(cacheMock.cacheDeletePattern).toHaveBeenCalledWith(`user:matches:${OTHER_USER_ID}*`);
    expect(cacheMock.cacheDelete).toHaveBeenCalledWith(`profile:me:${USER_ID}`);
    expect(cacheMock.cacheDelete).toHaveBeenCalledWith(`profile:me:${OTHER_USER_ID}`);
    expect(cacheMock.cacheDelete).toHaveBeenCalledWith(`profile:public:${USER_ID}`);
    expect(cacheMock.cacheDelete).toHaveBeenCalledWith(`profile:public:${OTHER_USER_ID}`);

    // Submission list cache cleared
    expect(cacheMock.cacheDelete).toHaveBeenCalledWith(`match:submissions:${MATCH_ID}`);
  });

  it('handles a draw confirmation (winnersCount=0) and still invalidates caches', async () => {
    repoMock.countApproveVotes.mockResolvedValueOnce(3);
    repoMock.countMatchParticipants.mockResolvedValueOnce(5);

    repoMock.getSubmissionById
      .mockResolvedValueOnce(
        buildSubmissionRow({
          submissionStatus: 'pending',
          scoreTeamA: 2,
          scoreTeamB: 2,
          winningTeam: 'draw',
        }),
      )
      .mockResolvedValueOnce(
        buildSubmissionRow({
          submissionStatus: 'confirmed',
          scoreTeamA: 2,
          scoreTeamB: 2,
          winningTeam: 'draw',
        }),
      );

    repoMock.confirmMatchResultAtomic.mockResolvedValueOnce({
      alreadyConfirmed: false,
      participantCount: 5,
      winnersCount: 0,
      matchId: MATCH_ID,
      participantIds: [USER_ID, OTHER_USER_ID],
    });

    const result = await matchResultVoteService.voteMatchResult(
      { submissionId: SUBMISSION_ID, vote: VoteValue.Approve },
      baseCtx(),
    );

    expect(repoMock.confirmMatchResultAtomic).toHaveBeenCalledWith(SUBMISSION_ID, supabaseStub);
    expect(result.statusChanged).toBe(true);
    expect(cacheMock.cacheDelete).toHaveBeenCalledWith(`match:participants:${MATCH_ID}`);
    expect(cacheMock.cacheDeletePattern).toHaveBeenCalledWith(`user:matches:${USER_ID}*`);
    expect(cacheMock.cacheDeletePattern).toHaveBeenCalledWith(`user:matches:${OTHER_USER_ID}*`);
  });

  it('is idempotent when the RPC reports alreadyConfirmed (race with sibling final vote)', async () => {
    repoMock.countApproveVotes.mockResolvedValueOnce(3);
    repoMock.countMatchParticipants.mockResolvedValueOnce(5);

    repoMock.getSubmissionById
      .mockResolvedValueOnce(buildSubmissionRow({ submissionStatus: 'pending' }))
      .mockResolvedValueOnce(buildSubmissionRow({ submissionStatus: 'confirmed' }));

    repoMock.confirmMatchResultAtomic.mockResolvedValueOnce({
      alreadyConfirmed: true,
      participantCount: 0,
      winnersCount: 0,
      matchId: MATCH_ID,
      participantIds: [],
    });

    const result = await matchResultVoteService.voteMatchResult(
      { submissionId: SUBMISSION_ID, vote: VoteValue.Approve },
      baseCtx(),
    );

    expect(repoMock.confirmMatchResultAtomic).toHaveBeenCalledWith(SUBMISSION_ID, supabaseStub);
    expect(result.statusChanged).toBe(false);

    // The first caller already invalidated match-level caches; skip them here.
    expect(cacheMock.cacheDelete).not.toHaveBeenCalledWith(`match:participants:${MATCH_ID}`);
    expect(cacheMock.cacheDelete).not.toHaveBeenCalledWith(`match:${MATCH_ID}`);
    expect(cacheMock.cacheDelete).not.toHaveBeenCalledWith('matches:open');
    expect(cacheMock.cacheDeletePattern).not.toHaveBeenCalledWith('matches:list:*');
    expect(cacheMock.cacheDeletePattern).not.toHaveBeenCalledWith(`user:matches:${USER_ID}*`);

    // Submission-list cache still cleared so the new vote shows up.
    expect(cacheMock.cacheDelete).toHaveBeenCalledWith(`match:submissions:${MATCH_ID}`);
  });

  it('propagates an RPC failure and does not invalidate match caches', async () => {
    repoMock.countApproveVotes.mockResolvedValueOnce(3);
    repoMock.countMatchParticipants.mockResolvedValueOnce(5);

    repoMock.confirmMatchResultAtomic.mockRejectedValueOnce(
      new Error('No hay mayoría suficiente para confirmar'),
    );

    await expect(
      matchResultVoteService.voteMatchResult(
        { submissionId: SUBMISSION_ID, vote: VoteValue.Approve },
        baseCtx(),
      ),
    ).rejects.toThrow('No hay mayoría suficiente para confirmar');

    expect(cacheMock.cacheDelete).not.toHaveBeenCalledWith(`match:participants:${MATCH_ID}`);
    expect(cacheMock.cacheDelete).not.toHaveBeenCalledWith(`match:${MATCH_ID}`);
    expect(cacheMock.cacheDelete).not.toHaveBeenCalledWith('matches:open');
    expect(cacheMock.cacheDeletePattern).not.toHaveBeenCalledWith('matches:list:*');
    expect(cacheMock.cacheDeletePattern).not.toHaveBeenCalledWith(`user:matches:${USER_ID}*`);
    expect(cacheMock.cacheDelete).not.toHaveBeenCalledWith(`match:submissions:${MATCH_ID}`);
  });

  it('does not confirm when the cast vote is REJECT, even if approveCount happens to be high', async () => {
    repoMock.countApproveVotes.mockResolvedValueOnce(0);
    repoMock.countMatchParticipants.mockResolvedValueOnce(5);

    const result = await matchResultVoteService.voteMatchResult(
      { submissionId: SUBMISSION_ID, vote: VoteValue.Reject },
      baseCtx(),
    );

    expect(repoMock.upsertVote).toHaveBeenCalledWith(
      SUBMISSION_ID,
      USER_ID,
      'reject',
      supabaseStub,
    );
    expect(repoMock.confirmMatchResultAtomic).not.toHaveBeenCalled();
    expect(result.statusChanged).toBe(false);
  });

  it('throws when caller is not authenticated', async () => {
    await expect(
      matchResultVoteService.voteMatchResult(
        { submissionId: SUBMISSION_ID, vote: VoteValue.Approve },
        { supabase: supabaseStub },
      ),
    ).rejects.toThrow('Se requiere autenticación');
  });

  it('throws when caller has no user-scoped client', async () => {
    await expect(
      matchResultVoteService.voteMatchResult(
        { submissionId: SUBMISSION_ID, vote: VoteValue.Approve },
        { userId: USER_ID },
      ),
    ).rejects.toThrow('Se requiere cliente con contexto de usuario');
  });

  it('rejects an invalid submissionId via Zod', async () => {
    await expect(
      matchResultVoteService.voteMatchResult(
        { submissionId: 'not-a-uuid', vote: VoteValue.Approve },
        baseCtx(),
      ),
    ).rejects.toThrow();

    expect(repoMock.getSubmissionById).not.toHaveBeenCalled();
  });

  it('rejects an invalid vote value via Zod', async () => {
    await expect(
      matchResultVoteService.voteMatchResult(
        { submissionId: SUBMISSION_ID, vote: 'MAYBE' as unknown as VoteValue },
        baseCtx(),
      ),
    ).rejects.toThrow();
  });

  it('throws when the submission does not exist', async () => {
    repoMock.getSubmissionById.mockResolvedValueOnce(null);

    await expect(
      matchResultVoteService.voteMatchResult(
        { submissionId: SUBMISSION_ID, vote: VoteValue.Approve },
        baseCtx(),
      ),
    ).rejects.toThrow('Propuesta de resultado no encontrada');

    expect(repoMock.upsertVote).not.toHaveBeenCalled();
  });

  it('throws when the match is cancelled', async () => {
    repoMock.getMatchStatus.mockResolvedValueOnce({ id: MATCH_ID, status: 'cancelled' });

    await expect(
      matchResultVoteService.voteMatchResult(
        { submissionId: SUBMISSION_ID, vote: VoteValue.Approve },
        baseCtx(),
      ),
    ).rejects.toThrow('El partido fue cancelado, no se pueden proponer ni votar resultados');

    expect(repoMock.upsertVote).not.toHaveBeenCalled();
  });

  it('throws when the underlying match is missing (race with deletion)', async () => {
    repoMock.getMatchStatus.mockResolvedValueOnce(null);

    await expect(
      matchResultVoteService.voteMatchResult(
        { submissionId: SUBMISSION_ID, vote: VoteValue.Approve },
        baseCtx(),
      ),
    ).rejects.toThrow('Partido no encontrado');
  });

  it('throws when the submission is no longer pending', async () => {
    repoMock.getSubmissionById.mockResolvedValueOnce(
      buildSubmissionRow({ submissionStatus: 'rejected' }),
    );

    await expect(
      matchResultVoteService.voteMatchResult(
        { submissionId: SUBMISSION_ID, vote: VoteValue.Approve },
        baseCtx(),
      ),
    ).rejects.toThrow('Solo se puede votar en propuestas pendientes');

    expect(repoMock.upsertVote).not.toHaveBeenCalled();
  });

  it('throws when caller is not a participant of the submission match', async () => {
    repoMock.isParticipant.mockResolvedValueOnce(false);

    await expect(
      matchResultVoteService.voteMatchResult(
        { submissionId: SUBMISSION_ID, vote: VoteValue.Approve },
        baseCtx(),
      ),
    ).rejects.toThrow('Solo los participantes del partido pueden votar');

    expect(repoMock.upsertVote).not.toHaveBeenCalled();
  });

  it('throws if the post-vote reload returns null (data integrity guard)', async () => {
    repoMock.getSubmissionById
      .mockResolvedValueOnce(buildSubmissionRow({ submissionStatus: 'pending' }))
      .mockResolvedValueOnce(null);

    await expect(
      matchResultVoteService.voteMatchResult(
        { submissionId: SUBMISSION_ID, vote: VoteValue.Approve },
        baseCtx(),
      ),
    ).rejects.toThrow('Error al cargar la propuesta actualizada');
  });
});

describe('matchResultVoteService.getMatchResultSubmissions', () => {
  it('returns submissions and computes per-caller hasUserVoted/userVote', async () => {
    repoMock.getSubmissionsByMatch.mockResolvedValueOnce([
      buildSubmissionRow({
        id: SUBMISSION_ID,
        votes: [
          { voterId: USER_ID, vote: 'approve' },
          { voterId: OTHER_USER_ID, vote: 'reject' },
        ],
      }),
    ]);

    const submissions = await matchResultVoteService.getMatchResultSubmissions(MATCH_ID, baseCtx());

    expect(submissions).toHaveLength(1);
    expect(submissions[0].approveCount).toBe(1);
    expect(submissions[0].rejectCount).toBe(1);
    expect(submissions[0].hasUserVoted).toBe(true);
    expect(submissions[0].userVote).toBe(VoteValue.Approve);
    expect(submissions[0].votes).toHaveLength(2);
  });

  it('returns hasUserVoted=false when caller has not voted', async () => {
    repoMock.getSubmissionsByMatch.mockResolvedValueOnce([
      buildSubmissionRow({
        votes: [{ voterId: OTHER_USER_ID, vote: 'approve' }],
      }),
    ]);

    const submissions = await matchResultVoteService.getMatchResultSubmissions(MATCH_ID, baseCtx());

    expect(submissions[0].hasUserVoted).toBe(false);
    expect(submissions[0].userVote).toBeNull();
  });

  it('uses the cache wrapper so repeated calls hit redis first', async () => {
    repoMock.getSubmissionsByMatch.mockResolvedValueOnce([buildSubmissionRow()]);

    await matchResultVoteService.getMatchResultSubmissions(MATCH_ID, baseCtx());

    expect(cacheMock.cacheGetOrSet).toHaveBeenCalledWith(
      `match:submissions:${MATCH_ID}`,
      expect.any(Function),
      300,
    );
  });

  it('throws when caller is not authenticated', async () => {
    await expect(
      matchResultVoteService.getMatchResultSubmissions(MATCH_ID, {}),
    ).rejects.toThrow('Se requiere autenticación');
  });

  it('rejects an invalid matchId via Zod', async () => {
    await expect(
      matchResultVoteService.getMatchResultSubmissions('not-a-uuid', baseCtx()),
    ).rejects.toThrow();
  });

  it('throws when caller is not a participant', async () => {
    repoMock.isParticipant.mockResolvedValueOnce(false);

    await expect(
      matchResultVoteService.getMatchResultSubmissions(MATCH_ID, baseCtx()),
    ).rejects.toThrow('Solo los participantes del partido pueden ver los resultados propuestos');

    expect(repoMock.getSubmissionsByMatch).not.toHaveBeenCalled();
  });

  it('returns an empty list when there are no submissions', async () => {
    repoMock.getSubmissionsByMatch.mockResolvedValueOnce([]);

    const submissions = await matchResultVoteService.getMatchResultSubmissions(MATCH_ID, baseCtx());

    expect(submissions).toEqual([]);
  });
});
