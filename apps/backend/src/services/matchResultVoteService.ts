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
 * - Atomic confirmation: when approveCount > totalParticipants / 2 the cascade is delegated
 *   to the `confirm_match_result_submission` RPC (see migration
 *   20260511020000_confirm_match_result_rpc.sql). The RPC, inside a single transaction with
 *   FOR UPDATE locks on the submission and the match, performs: (1) submission confirm +
 *   reject siblings, (2) match score/status update, (3) profiles.matchesPlayed +1 for every
 *   participant, (4) profiles.matchesWon +1 only when winningTeam is 'a' or 'b' (no
 *   matchesWon updates on draws — no matchesDrawn column yet), (5) a `match_result_confirmed`
 *   notification for every participant. The service stays responsible for cache invalidation.
 * - Idempotency / race handling: the RPC returns `alreadyConfirmed: true` when a sibling
 *   final-vote already confirmed under the lock. In that case statusChanged stays false and
 *   the service skips cache invalidation (the first caller already did it). The match-level
 *   `cacheDelete` for submissions still runs unconditionally so the vote itself shows up.
 * - If the RPC raises (e.g. "No hay mayoría suficiente para confirmar" due to a vote retracted
 *   between the count and the lock), the error propagates and NO caches are invalidated.
 * - UUID validation: uses uuidSchema from lib/validators.ts (permissive hex-format regex)
 *   instead of z.string().uuid(). Zod v4 uuid() enforces RFC 9562 version bits and rejects
 *   seeded test UUIDs (e.g., e1000000-0000-0000-0000-000000000001). The regex matches the
 *   canonical hyphenated UUID format used in this project. Do NOT revert to z.string().uuid()
 *   — it will break all seeded test data.
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
  MatchTeam,
  SubmissionStatus,
  VoteValue,
  WinnerTeam,
  type MatchResultSubmission,
  type MatchParticipantsData,
  type VoteSubmissionResult,
} from '../graphql/generated/graphql.js';
import { matchResultVoteRepository, type SubmissionRow, type VoteRow, type MatchStatusRow } from '../repositories/matchResultVoteRepository.js';
import { matchRepository, type MatchDetailRow } from '../repositories/matchRepository.js';
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

