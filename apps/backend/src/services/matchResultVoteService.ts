/**
 * MatchResultVote Service — business logic for result proposals and voting
 *
 * Decision Context:
 * - Why: Separates business rules from DB access per backend.md service pattern.
 * - Majority rule: a submission is confirmed when approveCount > totalParticipants / 2.
 *   This means > 50% (strict majority), not >= 50%. With 5 players, 3 approvals confirm.
 * - Column mapping: DB uses scoreTeamA/scoreTeamB/winningTeam; GraphQL uses scoreA/scoreB/
 *   winnerTeam. Mapping lives here in toSubmissionDTO so resolvers see clean GQL types.
 * - winnerTeam derivation: if scoreA > scoreB → 'a', scoreB > scoreA → 'b', else 'draw'.
 *   If caller passes an explicit winnerTeam in ProposeMatchResultInput we use that instead,
 *   but we still validate it matches the score (prevents inconsistent data).
 * - Cache invalidation on confirmation:
 *   - match:participants:{id} and match:{id} → cleared so detail page shows updated score
 *   - user:matches:{userId}* → cleared for every participant so history shows result
 *   - matches result submissions cache → cleared so future reads reflect confirmed state
 * - Race condition on last vote: two simultaneous votes could both read approveCount < threshold
 *   and both trigger confirmSubmission. confirmSubmission is idempotent (UPDATE WHERE id=x
 *   always sets the same values). The second call is a harmless no-op.
 * - UUID validation: uses uuidSchema from lib/validators.ts (permissive hex-format regex)
 *   instead of z.string().uuid(). Zod v4 uuid() enforces RFC 9562 version bits and rejects
 *   seeded test UUIDs (e.g., e1000000-0000-0000-0000-000000000001). The regex matches what
 *   Postgres accepts. Do NOT revert to z.string().uuid() — it will break all seeded test data.
 * - Previously fixed bugs: Zod v4 uuid() rejected seeded UUIDs in proposeMatchResult and
 *   voteMatchResult, displaying a raw JSON error in the frontend.
 */

import { z } from 'zod';
import { uuidSchema } from '../lib/validators.js';
import {
  cacheDelete,
  cacheDeletePattern,
  cacheGetOrSet,
  CACHE_PREFIX,
  CACHE_TTL,
} from '../config/redis.js';
import {
  SubmissionStatus,
  VoteValue,
  WinnerTeam,
  type MatchResultSubmission,
  type VoteSubmissionResult,
} from '../graphql/generated/graphql.js';
import { matchResultVoteRepository, type SubmissionRow, type VoteRow, type MatchStatusRow } from '../repositories/matchResultVoteRepository.js';
import type { ServiceContext } from '../types/context.js';

// =====================================================
// Cache key prefix for submissions lists
// =====================================================

const SUBMISSIONS_PREFIX = 'match:submissions:';

// =====================================================
// Zod Validation Schemas
// =====================================================

const proposeSchema = z.object({
  matchId: uuidSchema,
  scoreA: z.number().int().min(0, { message: 'El marcador no puede ser negativo' }).max(99, { message: 'Marcador demasiado alto' }),
  scoreB: z.number().int().min(0, { message: 'El marcador no puede ser negativo' }).max(99, { message: 'Marcador demasiado alto' }),
  winnerTeam: z.enum(['A', 'B', 'DRAW']).optional(),
});

const voteSchema = z.object({
  submissionId: uuidSchema,
  vote: z.enum(['APPROVE', 'REJECT'], { message: 'Voto inválido' }),
});

// =====================================================
// Enum Mapping (GraphQL <-> Database)
// =====================================================

const DB_TO_WINNER: Record<string, WinnerTeam> = {
  a: WinnerTeam.A,
  b: WinnerTeam.B,
  draw: WinnerTeam.Draw,
};

const WINNER_TO_DB: Record<WinnerTeam, 'a' | 'b' | 'draw'> = {
  [WinnerTeam.A]: 'a',
  [WinnerTeam.B]: 'b',
  [WinnerTeam.Draw]: 'draw',
};

