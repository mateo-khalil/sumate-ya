/**
 * Match result voting — GraphQL operations and TypeScript types.
 *
 * Decision Context:
 * - Mirrors match-results.graphql until frontend codegen is wired.
 * - Keep in sync with the backend schema (match-result-vote.graphql).
 * - Previously fixed bugs: none relevant.
 */

// =====================================================
// Types
// =====================================================

export type WinnerTeam = 'A' | 'B' | 'DRAW';
export type SubmissionStatus = 'PENDING' | 'CONFIRMED' | 'REJECTED';
export type VoteValue = 'APPROVE' | 'REJECT';

export interface VoterInfo {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface MatchResultVote {
  id: string;
  voter: VoterInfo;
  vote: VoteValue;
  createdAt: string;
}

export interface MatchResultSubmission {
  id: string;
  matchId: string;
  submitter: VoterInfo;
  scoreA: number;
  scoreB: number;
  winnerTeam: WinnerTeam;
  status: SubmissionStatus;
  approveCount: number;
  rejectCount: number;
  hasUserVoted: boolean;
  userVote: VoteValue | null;
  createdAt: string;
  votes: MatchResultVote[];
}

export interface VoteSubmissionResult {
  statusChanged: boolean;
  submission: MatchResultSubmission;
}

export interface ProposeMatchResultInput {
  matchId: string;
  scoreA: number;
  scoreB: number;
  winnerTeam?: WinnerTeam;
}

export interface VoteMatchResultInput {
  submissionId: string;
  vote: VoteValue;
}

export type MatchTeam = 'A' | 'B';

export interface RosterMember {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  preferredPosition: string | null;
  division: number | null;
}

export interface MatchParticipantsData {
  teamA: RosterMember[];
  teamB: RosterMember[];
  teamACount: number;
  teamBCount: number;
  totalCount: number;
  spotsLeftA: number;
  spotsLeftB: number;
}

export interface TeamAssignmentInput {
  playerId: string;
  team: MatchTeam;
}

export interface ReassignMatchTeamsInput {
  matchId: string;
  assignments: TeamAssignmentInput[];
}

// =====================================================
// GraphQL Operation Strings
// =====================================================

const VOTE_FIELDS = /* GraphQL */ `
  fragment VoteFields on MatchResultVote {
    id
    voter { id displayName avatarUrl }
    vote
    createdAt
  }
`;

const SUBMISSION_FIELDS = /* GraphQL */ `
  fragment SubmissionFields on MatchResultSubmission {
    id
    matchId
    submitter { id displayName avatarUrl }
    scoreA
    scoreB
    winnerTeam
    status
    approveCount
    rejectCount
    hasUserVoted
    userVote
    createdAt
    votes { ...VoteFields }
  }
`;

export const GET_MATCH_RESULT_SUBMISSIONS = /* GraphQL */ `
  ${VOTE_FIELDS}
  ${SUBMISSION_FIELDS}
  query GetMatchResultSubmissions($matchId: ID!) {
    matchResultSubmissions(matchId: $matchId) {
      ...SubmissionFields
    }
  }
`;

export const PROPOSE_MATCH_RESULT = /* GraphQL */ `
  ${VOTE_FIELDS}
  ${SUBMISSION_FIELDS}
  mutation ProposeMatchResult($input: ProposeMatchResultInput!) {
    proposeMatchResult(input: $input) {
      ...SubmissionFields
    }
  }
`;

export const VOTE_MATCH_RESULT = /* GraphQL */ `
  ${VOTE_FIELDS}
  ${SUBMISSION_FIELDS}
  mutation VoteMatchResult($input: VoteMatchResultInput!) {
    voteMatchResult(input: $input) {
      statusChanged
      submission { ...SubmissionFields }
    }
  }
`;

export const REASSIGN_MATCH_TEAMS = /* GraphQL */ `
  mutation ReassignMatchTeams($input: ReassignMatchTeamsInput!) {
    reassignMatchTeams(input: $input) {
      teamA { id displayName avatarUrl preferredPosition division }
      teamB { id displayName avatarUrl preferredPosition division }
      teamACount
      teamBCount
      totalCount
      spotsLeftA
      spotsLeftB
    }
  }
`;
