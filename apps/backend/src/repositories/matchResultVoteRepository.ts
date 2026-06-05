/**
 * MatchResultVote Repository — database access for result submissions and votes
 *
 * Decision Context:
 * - Why: Isolated repository keeps DB queries out of the service layer per backend.md rules.
 * - Column mapping: DB uses scoreTeamA/scoreTeamB/winningTeam/submissionStatus;
 *   this layer returns raw DB rows — the service maps them to GraphQL names.
 * - Egress prevention: every SELECT lists explicit columns (no select('*')).
 * - Service-role vs user-scoped:
 *   - createSubmission / upsertVote: called with user-scoped client so RLS INSERT policies
 *     (submitterId/voterId = auth.uid() + participant check) are enforced.
 *   - confirmSubmission / rejectOtherSubmissions / updateMatchWithResult: use the singleton
 *     service-role client because these are system-triggered state transitions, not user
 *     actions. The authenticated UPDATE policy on matches only allows the organizer, so
 *     result confirmation must bypass RLS just like updateMatchStatus does.
 * - Previously fixed bugs: none relevant.
 */

import { supabase } from '../config/supabase.js';
import type { SupabaseClient } from '../config/supabase.js';

// =====================================================
// Column Definitions (NEVER select('*'))
// =====================================================

const SUBMISSION_COLUMNS = `
  id,
  "matchId",
  "submitterId",
  "scoreTeamA",
  "scoreTeamB",
  "winningTeam",
  "submissionStatus",
  "isConfirmed",
  "createdAt"
`;

const SUBMITTER_COLUMNS = `id, "displayName", "avatarUrl"`;

const VOTE_COLUMNS = `
  id,
  "submissionId",
  "voterId",
  vote,
  "createdAt"
`;

const VOTER_COLUMNS = `id, "displayName", "avatarUrl"`;

// =====================================================
// Row Types
// =====================================================

