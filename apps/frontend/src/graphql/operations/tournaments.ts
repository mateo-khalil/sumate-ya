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
  schedule: TournamentScheduleSlotInput[];
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
    imageUrl: string | null;
  } | null;
  teams: TournamentTeam[];
  fixtureMatches: TournamentFixtureMatch[];
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

export interface TournamentTeamRegistrationResult {
  success: boolean;
  teamId: string | null;
  message: string | null;
  tournament: TournamentData | null;
}

export const GET_TOURNAMENTS = /* GraphQL */ `
  query GetTournaments {
    tournaments {
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
      }
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