const reassignSchema = z.object({
  matchId: uuidSchema,
  assignments: z
    .array(
      z.object({
        playerId: uuidSchema,
        team: z.enum(['A', 'B'], { message: 'Equipo inválido' }),
      }),
    )
    .min(1, { message: 'Indicá al menos una asignación de equipo' }),
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

  // Guard: load match timing before any participant/DB write check.
  // End-of-match gate (defense in depth): the frontend only shows the result section once
  // the match has ended (scheduledAt + durationMin), but a crafted request could bypass the
  // UI — so the service refuses proposals while the match is still in play. durationMin is
  // nullable for legacy rows; fall back to 60 minutes to match the frontend default.
  const matchTiming = await matchResultVoteRepository.getMatchTiming(parsed.matchId);
  if (!matchTiming) throw new Error('Partido no encontrado');
  if (matchTiming.status === 'cancelled') {
    throw new Error('El partido fue cancelado, no se pueden proponer ni votar resultados');
  }
  const endMs =
    new Date(matchTiming.scheduledAt).getTime() + (matchTiming.durationMin ?? 60) * 60_000;
  if (Date.now() < endMs) {
    throw new Error('El partido todavía está en juego, volvé más tarde para cargar el resultado');
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
    const result = await matchResultVoteRepository.confirmMatchResultAtomic(
      parsed.submissionId,
      db,
    );

    if (!result.alreadyConfirmed) {
      statusChanged = true;

      // Recalcula la división competitiva (matchesPlayed/Won ya los hizo la RPC, pero el
      // ranking derivado por matchId vive en otra tabla y se refresca aparte).
      // Solo cuando este caller cruzó la mayoría — si fue idempotency, ya lo hizo el otro.
      await matchResultVoteRepository.refreshCompetitiveStatsForMatch(result.matchId);

      console.info(
        `[matchResultVoteService.voteMatchResult] submissionId=${parsed.submissionId} confirmed atomically — match=${result.matchId} participantsUpdated=${result.participantCount} winnersUpdated=${result.winnersCount}`,
      );

      // Invalidate match-scoped caches
      await cacheDelete(`${CACHE_PREFIX.MATCH_PARTICIPANTS}${result.matchId}`);
      await cacheDelete(`${CACHE_PREFIX.MATCH_DETAIL}${result.matchId}`);
      await cacheDelete(CACHE_PREFIX.MATCHES_OPEN);
      await cacheDeletePattern(`${CACHE_PREFIX.MATCHES_LIST}:*`);

      // Invalidate per-participant caches (history + profile views).
      // participantIds viene en la respuesta de la RPC — evita el round-trip extra que
      // hacía getParticipantIds (deprecated).
      await Promise.all(
        result.participantIds.flatMap((uid) => [
          cacheDeletePattern(`${CACHE_PREFIX.USER_MATCHES}${uid}*`),
          cacheDelete(`${CACHE_PREFIX.PROFILE_ME}${uid}`),
          cacheDelete(`profile:public:${uid}`),
        ]),
      );
    } else {
      // Race condition: another vote already triggered confirmation.
      // statusChanged stays false; caches/stats refresh were done by the first caller.
      console.info(
        `[matchResultVoteService.voteMatchResult] submissionId=${parsed.submissionId} already confirmed — no-op`,
      );
    }
  }

  // "All voted" early resolution (US: "o si todos los jugadores ya votaron").
  // When no submission crossed the strict approve-majority above but every participant has
  // now cast at least one vote, resolve immediately instead of waiting for the 24h deadline:
  // the resolve RPC picks the pending proposal with the MOST approvals and applies the same
  // cascade (it also refreshes competitive stats internally). The 24h pg_cron path is the
  // fallback for matches where not everyone votes.
  if (!statusChanged) {
    const distinctVoters = await matchResultVoteRepository.countDistinctVotersForMatch(
      submission.matchId,
    );

    if (totalParticipants > 0 && distinctVoters >= totalParticipants) {
      const resolveResult = await matchResultVoteRepository.resolveMatchResultVoting(
        submission.matchId,
        db,
      );

      if (resolveResult.resolved) {
        statusChanged = true;

        console.info(
          `[matchResultVoteService.voteMatchResult] all participants voted — resolved match=${submission.matchId} via majority of approvals`,
        );

        // Stats/division already refreshed inside the RPC; only invalidate caches here.
        await cacheDelete(`${CACHE_PREFIX.MATCH_PARTICIPANTS}${submission.matchId}`);
        await cacheDelete(`${CACHE_PREFIX.MATCH_DETAIL}${submission.matchId}`);
        await cacheDelete(CACHE_PREFIX.MATCHES_OPEN);
        await cacheDeletePattern(`${CACHE_PREFIX.MATCHES_LIST}:*`);

        await Promise.all(
          resolveResult.participantIds.flatMap((uid) => [
            cacheDeletePattern(`${CACHE_PREFIX.USER_MATCHES}${uid}*`),
            cacheDelete(`${CACHE_PREFIX.PROFILE_ME}${uid}`),
            cacheDelete(`profile:public:${uid}`),
          ]),
        );
      } else {
        console.info(
          `[matchResultVoteService.voteMatchResult] all participants voted but match=${submission.matchId} not resolved — reason=${resolveResult.reason ?? 'unknown'}`,
        );
      }
    }
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

/**
 * Build the GraphQL MatchParticipantsData (team rosters + counts) from a detail row.
 * Mirrors the shape produced by matchService.toMatchDetail so the reassign mutation can
 * return the freshly-updated rosters without coupling to that module.
 */
function buildParticipantsData(row: MatchDetailRow): MatchParticipantsData {
  const map = (team: 'a' | 'b') =>
    row.matchParticipants
      .filter((p) => p.team === team)
      .map((p) => ({
        id: p.profiles.id,
        displayName: p.profiles.displayName,
        avatarUrl: p.profiles.avatarUrl ?? null,
        preferredPosition: p.profiles.preferredPosition ?? null,
        division: p.profiles.division,
      }));

  const teamA = map('a');
  const teamB = map('b');
  const spotsPerTeam = Math.floor(row.capacity / 2);

  return {
    teamA,
    teamB,
    teamACount: teamA.length,
    teamBCount: teamB.length,
    totalCount: teamA.length + teamB.length,
    spotsLeftA: Math.max(0, spotsPerTeam - teamA.length),
    spotsLeftB: Math.max(0, spotsPerTeam - teamB.length),
  };
}

/**
 * Reassign participants between Team A and Team B (roster correction at result time).
 *
 * Decision Context:
 * - Why: matchesWon is computed from matchParticipants.team at confirmation, so a participant
 *   loading the result must be able to fix rosters that changed mid-match or were set wrong at
 *   join time, BEFORE the result is confirmed.
 * - Authorization + window/confirmation guards live in the reassign_match_teams RPC
 *   (SECURITY DEFINER) because matchParticipants has no UPDATE RLS policy by design. The
 *   participant check is duplicated here for a clean early error message.
 * - GraphQL teams (A/B) are mapped to the lowercase matchTeam enum (a/b) before the RPC call.
 * - Caches: match:participants:{id} and match:{id} are invalidated so the SSR detail page and
 *   the result section read the corrected rosters on the next load.
 * - Returns the updated rosters so the client can reflect the change without a full refetch.
 * - Previously fixed bugs: none relevant (new capability).
 */
export async function reassignMatchTeams(
  input: { matchId: string; assignments: { playerId: string; team: MatchTeam }[] },
  ctx: ServiceContext,
): Promise<MatchParticipantsData> {
  if (!ctx.userId) throw new Error('Se requiere autenticación');
  const db = ctx.supabase;
  if (!db) throw new Error('Se requiere cliente con contexto de usuario');

  const parsed = reassignSchema.parse(input);

  const isPlayer = await matchResultVoteRepository.isParticipant(parsed.matchId, ctx.userId);
  if (!isPlayer) {
    throw new Error('Solo los participantes del partido pueden editar los equipos');
  }

  const assignments = parsed.assignments.map((a) => ({
    playerId: a.playerId,
    team: (a.team === 'A' ? 'a' : 'b') as 'a' | 'b',
  }));

  await matchResultVoteRepository.reassignMatchTeams(parsed.matchId, assignments, db);

  console.info(
    `[matchResultVoteService.reassignMatchTeams] userId=${ctx.userId} matchId=${parsed.matchId} assignments=${assignments.length}`,
  );

  await cacheDelete(`${CACHE_PREFIX.MATCH_PARTICIPANTS}${parsed.matchId}`);
  await cacheDelete(`${CACHE_PREFIX.MATCH_DETAIL}${parsed.matchId}`);

  const row = await matchRepository.getMatchWithParticipants(parsed.matchId);
  if (!row) throw new Error('Partido no encontrado');

  return buildParticipantsData(row);
}

export const matchResultVoteService = {
  proposeMatchResult,
  voteMatchResult,
  getMatchResultSubmissions,
  reassignMatchTeams,
};
