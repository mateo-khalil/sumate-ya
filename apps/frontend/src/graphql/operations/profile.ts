/**
 * Profile GraphQL operations (TypeScript companion to profile.graphql).
 *
 * Decision Context:
 * - Why: frontend.md forbids inline GraphQL inside UI components — operations live here.
 *   Frontend codegen isn't wired up yet, so we keep a hand-typed mirror of the schema
 *   until it is. If you edit the query, update BOTH `profile.graphql` and this file.
 * - Enums mirror the backend schema exactly (`player` → `PLAYER`, etc.) so the frontend
 *   can compare without a runtime mapping layer.
 * - Previously fixed bugs: none relevant.
 */

// =====================================================
// Types (mirror backend GraphQL schema)
// =====================================================

export type UserRole = 'PLAYER' | 'CLUB_ADMIN';

export type PlayerPosition = 'GOALKEEPER' | 'DEFENDER' | 'MIDFIELDER' | 'FORWARD';

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
