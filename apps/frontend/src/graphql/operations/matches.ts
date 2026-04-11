/**
 * Match GraphQL operations (TypeScript companion to matches.graphql).
 *
 * Decision Context:
 * - Why: Frontend rules (`.claude/rules/frontend.md`) forbid inline GraphQL strings inside
 *   UI components — operations must live under `src/graphql/operations/`. The sibling
 *   `matches.graphql` is the canonical definition (for codegen when it lands); this file
 *   re-exports the same operations as string constants for urql `Client.query()` usage
 *   until frontend codegen is wired up.
 * - Keep this file and `matches.graphql` in sync manually for now; when codegen is added,
 *   delete this file and import generated documents instead.
 * - Previously fixed bugs: a prior revision inlined these strings inside `MatchList.tsx`,
 *   which violated the frontend GraphQL rule and made queries un-reusable across components.
 */

export const GET_OPEN_MATCHES = /* GraphQL */ `
  query GetOpenMatches {
    matches(status: "open") {
      id
      title
      startTime
      format
      totalSlots
      availableSlots
      club {
        name
        zone
      }
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
