/**
 * Tournament GraphQL operations.
 *
 * Decision Context:
 * - Kept as a TS companion to the .graphql file because this app currently imports
 *   operation strings directly from React islands.
 * - MatchFormat is shared with matches.ts so tournament creation uses the same enum
 *   contract as match creation.
 */

import type { MatchFormat } from './matches';

export type TournamentStatus = 'REGISTRATION' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type FixtureMatchStatus = 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

// Issue #132: nuevos tipos de torneo
export type TournamentType = 'ROUND_ROBIN' | 'SINGLE_ELIMINATION' | 'GROUP_STAGE_ELIMINATION';
export type DurationMode = 'SINGLE_DAY' | 'MULTI_DAY';
export type FixturePhase = 'GROUP_STAGE' | 'ROUND_OF_16' | 'QUARTERFINAL' | 'SEMIFINAL' | 'THIRD_PLACE' | 'FINAL';
export type TournamentInvitationStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';

export interface TournamentInvitationData {
  id: string;
  tournamentId: string;
  tournamentName: string;
  teamId: string | null;
  teamName: string;
  invitedBy: { id: string; displayName: string; avatarUrl: string | null };
  captain: { id: string; displayName: string; avatarUrl: string | null };
  status: TournamentInvitationStatus;
  message: string | null;
  expiresAt: string;
  respondedAt: string | null;
  createdAt: string;
}

export interface SchedulePreviewDay {
  matchday: number;
  date: string;
  matchCount: number;
  isPast: boolean;
}

