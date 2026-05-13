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
  courtId: string | null;
  scheduledAt: string | null;
  status: FixtureMatchStatus;
}

export interface TournamentData {
  id: string;
  organizerId: string;
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

export const CREATE_TOURNAMENT = /* GraphQL */ `
  mutation CreateTournament($input: CreateTournamentInput!) {
    createTournament(input: $input) {
      success
      tournamentId
      message
      tournament {
        id
        organizerId
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
          courtId
          scheduledAt
          status
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
          round
          homeTeamId
          awayTeamId
          scheduledAt
          status
        }
      }
    }
  }
`;
