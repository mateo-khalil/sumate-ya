/**
 * Team GraphQL operations — tipos TypeScript y strings de operaciones.
 *
 * Decision Context:
 * - Issue #137: equipos permanentes separados de tournamentTeams.
 * - MatchFormat importado de matches.ts para reutilizar el mismo contrato de tipo.
 * - Las mutations se ejecutan client-side via POST /api/graphql-auth (cookie HttpOnly).
 * - Las queries SSR se ejecutan server-side via fetch directo al backend.
 */

import type { MatchFormat } from './matches';

export type { MatchFormat };

export type PlayerPosition = 'GOALKEEPER' | 'DEFENDER' | 'MIDFIELDER' | 'FORWARD';
export type TeamMemberRole = 'CAPTAIN' | 'MEMBER';
export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';

export interface TeamProfile {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  preferredPosition: PlayerPosition | null;
}

export interface TeamRosterEntry {
  id: string;
  teamId: string;
  role: TeamMemberRole;
  joinedAt: string;
  player: TeamProfile;
}

export interface TeamData {
  id: string;
  name: string;
  captainId: string | null;
  captain: TeamProfile | null;
  logoUrl: string | null;
  format: MatchFormat;
  description: string | null;
  isActive: boolean;
  memberCount: number;
  members: TeamRosterEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface TeamInvitation {
  id: string;
  status: InvitationStatus;
  message: string | null;
  expiresAt: string;
  respondedAt: string | null;
  createdAt: string;
  team: { id: string; name: string; format: MatchFormat; memberCount: number };
  invitedPlayer: TeamProfile;
  invitedBy: TeamProfile;
}

export interface AvailabilityMatrixCell {
  dayOfWeek: number;
  startTime: string;
  availableCount: number;
  availablePlayers: TeamProfile[];
}

// Input types
export interface CreateTeamInput { name: string; format: MatchFormat; description?: string | null }
export interface UpdateTeamInput { teamId: string; name?: string | null; logoUrl?: string | null; format?: MatchFormat | null; description?: string | null }
export interface InvitePlayerInput { teamId: string; playerId: string; message?: string | null }
export interface RespondInvitationInput { invitationId: string; accept: boolean }
export interface AvailabilitySlotInput { dayOfWeek: number; startTime: string; endTime: string }
export interface SetAvailabilityInput { teamId: string; slots: AvailabilitySlotInput[] }

// Result types
export interface TeamResult { success: boolean; message: string; team: TeamData | null }
export interface TeamMutationResult { success: boolean; message: string }
export interface TeamInvitationResult { success: boolean; message: string; invitation: { id: string; status: string; expiresAt: string } | null }

// =====================================================
// Fragments (shared)
// =====================================================

const TEAM_PROFILE_FRAGMENT = `
  id displayName avatarUrl preferredPosition
`;

const TEAM_ROSTER_ENTRY_FRAGMENT = `
  id teamId role joinedAt
  player { ${TEAM_PROFILE_FRAGMENT} }
`;

const TEAM_FRAGMENT = `
  id name captainId logoUrl format description isActive memberCount createdAt updatedAt
  captain { ${TEAM_PROFILE_FRAGMENT} }
  members { ${TEAM_ROSTER_ENTRY_FRAGMENT} }
`;

// =====================================================
// Queries
// =====================================================

export const MY_TEAMS = /* GraphQL */ `
  query MyTeams {
    myTeams { ${TEAM_FRAGMENT} }
  }
`;

export const GET_TEAM = /* GraphQL */ `
  query GetTeam($id: ID!) {
    team(id: $id) { ${TEAM_FRAGMENT} }
  }
`;

export const MY_PENDING_INVITATIONS = /* GraphQL */ `
  query MyPendingInvitations {
    myPendingInvitations {
      id status message expiresAt createdAt
      team { id name format memberCount }
      invitedPlayer { ${TEAM_PROFILE_FRAGMENT} }
      invitedBy { ${TEAM_PROFILE_FRAGMENT} }
    }
  }
`;

export const TEAM_AVAILABILITY_MATRIX = /* GraphQL */ `
  query TeamAvailabilityMatrix($teamId: ID!) {
    teamAvailabilityMatrix(teamId: $teamId) {
      dayOfWeek startTime availableCount
      availablePlayers { ${TEAM_PROFILE_FRAGMENT} }
    }
  }
`;

// =====================================================
// Mutations
// =====================================================

export const CREATE_TEAM = /* GraphQL */ `
  mutation CreateTeam($input: CreateTeamInput!) {
    createTeam(input: $input) {
      success message
      team { ${TEAM_FRAGMENT} }
    }
  }
`;

export const UPDATE_TEAM = /* GraphQL */ `
  mutation UpdateTeam($input: UpdateTeamInput!) {
    updateTeam(input: $input) {
      success message
      team { ${TEAM_FRAGMENT} }
    }
  }
`;

export const DELETE_TEAM = /* GraphQL */ `
  mutation DeleteTeam($teamId: ID!) {
    deleteTeam(teamId: $teamId) { success message }
  }
`;

export const INVITE_PLAYER = /* GraphQL */ `
  mutation InvitePlayer($input: InvitePlayerInput!) {
    invitePlayer(input: $input) {
      success message
      invitation { id status expiresAt }
    }
  }
`;

export const CANCEL_INVITATION = /* GraphQL */ `
  mutation CancelInvitation($invitationId: ID!) {
    cancelInvitation(invitationId: $invitationId) { success message }
  }
`;

export const RESPOND_INVITATION = /* GraphQL */ `
  mutation RespondInvitation($input: RespondInvitationInput!) {
    respondInvitation(input: $input) { success message }
  }
`;

export const CLAIM_CAPTAIN = /* GraphQL */ `
  mutation ClaimCaptain($teamId: ID!) {
    claimCaptain(teamId: $teamId) { success message team { id captainId } }
  }
`;

export const REMOVE_MEMBER = /* GraphQL */ `
  mutation RemoveMember($teamId: ID!, $playerId: ID!) {
    removeMember(teamId: $teamId, playerId: $playerId) { success message }
  }
`;

export const LEAVE_TEAM = /* GraphQL */ `
  mutation LeaveTeam($teamId: ID!) {
    leaveTeam(teamId: $teamId) { success message }
  }
`;

export const SET_MY_AVAILABILITY = /* GraphQL */ `
  mutation SetMyAvailability($input: SetAvailabilityInput!) {
    setMyAvailability(input: $input) { success message }
  }
`;

export const SEARCH_PLAYERS = /* GraphQL */ `
  query SearchPlayers($search: String!) {
    searchPlayers(search: $search) { ${TEAM_PROFILE_FRAGMENT} }
  }
`;

export const TEAM_INVITATIONS = /* GraphQL */ `
  query TeamInvitations($teamId: ID!) {
    teamInvitations(teamId: $teamId) {
      id status message expiresAt respondedAt createdAt
      invitedPlayer { ${TEAM_PROFILE_FRAGMENT} }
      invitedBy { ${TEAM_PROFILE_FRAGMENT} }
      team { id name }
    }
  }
`;

export interface PlayerAvailabilitySlotData {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isRecurrent: boolean;
}

export const MY_TEAM_AVAILABILITY = /* GraphQL */ `
  query MyTeamAvailability($teamId: ID!) {
    myTeamAvailability(teamId: $teamId) { id dayOfWeek startTime endTime isRecurrent }
  }
`;

export type TournamentStatusValue = 'REGISTRATION' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export interface TeamEnrollmentData {
  id: string;
  teamId: string;
  tournamentId: string;
  tournamentName: string;
  tournamentStatus: TournamentStatusValue;
  format: MatchFormat;
  teamCount: number;
  enrolledAt: string;
}

export interface EnrollTeamResultData {
  success: boolean;
  message: string;
  warnings: string[];
}

export const TEAM_ENROLLMENTS = /* GraphQL */ `
  query TeamEnrollments($teamId: ID!) {
    teamEnrollments(teamId: $teamId) {
      id teamId tournamentId tournamentName tournamentStatus format teamCount enrolledAt
    }
  }
`;

export const ENROLL_TEAM_IN_TOURNAMENT = /* GraphQL */ `
  mutation EnrollTeamInTournament($teamId: ID!, $tournamentId: ID!) {
    enrollTeamInTournament(teamId: $teamId, tournamentId: $tournamentId) {
      success message warnings
    }
  }
`;