const DB_TO_STATUS: Record<string, SubmissionStatus> = {
  pending: SubmissionStatus.Pending,
  confirmed: SubmissionStatus.Confirmed,
  rejected: SubmissionStatus.Rejected,
};

const DB_TO_VOTE: Record<string, VoteValue> = {
  approve: VoteValue.Approve,
  reject: VoteValue.Reject,
};

// =====================================================
// DTO Transformation
// =====================================================

/**
 * Derive winner from scores when not explicitly provided.
 */
function deriveWinner(scoreA: number, scoreB: number): 'a' | 'b' | 'draw' {
  if (scoreA > scoreB) return 'a';
  if (scoreB > scoreA) return 'b';
  return 'draw';
}

function toVoteDTO(voteRow: VoteRow, callerId: string | undefined): ReturnType<typeof toSubmissionDTO>['votes'][number] {
  return {
    id: voteRow.id,
    voter: {
      id: voteRow.profiles.id,
      displayName: voteRow.profiles.displayName,
      avatarUrl: voteRow.profiles.avatarUrl ?? null,
    },
    vote: DB_TO_VOTE[voteRow.vote] ?? VoteValue.Approve,
    createdAt: voteRow.createdAt,
  };
}

function toSubmissionDTO(
  row: SubmissionRow,
  callerId: string | undefined,
): MatchResultSubmission {
  const votes = row.matchResultVotes.map((v) => toVoteDTO(v, callerId));
  const approveCount = row.matchResultVotes.filter((v) => v.vote === 'approve').length;
  const rejectCount = row.matchResultVotes.filter((v) => v.vote === 'reject').length;

  const userVoteRow = callerId
    ? row.matchResultVotes.find((v) => v.voterId === callerId)
    : undefined;

  return {
    id: row.id,
    matchId: row.matchId,
    submitter: {
      id: row.profiles.id,
      displayName: row.profiles.displayName,
      avatarUrl: row.profiles.avatarUrl ?? null,
    },
    scoreA: row.scoreTeamA,
    scoreB: row.scoreTeamB,
    winnerTeam: DB_TO_WINNER[row.winningTeam] ?? WinnerTeam.Draw,
    status: DB_TO_STATUS[row.submissionStatus] ?? SubmissionStatus.Pending,
    votes,
    approveCount,
    rejectCount,
    hasUserVoted: !!userVoteRow,
    userVote: userVoteRow ? (DB_TO_VOTE[userVoteRow.vote] ?? null) : null,
    createdAt: row.createdAt,
  };
}

// =====================================================
// Service Functions
// =====================================================

/**
 * Propose a match result.
 *
 * Decision Context:
 * - Validation order:
 *   1. Auth + user-scoped client required.
 *   2. Zod schema validates IDs, score ranges.
 *   3. Match existence + status check — cancelled matches reject proposals.
 *   4. Participant check — non-participants are rejected with a clear error.
 *   5. winnerTeam is derived from scores if omitted; if provided, must match the scores.
 *   6. INSERT via user-scoped client so RLS INSERT policy is enforced.
 * - Multiple pending submissions per match are allowed (Caso B in spec).
 *   The first to reach majority wins; others are auto-rejected.
 * - Previously fixed bugs: P1 audit — no status check allowed proposals on cancelled matches.
 */
