/**
 * Match GraphQL operations (TypeScript companion to matches.graphql).
 *
 * Decision Context:
 * - Why: Frontend rules (`.claude/rules/frontend.md`) forbid inline GraphQL strings inside
 *   UI components — operations must live under `src/graphql/operations/`. The sibling
 *   `matches.graphql` is the canonical definition (for codegen when it lands); this file
 *   re-exports the same operations as string constants for urql `Client.query()` usage
 *   until frontend codegen is wired up.
 * - Filter support: Added MatchFilters input type for flexible match querying.
 * - Participant types: TeamMember, MatchParticipantsData, MatchDetailData added to support
 *   the join-match US. GET_MATCH_DETAIL fetches full roster + auth-context flags.
 * - Keep this file and `matches.graphql` in sync manually for now; when codegen is added,
 *   delete this file and import generated documents instead.
 * - Previously fixed bugs: a prior revision inlined these strings inside `MatchList.tsx`,
 *   which violated the frontend GraphQL rule and made queries un-reusable across components.
 */

// =====================================================
// Types (mirror GraphQL schema until codegen is wired)
// =====================================================

export type MatchFormat = 'FIVE_VS_FIVE' | 'SEVEN_VS_SEVEN' | 'TEN_VS_TEN' | 'ELEVEN_VS_ELEVEN';
export type MatchStatus = 'OPEN' | 'FULL' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type CourtSurface = 'GRASS' | 'SYNTHETIC' | 'CONCRETE' | 'INDOOR';

export interface MatchFilters {
  status?: MatchStatus;
  format?: MatchFormat;
  zone?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

export interface ClubDetail {
  id: string;
  name: string;
  zone: string;
  address: string;
  phone: string | null;
  description: string | null;
  imageUrl: string | null;
}

export interface Court {
  id: string;
  name: string;
  maxFormat: MatchFormat;
  surface: CourtSurface;
  isIndoor: boolean;
}

export interface ClubSlot {
  id: string;
  clubId: string;
  court: Court;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  priceArs: number | null;
}

export interface CreateMatchInput {
  clubId: string;
  slotId: string;
  courtId: string;
  date: string; // YYYY-MM-DD
  format: MatchFormat;
  capacity: number;
  description?: string;
}

export interface CreateMatchResult {
  success: boolean;
  matchId: string | null;
  message: string | null;
}

export type MatchTeam = 'A' | 'B';

export interface TeamMember {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface MatchParticipantsData {
  teamA: TeamMember[];
  teamB: TeamMember[];
  teamACount: number;
  teamBCount: number;
  totalCount: number;
  spotsLeftA: number;
  spotsLeftB: number;
}

export interface MatchDetailData {
  id: string;
  title: string;
  startTime: string;
  format: MatchFormat;
  totalSlots: number;
  availableSlots: number;
  status: MatchStatus;
  description: string | null;
  createdAt: string;
  club: {
    id: string;
    name: string;
    zone: string | null;
    address: string | null;
    lat: number | null;
    lng: number | null;
  } | null;
  participants: MatchParticipantsData | null;
  isCurrentUserJoined: boolean | null;
  canJoin: boolean | null;
}

export interface JoinMatchInput {
  matchId: string;
  team: MatchTeam;
}

export interface JoinMatchResult {
  success: boolean;
  message: string | null;
}

// =====================================================
// GraphQL Operations
// =====================================================

export const GET_MATCHES = /* GraphQL */ `
  query GetMatches($filters: MatchFilters) {
    matches(filters: $filters) {
      id
      title
      startTime
      format
      totalSlots
      availableSlots
      status
      club {
        name
        zone
      }
    }
  }
`;

/**
 * Extended GET_MATCHES variant that also fetches club coordinates and address.
 * Used by MatchMap to render geo-markers. Kept separate from GET_MATCHES so the
 * base list view does not pay the lat/lng egress cost when it doesn't need them.
 */
export const GET_MATCHES_WITH_COORDS = /* GraphQL */ `
  query GetMatchesWithCoords($filters: MatchFilters) {
    matches(filters: $filters) {
      id
      title
      startTime
      format
      totalSlots
      availableSlots
      status
      club {
        name
        zone
        address
        lat
        lng
      }
    }
  }
`;

/** @deprecated Use GET_MATCHES with filters instead */
export const GET_OPEN_MATCHES = GET_MATCHES;

export const GET_CLUBS = /* GraphQL */ `
  query GetClubs {
    clubs {
      id
      name
      zone
      address
      phone
      description
      imageUrl
    }
  }
`;

export const GET_CLUB_SLOTS = /* GraphQL */ `
  query GetClubSlots($clubId: ID!, $date: String!) {
    clubSlots(clubId: $clubId, date: $date) {
      id
      clubId
      dayOfWeek
      startTime
      endTime
      priceArs
      court {
        id
        name
        maxFormat
        surface
        isIndoor
      }
    }
  }
`;

export const CREATE_MATCH = /* GraphQL */ `
  mutation CreateMatch($input: CreateMatchInput!) {
    createMatch(input: $input) {
      success
      matchId
      message
    }
  }
`;

export const GET_MATCH_BY_ID = /* GraphQL */ `
  query GetMatchById($id: ID!) {
    match(id: $id) {
      id
      title
      startTime
      format
      totalSlots
      availableSlots
      status
      createdAt
      club {
        name
        zone
        imageUrl
      }
    }
  }
`;

export const GET_MATCH_DETAIL = /* GraphQL */ `
  query GetMatchDetail($id: ID!) {
    match(id: $id) {
      id
      title
      startTime
      format
      totalSlots
      availableSlots
      status
      description
      createdAt
      club {
        id
        name
        zone
        address
        lat
        lng
      }
      participants {
        teamA { id displayName avatarUrl }
        teamB { id displayName avatarUrl }
        teamACount
        teamBCount
        totalCount
        spotsLeftA
        spotsLeftB
      }
      isCurrentUserJoined
      canJoin
    }
  }
`;

export const JOIN_MATCH = /* GraphQL */ `
  mutation JoinMatch($input: JoinMatchInput!) {
    joinMatch(input: $input) {
      success
      message
    }
  }
`;
