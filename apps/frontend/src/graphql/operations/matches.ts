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

export interface MatchFilters {
  status?: MatchStatus;
  format?: MatchFormat;
  zone?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
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

/** @deprecated Use GET_MATCHES with filters instead */
export const GET_OPEN_MATCHES = GET_MATCHES;

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
