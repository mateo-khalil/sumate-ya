/**
 * Leaderboard GraphQL operations (TypeScript companion to leaderboard.graphql).
 *
 * Decision Context:
 * - Why: frontend.md forbids inline GraphQL inside UI components — operations live here.
 *   Frontend codegen isn't wired up, so we keep a hand-typed mirror of the schema.
 *   If you edit the query, update BOTH `leaderboard.graphql` and this file.
 * - All stats are non-null: the backend only returns eligible public profiles
 *   (isPublic + showStats + matchesPlayed >= 5), so the UI never deals with redacted fields.
 * - Previously fixed bugs: none relevant.
 */

import type { PlayerPosition } from './profile';

export interface LeaderboardEntry {
  rank: number;
  id: string;
  displayName: string;
  avatarUrl: string | null;
  preferredPosition: PlayerPosition | null;
  division: number;
  matchesPlayed: number;
  matchesWon: number;
  /** Win percentage 0–100, two decimals (e.g. 66.67). */
  winrate: number;
}

export const GET_LEADERBOARD = /* GraphQL */ `
  query GetLeaderboard($limit: Int) {
    leaderboard(limit: $limit) {
      rank
      id
      displayName
      avatarUrl
      preferredPosition
      division
      matchesPlayed
      matchesWon
      winrate
    }
  }
`;