export interface SubmitterRow {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface VoteRow {
  id: string;
  submissionId: string;
  voterId: string;
  vote: 'approve' | 'reject';
  createdAt: string;
  profiles: SubmitterRow;
}

export interface SubmissionRow {
  id: string;
  matchId: string;
  submitterId: string;
  scoreTeamA: number;
  scoreTeamB: number;
  winningTeam: 'a' | 'b' | 'draw';
  submissionStatus: 'pending' | 'confirmed' | 'rejected';
  isConfirmed: boolean;
  createdAt: string;
  profiles: SubmitterRow;
  matchResultVotes: VoteRow[];
}

export interface MatchStatusRow {
  id: string;
  status: string;
}

export interface MatchTimingRow {
  id: string;
  status: string;
  scheduledAt: string;
  durationMin: number | null;
}

export interface CreateSubmissionInput {
  matchId: string;
  submitterId: string;
  scoreTeamA: number;
  scoreTeamB: number;
  winningTeam: 'a' | 'b' | 'draw';
}

// =====================================================
// Repository Functions
// =====================================================

/**
 * Fetch only the match status — minimal egress for the cancelled-match guard.
 * Uses service-role; no user data involved.
 */
export async function getMatchStatus(matchId: string): Promise<MatchStatusRow | null> {
  const { data, error } = await supabase
    .from('matches')
    .select('id, status')
    .eq('id', matchId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    console.error(
      `[matchResultVoteRepository.getMatchStatus] Supabase error matchId=${matchId}:`,
      error.message,
    );
    throw new Error(error.message);
  }

  return data as MatchStatusRow;
}

/**
 * Fetch match timing (status + scheduledAt + durationMin) for the end-of-match guard.
 * Used by proposeMatchResult to refuse proposals while the match is still in play.
 * Uses service-role; no user data involved.
 */
export async function getMatchTiming(matchId: string): Promise<MatchTimingRow | null> {
  const { data, error } = await supabase
    .from('matches')
    .select('id, status, "scheduledAt", "durationMin"')
    .eq('id', matchId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    console.error(
      `[matchResultVoteRepository.getMatchTiming] Supabase error matchId=${matchId}:`,
      error.message,
    );
    throw new Error(error.message);
  }

  return data as MatchTimingRow;
}

/**
 * Check if a user is a participant (matchParticipants row exists).
 * Uses service-role — a plain existence check, no user data exposed.
 */
export async function isParticipant(matchId: string, userId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('matchParticipants')
    .select('id', { count: 'exact', head: true })
    .eq('matchId', matchId)
    .eq('playerId', userId);

  if (error) {
    console.error(
      `[matchResultVoteRepository.isParticipant] Supabase error matchId=${matchId} userId=${userId}:`,
      error.message,
    );
    throw new Error(error.message);
  }

  return (count ?? 0) > 0;
}

/**
 * Return all submissions for a match, including their votes and submitter profiles.
 * Ordered newest-first.
 */
export async function getSubmissionsByMatch(matchId: string): Promise<SubmissionRow[]> {
  const { data, error } = await supabase
    .from('matchResultSubmissions')
    .select(
      `${SUBMISSION_COLUMNS},
       profiles(${SUBMITTER_COLUMNS}),
       matchResultVotes(${VOTE_COLUMNS}, profiles(${VOTER_COLUMNS}))`,
    )
    .eq('matchId', matchId)
    .order('createdAt', { ascending: false });

  if (error) {
    console.error(
      `[matchResultVoteRepository.getSubmissionsByMatch] Supabase error matchId=${matchId}:`,
      error.message,
    );
    throw new Error(error.message);
  }

  return (data as unknown as SubmissionRow[]) ?? [];
}

/**
 * Return a single submission by its ID, including votes and profiles.
 */
export async function getSubmissionById(submissionId: string): Promise<SubmissionRow | null> {
  const { data, error } = await supabase
    .from('matchResultSubmissions')
    .select(
      `${SUBMISSION_COLUMNS},
       profiles(${SUBMITTER_COLUMNS}),
       matchResultVotes(${VOTE_COLUMNS}, profiles(${VOTER_COLUMNS}))`,
    )
    .eq('id', submissionId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    console.error(
      `[matchResultVoteRepository.getSubmissionById] Supabase error submissionId=${submissionId}:`,
      error.message,
    );
    throw new Error(error.message);
  }

  return data as unknown as SubmissionRow;
}

/**
 * Insert a new submission.
 * Must be called with user-scoped client so RLS INSERT policy is enforced:
 *   submitterId = auth.uid() AND user is participant.
 */
export async function createSubmission(
  input: CreateSubmissionInput,
  client: SupabaseClient,
): Promise<SubmissionRow> {
  const { data, error } = await client
    .from('matchResultSubmissions')
    .insert({
      matchId: input.matchId,
      submitterId: input.submitterId,
      scoreTeamA: input.scoreTeamA,
      scoreTeamB: input.scoreTeamB,
      winningTeam: input.winningTeam,
    })
    .select(
      `${SUBMISSION_COLUMNS},
       profiles(${SUBMITTER_COLUMNS}),
       matchResultVotes(${VOTE_COLUMNS}, profiles(${VOTER_COLUMNS}))`,
    )
    .single();

  if (error) {
    console.error(
      `[matchResultVoteRepository.createSubmission] Supabase error matchId=${input.matchId}:`,
      error.message,
    );
    throw new Error(error.message);
  }

  return data as unknown as SubmissionRow;
}

/**
 * Upsert a vote (INSERT or UPDATE on the UNIQUE(submissionId, voterId) constraint).
 * Must be called with user-scoped client so RLS INSERT policy is enforced.
 *
 * Decision Context:
 * - onConflict targets the unique constraint so re-voting updates the existing row.
 * - The UPDATE RLS policy (votes_voter_update) allows the voter to change their vote.
 * - Previously fixed bugs: none relevant.
 */
export async function upsertVote(
  submissionId: string,
  voterId: string,
  vote: 'approve' | 'reject',
  client: SupabaseClient,
): Promise<void> {
  const { error } = await client
    .from('matchResultVotes')
    .upsert(
      { submissionId, voterId, vote },
      { onConflict: 'submissionId,voterId' },
    );

  if (error) {
    console.error(
      `[matchResultVoteRepository.upsertVote] Supabase error submissionId=${submissionId} voterId=${voterId}:`,
      error.message,
    );
    throw new Error(error.message);
  }
}

/**
 * Count approve votes for a submission.
 * head:true fetches only the count (egress prevention).
 */
export async function countApproveVotes(submissionId: string): Promise<number> {
  const { count, error } = await supabase
    .from('matchResultVotes')
    .select('id', { count: 'exact', head: true })
    .eq('submissionId', submissionId)
    .eq('vote', 'approve');

  if (error) {
    console.error(
      `[matchResultVoteRepository.countApproveVotes] Supabase error submissionId=${submissionId}:`,
      error.message,
    );
    throw new Error(error.message);
  }

  return count ?? 0;
}

/**
 * Count participants for a match (total voters eligible).
 */
export async function countMatchParticipants(matchId: string): Promise<number> {
  const { count, error } = await supabase
    .from('matchParticipants')
    .select('id', { count: 'exact', head: true })
    .eq('matchId', matchId);

  if (error) {
    console.error(
      `[matchResultVoteRepository.countMatchParticipants] Supabase error matchId=${matchId}:`,
      error.message,
    );
    throw new Error(error.message);
  }

  return count ?? 0;
}

/**
 * Count DISTINCT participants who have cast at least one vote on ANY submission of a match.
 * Drives the "all voted" early-resolution trigger: once distinct voters reach the participant
 * count, voting can be resolved without waiting for the 24h deadline.
 *
 * Decision Context:
 * - Votes link to submissions, not directly to the match, so we filter through an inner-joined
 *   matchResultSubmissions embed and dedupe voterId in memory (egress is just voterId column).
 * - A participant who only ever rejected still counts as "voted".
 * - Previously fixed bugs: none relevant.
 */
export async function countDistinctVotersForMatch(matchId: string): Promise<number> {
  const { data, error } = await supabase
    .from('matchResultVotes')
    .select('"voterId", matchResultSubmissions!inner("matchId")')
    .eq('matchResultSubmissions.matchId', matchId);

  if (error) {
    console.error(
      `[matchResultVoteRepository.countDistinctVotersForMatch] Supabase error matchId=${matchId}:`,
      error.message,
    );
    throw new Error(error.message);
  }

  const voterIds = new Set((data ?? []).map((r) => (r as { voterId: string }).voterId));
  return voterIds.size;
}

/**
 * Mark a submission as confirmed (service-role — system-triggered transition).
 * Also sets isConfirmed = true for backward compatibility.
 *
 * @deprecated Replaced by confirmMatchResultAtomic (RPC). Slated for removal in a follow-up cleanup.
 */
export async function confirmSubmission(submissionId: string): Promise<void> {
  const { error } = await supabase
    .from('matchResultSubmissions')
    .update({ submissionStatus: 'confirmed', isConfirmed: true })
    .eq('id', submissionId);

  if (error) {
    console.error(
      `[matchResultVoteRepository.confirmSubmission] Supabase error submissionId=${submissionId}:`,
      error.message,
    );
    throw new Error(error.message);
  }
}

/**
 * Reject all pending submissions for a match except the confirmed one.
 * Called after a submission reaches majority so the other candidates are closed.
 *
 * @deprecated Replaced by confirmMatchResultAtomic (RPC). Slated for removal in a follow-up cleanup.
 */
export async function rejectOtherSubmissions(
  matchId: string,
  exceptSubmissionId: string,
): Promise<void> {
  const { error } = await supabase
    .from('matchResultSubmissions')
    .update({ submissionStatus: 'rejected' })
    .eq('matchId', matchId)
    .eq('submissionStatus', 'pending')
    .neq('id', exceptSubmissionId);

  if (error) {
    console.error(
      `[matchResultVoteRepository.rejectOtherSubmissions] Supabase error matchId=${matchId}:`,
      error.message,
    );
    throw new Error(error.message);
  }
}

/**
 * Update the match with the confirmed score/winner/status.
 * Uses service-role because the authenticated UPDATE policy on matches only
 * allows the organizer — result confirmation is a system operation.
 *
 * @deprecated Replaced by confirmMatchResultAtomic (RPC). Slated for removal in a follow-up cleanup.
 */
export async function updateMatchWithResult(
  matchId: string,
  scoreTeamA: number,
  scoreTeamB: number,
  winningTeam: 'a' | 'b' | 'draw',
): Promise<void> {
  const { error } = await supabase
    .from('matches')
    .update({
      scoreTeamA,
      scoreTeamB,
      winningTeam,
      resultStatus: 'confirmed',
      status: 'completed',
    })
    .eq('id', matchId);

  if (error) {
    console.error(
      `[matchResultVoteRepository.updateMatchWithResult] Supabase error matchId=${matchId}:`,
      error.message,
    );
    throw new Error(error.message);
  }
}

/**
 * Recalculate matchesPlayed, matchesWon, and division for every participant in a match.
 * The SQL function derives stats from confirmed matches, so retries never double-count.
 */
export async function refreshCompetitiveStatsForMatch(matchId: string): Promise<void> {
  const { error } = await supabase.rpc('refresh_profile_competitive_stats_for_match', {
    p_match_id: matchId,
  });

  if (error) {
    console.error(
      `[matchResultVoteRepository.refreshCompetitiveStatsForMatch] Supabase error matchId=${matchId}:`,
      error.message,
    );
    throw new Error(error.message);
  }
}

/**
 * Get all participant userIds for a match.
 * Used for cache invalidation after result confirmation.
 *
 * @deprecated Replaced by confirmMatchResultAtomic (RPC), which returns participantIds in its payload.
 *   Slated for removal in a follow-up cleanup.
 */
export async function getParticipantIds(matchId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('matchParticipants')
    .select('"playerId"')
    .eq('matchId', matchId);

  if (error) {
    console.error(
      `[matchResultVoteRepository.getParticipantIds] Supabase error matchId=${matchId}:`,
      error.message,
    );
    throw new Error(error.message);
  }

  return (data ?? []).map((r) => (r as { playerId: string }).playerId);
}

// =====================================================
// Atomic confirmation (RPC wrapper)
// =====================================================

export interface ConfirmAtomicResult {
  alreadyConfirmed: boolean;
  participantCount: number;
  winnersCount: number;
  matchId: string;
  participantIds: string[];
}

/**
 * Confirm a submission atomically through the `confirm_match_result_submission`
 * Postgres RPC. The function runs the entire cascade (confirm submission,
 * reject siblings, write the match result, increment matchesPlayed/Won,
 * notify all participants) inside one transaction with row-level locks so two
 * concurrent "final votes" cannot double-apply the changes.
 *
 * Decision Context:
 * - Called with the user-scoped Supabase client (`ctx.supabase`) so the RPC
 *   sees a valid `auth.uid()` — the function is SECURITY DEFINER but still
 *   requires an authenticated caller. Singleton service-role would defeat
 *   that check.
 * - The RPC returns `alreadyConfirmed: true` when a sibling caller already
 *   confirmed inside the lock; the service layer reads that flag to skip
 *   cache invalidation a second time.
 * - `participantIds` is carried in the response so the service can invalidate
 *   `user:matches:{uid}*` keys without a follow-up query (this is what the
 *   deprecated `getParticipantIds` helper used to do).
 * - Errors from the RPC ("No hay mayoría suficiente para confirmar", "El
 *   partido fue cancelado", "Submission no encontrada", etc.) propagate as
 *   plain `Error`s — the service must not invalidate caches when the RPC
 *   throws.
 * - Previously fixed bugs: under concurrent final votes the legacy 4-call
 *   sequence could double-increment stats; the RPC's FOR UPDATE locks
 *   eliminate that race.
 */
export async function confirmMatchResultAtomic(
  submissionId: string,
  client: SupabaseClient,
): Promise<ConfirmAtomicResult> {
  const { data, error } = await client.rpc('confirm_match_result_submission', {
    p_submission_id: submissionId,
  });

  if (error) {
    console.error(
      `[matchResultVoteRepository.confirmMatchResultAtomic] Supabase RPC error submissionId=${submissionId}:`,
      error.message,
    );
    throw new Error(error.message);
  }

  const payload = data as {
    alreadyConfirmed: boolean;
    participantCount: number;
    winnersCount: number;
    matchId: string;
    participantIds: string[];
  };

  return {
    alreadyConfirmed: payload.alreadyConfirmed,
    participantCount: payload.participantCount,
    winnersCount: payload.winnersCount,
    matchId: payload.matchId,
    participantIds: payload.participantIds ?? [],
  };
}

// =====================================================
// Resolution (deadline / all-voted) + team reassignment (RPC wrappers)
// =====================================================

export interface ResolveVotingResult {
  resolved: boolean;
  reason?: string;
  matchId?: string;
  participantIds: string[];
}

/**
 * Resolve match result voting through the `resolve_match_result_voting` RPC: picks the
 * pending submission with the most approvals and applies the same confirmation cascade as
 * the instant path (the RPC also refreshes competitive stats internally).
 *
 * Decision Context:
 * - Called on the "all voted" path with the user-scoped client. The RPC does NOT require
 *   auth.uid() (it is also invoked by pg_cron), but we still pass the user client to keep
 *   the call inside the caller's RLS session.
 * - Returns resolved=false with a reason when there is nothing to confirm (already resolved,
 *   no pending proposals, or zero approvals → match flagged 'disputed').
 * - Previously fixed bugs: none relevant.
 */
export async function resolveMatchResultVoting(
  matchId: string,
  client: SupabaseClient,
): Promise<ResolveVotingResult> {
  const { data, error } = await client.rpc('resolve_match_result_voting', {
    p_match_id: matchId,
  });

  if (error) {
    console.error(
      `[matchResultVoteRepository.resolveMatchResultVoting] Supabase RPC error matchId=${matchId}:`,
      error.message,
    );
    throw new Error(error.message);
  }

  const payload = data as {
    resolved: boolean;
    reason?: string;
    matchId?: string;
    participantIds?: string[];
  };

  return {
    resolved: payload.resolved,
    reason: payload.reason,
    matchId: payload.matchId,
    participantIds: payload.participantIds ?? [],
  };
}

/**
 * Reassign participants between teams through the `reassign_match_teams` RPC.
 * Must be called with the user-scoped client so the RPC's auth.uid() participant check runs.
 *
 * Decision Context:
 * - matchParticipants has no UPDATE RLS policy by design; the SECURITY DEFINER RPC performs
 *   the move after validating the caller is a participant, the match has ended, and the
 *   result is not yet confirmed.
 * - assignments use the lowercase matchTeam enum ('a'/'b') — the service maps GraphQL A/B.
 * - Previously fixed bugs: none relevant.
 */
export async function reassignMatchTeams(
  matchId: string,
  assignments: { playerId: string; team: 'a' | 'b' }[],
  client: SupabaseClient,
): Promise<void> {
  const { error } = await client.rpc('reassign_match_teams', {
    p_match_id: matchId,
    p_assignments: assignments,
  });

  if (error) {
    console.error(
      `[matchResultVoteRepository.reassignMatchTeams] Supabase RPC error matchId=${matchId}:`,
      error.message,
    );
    throw new Error(error.message);
  }
}

export const matchResultVoteRepository = {
  getMatchStatus,
  getMatchTiming,
  countDistinctVotersForMatch,
  resolveMatchResultVoting,
  reassignMatchTeams,
  isParticipant,
  getSubmissionsByMatch,
  getSubmissionById,
  createSubmission,
  upsertVote,
  countApproveVotes,
  countMatchParticipants,
  confirmSubmission,
  rejectOtherSubmissions,
  updateMatchWithResult,
  refreshCompetitiveStatsForMatch,
  getParticipantIds,
  confirmMatchResultAtomic,
};
