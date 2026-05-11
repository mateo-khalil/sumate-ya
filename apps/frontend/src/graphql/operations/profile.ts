/**
 * Profile GraphQL operations (TypeScript companion to profile.graphql).
 *
 * Decision Context:
 * - Why: frontend.md forbids inline GraphQL inside UI components — operations live here.
 *   Frontend codegen isn't wired up yet, so we keep a hand-typed mirror of the schema.
 *   If you edit the query, update BOTH `profile.graphql` and this file.
 * - Privacy fields: Profile fields are nullable when the owner has disabled them.
 *   `isPrivate` is true when the profile is private and the viewer is not the owner.
 * - PrivacySettings is only fetched via mySettings (owner only). UpdatePrivacyInput
 *   allows partial updates — all fields are optional.
 * - Previously fixed bugs: none relevant.
 */

// =====================================================
// Types (mirror backend GraphQL schema)
// =====================================================

export type UserRole = 'PLAYER' | 'CLUB_ADMIN';

export type PlayerPosition = 'GOALKEEPER' | 'DEFENDER' | 'MIDFIELDER' | 'FORWARD';

export type MatchUserResult = 'WON' | 'LOST' | 'DRAW' | 'PENDING';

export interface Profile {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  role: UserRole;
  /** Null if owner set showPosition=false and viewer is not the owner */
  preferredPosition: PlayerPosition | null;
  /** Null if owner set showDivision=false and viewer is not the owner */
  division: number | null;
  /** Null if owner set showStats=false and viewer is not the owner */
  matchesPlayed: number | null;
  /** Null if owner set showStats=false and viewer is not the owner */
  matchesWon: number | null;
  /** Null if owner set showStats=false or matchesPlayed=0 */
  winrate: number | null;
  /** True when this profile is private and the viewer is not the owner */
  isPrivate: boolean | null;
}

export interface PrivacySettings {
  isPublic: boolean;
  showStats: boolean;
  showHistory: boolean;
  showPosition: boolean;
  showDivision: boolean;
}

export interface UpdatePrivacyInput {
  isPublic?: boolean;
  showStats?: boolean;
  showHistory?: boolean;
  showPosition?: boolean;
  showDivision?: boolean;
}

export interface MatchHistoryClub {
  id: string;
  name: string;
  zone: string | null;
}

export interface MatchHistoryItem {
  id: string;
  title: string;
  startTime: string;
  format: string;
  userTeam: string;
  userResult: MatchUserResult;
  /** Null until "registrar resultado" US is implemented */
  scoreA: number | null;
  /** Null until "registrar resultado" US is implemented */
  scoreB: number | null;
  isOrganizer: boolean;
  club: MatchHistoryClub | null;
}

export interface MatchHistoryConnection {
  items: MatchHistoryItem[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// =====================================================
// GraphQL Operations
// =====================================================

export const GET_MY_PROFILE = /* GraphQL */ `
  query GetMyProfile {
    myProfile {
      id
      displayName
      avatarUrl
      role
      preferredPosition
      division
      matchesPlayed
      matchesWon
      winrate
      isPrivate
    }
  }
`;

export const GET_PROFILE = /* GraphQL */ `
  query GetProfile($id: ID!) {
    profile(id: $id) {
      id
      displayName
      avatarUrl
      role
      preferredPosition
      division
      matchesPlayed
      matchesWon
      winrate
      isPrivate
    }
  }
`;

export const GET_MY_SETTINGS = /* GraphQL */ `
  query GetMySettings {
    mySettings {
      isPublic
      showStats
      showHistory
      showPosition
      showDivision
    }
  }
`;

export const UPDATE_PRIVACY = /* GraphQL */ `
  mutation UpdatePrivacy($input: UpdatePrivacyInput!) {
    updatePrivacy(input: $input) {
      isPublic
      showStats
      showHistory
      showPosition
      showDivision
    }
  }
`;

export const GET_MY_MATCHES = /* GraphQL */ `
  query GetMyMatches($page: Int, $pageSize: Int) {
    myMatches(page: $page, pageSize: $pageSize) {
      items {
        id
        title
        startTime
        format
        userTeam
        userResult
        scoreA
        scoreB
        isOrganizer
        club {
          id
          name
          zone
        }
      }
      total
      page
      pageSize
      hasMore
    }
  }
`;