export async function proposeMatchResult(
  input: { matchId: string; scoreA: number; scoreB: number; winnerTeam?: WinnerTeam | null },
  ctx: ServiceContext,
): Promise<MatchResultSubmission> {
  if (!ctx.userId) throw new Error('Se requiere autenticación');
  const db = ctx.supabase;
  if (!db) throw new Error('Se requiere cliente con contexto de usuario');

  const parsed = proposeSchema.parse({
    matchId: input.matchId,
    scoreA: input.scoreA,
    scoreB: input.scoreB,
    winnerTeam: input.winnerTeam ?? undefined,
  });

  // Guard: load match status before any participant/DB write check
  const matchStatus = await matchResultVoteRepository.getMatchStatus(parsed.matchId);
  if (!matchStatus) throw new Error('Partido no encontrado');
  if (matchStatus.status === 'cancelled') {
    throw new Error('El partido fue cancelado, no se pueden proponer ni votar resultados');
  }

  const isPlayer = await matchResultVoteRepository.isParticipant(parsed.matchId, ctx.userId);
  if (!isPlayer) {
    throw new Error('Solo los participantes del partido pueden proponer resultados');
  }

  const dbWinner = parsed.winnerTeam
    ? WINNER_TO_DB[parsed.winnerTeam as WinnerTeam]
    : deriveWinner(parsed.scoreA, parsed.scoreB);

  const expectedWinner = deriveWinner(parsed.scoreA, parsed.scoreB);
  if (parsed.winnerTeam && dbWinner !== expectedWinner) {
    throw new Error('El ganador indicado no coincide con el marcador');
  }

  const row = await matchResultVoteRepository.createSubmission(
    {
      matchId: parsed.matchId,
      submitterId: ctx.userId,
      scoreTeamA: parsed.scoreA,
      scoreTeamB: parsed.scoreB,
      winningTeam: dbWinner,
    },
    db,
  );

  console.info(
    `[matchResultVoteService.proposeMatchResult] userId=${ctx.userId} matchId=${parsed.matchId} score=${parsed.scoreA}-${parsed.scoreB}`,
  );

  await cacheDelete(`${SUBMISSIONS_PREFIX}${parsed.matchId}`);

  return toSubmissionDTO(row, ctx.userId);
}

/**
 * Cast or change a vote on an existing submission.
 *
 * Decision Context:
 * - Validation order:
 *   1. Auth + user-scoped client required.
 *   2. Zod validates submissionId UUID and vote enum.
 *   3. Load submission to get matchId.
 *   4. Match existence + status check — cancelled matches reject votes.
 *   5. Submission status check — only pending submissions accept votes.
 *   6. Participant check on the submission's match.
 *   7. UPSERT vote — the UNIQUE(submissionId, voterId) constraint means a re-vote
 *      updates the existing row (Caso E: user changes their vote).
 *   8. Re-count approvals after the upsert.
 *   9. If approveCount > totalParticipants / 2 → confirm submission, reject others,
 *      update match, invalidate cache.
 * - statusChanged is true only when this specific vote triggered the confirmation,
 *   letting the frontend show a "partido confirmado" notification once.
 * - Previously fixed bugs: P1 audit — no status check allowed votes on cancelled matches.
 */
