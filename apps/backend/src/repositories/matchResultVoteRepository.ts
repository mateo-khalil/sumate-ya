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
 * Mark a submission as confirmed (service-role — system-triggered transition).
 * Also sets isConfirmed = true for backward compatibility.
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
 * Get all participant userIds for a match.
 * Used for cache invalidation after result confirmation.
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

export const matchResultVoteRepository = {
  getMatchStatus,
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
  getParticipantIds,
};
