/**
 * Profile GraphQL operations (TypeScript companion to profile.graphql).
 *
 * Decision Context:
 * - Why: frontend.md forbids inline GraphQL inside UI components — operations live here.
 *   Frontend codegen isn't wired up yet, so we keep a hand-typed mirror of the schema
 *   until it is. If you edit the query, update BOTH `profile.graphql` and this file.
 * - Enums mirror the backend schema exactly (`player` → `PLAYER`, etc.) so the frontend
 *   can compare without a runtime mapping layer.
 * - MatchHistoryItem.scoreA/scoreB are always null until "registrar resultado" US is merged.
 *   The types include them as nullable so the UI can conditionally render scores when
 *   that US is eventually implemented.
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
  preferredPosition: PlayerPosition | null;
  division: number;
  matchesPlayed: number;
  matchesWon: number;
  winrate: number | null;
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
