/**
 * Shared constants for the e2e suite.
 *
 * Decision Context:
 * - Centralizing URLs/cookies/route patterns avoids drift between specs (e.g.
 *   `**\/graphql` vs `**\/api/graphql**` vs the regex variant). Each spec used
 *   to declare these inline and small differences caused mocks to silently miss
 *   requests.
 * - GRAPHQL_PROXY_ROUTE: glob path-only — catches the frontend Astro proxy at
 *   /api/graphql with or without urql querystring params.
 * - BACKEND_GRAPHQL_ROUTE: glob — catches the backend GraphQL endpoint when the
 *   browser island talks directly to :4000 (joinMatch, leaveMatch, myMatches).
 * - GRAPHQL_ANY_ROUTE: regex — covers BOTH proxy and backend forms; use when a
 *   spec doesn't care which pathway the client takes (matches-map / filters).
 * - Previously fixed bugs: see matches-list.spec.ts comment about
 *   host/port-literal URLs being fragile (now obsolete because everyone uses
 *   these constants).
 */

export const FRONTEND_URL = 'http://localhost:4321';
export const BACKEND_GRAPHQL_URL = 'http://localhost:4000/graphql';

export const GRAPHQL_PROXY_ROUTE = '**/api/graphql**';
export const BACKEND_GRAPHQL_ROUTE = '**/graphql';
export const GRAPHQL_ANY_ROUTE = /https?:\/\/[^/]+\/(?:api\/)?graphql(?:\?.*)?$/;

export const ACCESS_TOKEN_COOKIE = 'sumateya-access-token';
export const REFRESH_TOKEN_COOKIE = 'sumateya-refresh-token';

/**
 * Match IDs guaranteed by `apps/testing/scripts/seed.ts` (Playwright globalSetup).
 * Importing these from a single place keeps tests in sync if the seed evolves.
 */
export const SEED_MATCHES = {
  /** FULL match — test player Mateo is already inscripto in team B. */
  full: 'e1000000-0000-0000-0000-000000000001',
  /** OPEN match with 0 participants. */
  open: 'e1000000-0000-0000-0000-000000000002',
} as const;