export interface TournamentFilters {
  status?: TournamentStatus;
  format?: MatchFormat;
  zone?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

export interface TournamentScheduleSlotInput {
  slotId: string;
  date: string;
}

export interface CreateTournamentInput {
  clubId: string;
  name: string;
  format: MatchFormat;
  teamCount: number;
  playersPerTeam: number;
  description?: string | null;
  schedule?: TournamentScheduleSlotInput[];
  // Issue #132: nuevos campos de auto-schedule
  tournamentType?: TournamentType;
  durationMode?: DurationMode;
  firstMatchday?: string;
  cadenceDays?: number;
  specificDays?: number[];
  groupCount?: number;
  teamsPerGroup?: number;
  advancingPerGroup?: number;
}

export interface TournamentFixtureMatch {
  id: string;
  tournamentId: string;
  round: number;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeTeam: TournamentFixtureTeam | null;
  awayTeam: TournamentFixtureTeam | null;
  courtId: string | null;
  scheduledAt: string | null;
  status: FixtureMatchStatus;
  // Issue #132: nuevos campos
  phase: FixturePhase | null;
  groupName: string | null;
  matchday: number | null;
  isPast: boolean;
  scoreHome: number | null;
  scoreAway: number | null;
}

export interface TournamentPlayer {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  preferredPosition: 'GOALKEEPER' | 'DEFENDER' | 'MIDFIELDER' | 'FORWARD' | null;
}

export interface TournamentFixtureTeam {
  id: string;
  name: string;
}

export interface TournamentTeam {
  id: string;
  name: string;
  captainId: string;
  captain: TournamentPlayer | null;
  players: TournamentPlayer[];
  createdAt: string;
}

export interface TournamentData {
  id: string;
  organizerId: string;
  organizer: TournamentPlayer | null;
  name: string;
  format: MatchFormat;
  teamCount: number;
  playersPerTeam: number;
  registeredTeamsCount: number;
  status: TournamentStatus;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
  club: {
    id: string;
    name: string;
    zone: string | null;
    address: string | null;
    lat: number | null;
    lng: number | null;
    imageUrl: string | null;
  } | null;
  teams: TournamentTeam[];
  fixtureMatches: TournamentFixtureMatch[];
  // Issue #132: nuevos campos de tipo y scheduling
  tournamentType: TournamentType;
  durationMode: DurationMode;
  firstMatchday: string | null;
  cadenceDays: number | null;
  groupCount: number | null;
  teamsPerGroup: number | null;
  advancingPerGroup: number | null;
}

export interface TournamentListItem {
  id: string;
  name: string;
  format: MatchFormat;
  teamCount: number;
  playersPerTeam: number;
  registeredTeamsCount: number;
  status: TournamentStatus;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  club: {
    id: string;
    name: string;
    zone: string | null;
    address: string | null;
    lat: number | null;
    lng: number | null;
    imageUrl: string | null;
  } | null;
}

export interface CreateTournamentResult {
  success: boolean;
  tournamentId: string | null;
  message: string | null;
  tournament: TournamentData | null;
}

export interface RegisterTournamentTeamInput {
  tournamentId: string;
  name: string;
}

export interface JoinTournamentInput {
  tournamentId: string;
  teamName: string;
  memberIds: string[];
}

export interface TournamentTeamMemberInput {
  tournamentId: string;
  teamId: string;
  playerId: string;
}

export interface TournamentTeamRegistrationResult {
  success: boolean;
  teamId: string | null;
  message: string | null;
  tournament: TournamentData | null;
}

export const GET_TOURNAMENTS = /* GraphQL */ `
  query GetTournaments($filters: TournamentFilters) {
    tournaments(filters: $filters) {
      id
      name
      format
      teamCount
      playersPerTeam
      registeredTeamsCount
      status
      description
      startDate
      endDate
      club {
        id
        name
        zone
        address
        lat
        lng
        imageUrl
      }
    }
  }
`;

export const GET_TOURNAMENT_DETAIL = /* GraphQL */ `
  query GetTournamentDetail($id: ID!) {
    tournament(id: $id) {
      id
      organizerId
      organizer {
        id
        displayName
        avatarUrl
        preferredPosition
      }
      name
      format
      teamCount
      playersPerTeam
      registeredTeamsCount
      status
      description
      startDate
      endDate
      createdAt
      club {
        id
        name
        zone
        address
        lat
        lng
        imageUrl
      }
      teams {
        id
        name
        captainId
        captain {
          id
          displayName
          avatarUrl
          preferredPosition
        }
        players {
          id
          displayName
          avatarUrl
          preferredPosition
        }
        createdAt
      }
      fixtureMatches {
        id
        tournamentId
        round
        homeTeamId
        awayTeamId
        homeTeam {
          id
          name
        }
        awayTeam {
          id
          name
        }
        courtId
        scheduledAt
        status
        scoreHome
        scoreAway
        phase
        groupName
        matchday
        isPast
      }
      tournamentType
      durationMode
      firstMatchday
      cadenceDays
      groupCount
      teamsPerGroup
      advancingPerGroup
    }
  }
`;

export const GET_TOURNAMENT_ELIGIBLE_PLAYERS = /* GraphQL */ `
  query GetTournamentEligiblePlayers($tournamentId: ID!, $search: String) {
    tournamentEligiblePlayers(tournamentId: $tournamentId, search: $search) {
      id
      displayName
      avatarUrl
      preferredPosition
    }
  }
`;

export const CREATE_TOURNAMENT = /* GraphQL */ `
  mutation CreateTournament($input: CreateTournamentInput!) {
    createTournament(input: $input) {
      success
      tournamentId
      message
      tournament {
        id
        organizerId
        organizer {
          id
          displayName
          avatarUrl
          preferredPosition
        }
        name
        format
        teamCount
        playersPerTeam
        registeredTeamsCount
        status
        description
        startDate
        endDate
        createdAt
        club {
          id
          name
          zone
          address
          lat
          lng
          imageUrl
        }
        fixtureMatches {
          id
          tournamentId
          round
          homeTeamId
          awayTeamId
          homeTeam {
            id
            name
          }
          awayTeam {
            id
            name
          }
          courtId
          scheduledAt
          status
          scoreHome
          scoreAway
        }
      }
    }
  }
`;

export const REGISTER_TOURNAMENT_TEAM = /* GraphQL */ `
  mutation RegisterTournamentTeam($input: RegisterTournamentTeamInput!) {
    registerTournamentTeam(input: $input) {
      success
      teamId
      message
      tournament {
        id
        name
        format
        teamCount
        playersPerTeam
        registeredTeamsCount
        status
        description
        startDate
        endDate
        club {
          id
          name
          zone
          address
          lat
          lng
          imageUrl
        }
        fixtureMatches {
          id
          tournamentId
          round
          homeTeamId
          awayTeamId
          homeTeam {
            id
            name
          }
          awayTeam {
            id
            name
          }
          courtId
          scheduledAt
          status
          scoreHome
          scoreAway
        }
      }
    }
  }
`;

export const JOIN_TOURNAMENT = /* GraphQL */ `
  mutation JoinTournament($input: JoinTournamentInput!) {
    joinTournament(input: $input) {
      success
      teamId
      message
      tournament {
        id
        name
        format
        teamCount
        playersPerTeam
        registeredTeamsCount
        status
        description
        startDate
        endDate
        teams {
          id
          name
          captainId
          captain {
            id
            displayName
            avatarUrl
            preferredPosition
          }
          players {
            id
            displayName
            avatarUrl
            preferredPosition
          }
          createdAt
        }
        club {
          id
          name
          zone
          address
          lat
          lng
          imageUrl
        }
        fixtureMatches {
          id
          tournamentId
          round
          homeTeamId
          awayTeamId
          homeTeam {
            id
            name
          }
          awayTeam {
            id
            name
          }
          courtId
          scheduledAt
          status
          scoreHome
          scoreAway
        }
      }
    }
  }
`;

export const ADD_TOURNAMENT_TEAM_MEMBER = /* GraphQL */ `
  mutation AddTournamentTeamMember($input: TournamentTeamMemberInput!) {
    addTournamentTeamMember(input: $input) {
      success
      teamId
      message
      tournament {
        id
        registeredTeamsCount
        status
        teams {
          id
          name
          captainId
          captain {
            id
            displayName
            avatarUrl
            preferredPosition
          }
          players {
            id
            displayName
            avatarUrl
            preferredPosition
          }
          createdAt
        }
      }
    }
  }
`;

export const REMOVE_TOURNAMENT_TEAM_MEMBER = /* GraphQL */ `
  mutation RemoveTournamentTeamMember($input: TournamentTeamMemberInput!) {
    removeTournamentTeamMember(input: $input) {
      success
      teamId
      message
      tournament {
        id
        registeredTeamsCount
        status
        teams {
          id
          name
          captainId
          captain {
            id
            displayName
            avatarUrl
            preferredPosition
          }
          players {
            id
            displayName
            avatarUrl
            preferredPosition
          }
          createdAt
        }
      }
    }
  }
`;

export interface LeaveTournamentInput {
  tournamentId: string;
  teamId: string;
  reason?: string | null;
}

export interface LeaveTournamentResult {
  success: boolean;
  message: string;
  tournamentStatus: string | null;
  remainingTeams: number | null;
}

export const LEAVE_TOURNAMENT = /* GraphQL */ `
  mutation LeaveTournament($input: LeaveTournamentInput!) {
    leaveTournament(input: $input) {
      success
      message
      tournamentStatus
      remainingTeams
    }
  }
`;

// Issue #132: nuevas operaciones

export interface SchedulePreviewInput {
  tournamentType: TournamentType;
  teamCount: number;
  firstMatchday: string;
  cadenceDays?: number;
  durationMode: DurationMode;
  groupCount?: number;
  teamsPerGroup?: number;
}

export const SCHEDULE_PREVIEW = /* GraphQL */ `
  query SchedulePreview($input: SchedulePreviewInput!) {
    schedulePreview(input: $input) {
      matchday
      date
      matchCount
      isPast
    }
  }
`;

export const MY_TOURNAMENT_INVITATIONS = /* GraphQL */ `
  query MyTournamentInvitations {
    myTournamentInvitations {
      id
      tournamentId
      tournamentName
      teamId
      teamName
      status
      message
      expiresAt
      createdAt
      invitedBy { id displayName avatarUrl }
      captain   { id displayName avatarUrl }
    }
  }
`;

export const INVITE_TEAM_TO_TOURNAMENT = /* GraphQL */ `
  mutation InviteTeamToTournament($input: InviteTeamToTournamentInput!) {
    inviteTeamToTournament(input: $input) {
      success
      message
      invitation { id status expiresAt }
    }
  }
`;

export const RESPOND_TOURNAMENT_INVITATION = /* GraphQL */ `
  mutation RespondTournamentInvitation($invitationId: ID!, $accept: Boolean!) {
    respondTournamentInvitation(invitationId: $invitationId, accept: $accept) {
      success
      message
    }
  }
`;