export async function voteMatchResult(
  input: { submissionId: string; vote: VoteValue },
  ctx: ServiceContext,
): Promise<VoteSubmissionResult> {
  if (!ctx.userId) throw new Error('Se requiere autenticación');
  const db = ctx.supabase;
  if (!db) throw new Error('Se requiere cliente con contexto de usuario');

  const parsed = voteSchema.parse({
    submissionId: input.submissionId,
    vote: input.vote,
  });

  const submission = await matchResultVoteRepository.getSubmissionById(parsed.submissionId);
  if (!submission) throw new Error('Propuesta de resultado no encontrada');

  // Guard: check match status before allowing vote
  const matchStatus = await matchResultVoteRepository.getMatchStatus(submission.matchId);
  if (!matchStatus) throw new Error('Partido no encontrado');
  if (matchStatus.status === 'cancelled') {
    throw new Error('El partido fue cancelado, no se pueden proponer ni votar resultados');
  }

  if (submission.submissionStatus !== 'pending') {
    throw new Error('Solo se puede votar en propuestas pendientes');
  }

  const isPlayer = await matchResultVoteRepository.isParticipant(submission.matchId, ctx.userId);
  if (!isPlayer) {
    throw new Error('Solo los participantes del partido pueden votar');
  }

  const dbVote = parsed.vote === 'APPROVE' ? 'approve' : 'reject';
  await matchResultVoteRepository.upsertVote(parsed.submissionId, ctx.userId, dbVote, db);

  console.info(
    `[matchResultVoteService.voteMatchResult] userId=${ctx.userId} submissionId=${parsed.submissionId} vote=${dbVote}`,
  );

  const [approveCount, totalParticipants] = await Promise.all([
    matchResultVoteRepository.countApproveVotes(parsed.submissionId),
    matchResultVoteRepository.countMatchParticipants(submission.matchId),
  ]);

  let statusChanged = false;

  if (approveCount > totalParticipants / 2) {
    statusChanged = true;

    await matchResultVoteRepository.confirmSubmission(parsed.submissionId);
    await matchResultVoteRepository.rejectOtherSubmissions(
      submission.matchId,
      parsed.submissionId,
    );
    await matchResultVoteRepository.updateMatchWithResult(
      submission.matchId,
      submission.scoreTeamA,
      submission.scoreTeamB,
      submission.winningTeam,
    );

    console.info(
      `[matchResultVoteService.voteMatchResult] submissionId=${parsed.submissionId} confirmed — match ${submission.matchId} completed`,
    );

    // Invalidate match caches
    await cacheDelete(`${CACHE_PREFIX.MATCH_PARTICIPANTS}${submission.matchId}`);
    await cacheDelete(`${CACHE_PREFIX.MATCH_DETAIL}${submission.matchId}`);
    await cacheDelete(CACHE_PREFIX.MATCHES_OPEN);
    await cacheDeletePattern(`${CACHE_PREFIX.MATCHES_LIST}:*`);

    // Invalidate history cache for all participants
    const participantIds = await matchResultVoteRepository.getParticipantIds(submission.matchId);
    await Promise.all(
      participantIds.map((uid) =>
        cacheDeletePattern(`${CACHE_PREFIX.USER_MATCHES}${uid}*`),
      ),
    );
  }

  await cacheDelete(`${SUBMISSIONS_PREFIX}${submission.matchId}`);

  const updatedSubmission = await matchResultVoteRepository.getSubmissionById(parsed.submissionId);
  if (!updatedSubmission) throw new Error('Error al cargar la propuesta actualizada');

  return {
    submission: toSubmissionDTO(updatedSubmission, ctx.userId),
    statusChanged,
  };
}

/**
 * List all submissions for a match, with per-user voting context.
 * Cached with a 5-minute TTL; invalidated on propose and vote mutations.
 *
 * Decision Context:
 * - hasUserVoted and userVote are computed from the vote list in memory (no extra DB query).
 * - The cache key is per-match (not per-user) because the vote list itself is the same for
 *   all participants. Per-user fields (hasUserVoted, userVote) are re-derived after cache hit
 *   using the callerId at the DTO layer.
 * - Previously fixed bugs: none relevant.
 */
export async function getMatchResultSubmissions(
  matchId: string,
  ctx: ServiceContext,
): Promise<MatchResultSubmission[]> {
  if (!ctx.userId) throw new Error('Se requiere autenticación');

  const parsed = uuidSchema.parse(matchId);

  const isPlayer = await matchResultVoteRepository.isParticipant(parsed, ctx.userId);
  if (!isPlayer) {
    throw new Error('Solo los participantes del partido pueden ver los resultados propuestos');
  }

  const userId = ctx.userId;
  const cacheKey = `${SUBMISSIONS_PREFIX}${parsed}`;

  const rows = await cacheGetOrSet<SubmissionRow[]>(
    cacheKey,
    () => matchResultVoteRepository.getSubmissionsByMatch(parsed),
    CACHE_TTL.USER_DATA,
  );

  return rows.map((row) => toSubmissionDTO(row, userId));
}

export const matchResultVoteService = {
  proposeMatchResult,
  voteMatchResult,
  getMatchResultSubmissions,
};
