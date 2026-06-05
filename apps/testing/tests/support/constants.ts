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
 * Route for the authenticated GraphQL proxy used by mutations that require an
 * active session (createTournament, createMatch via SSR proxy, etc.).
 * Separate from GRAPHQL_PROXY_ROUTE (/api/graphql) so slot-mock handlers can
 * skip /api/graphql-auth requests without risking route conflicts.
 */
export const GRAPHQL_AUTH_ROUTE = '**/api/graphql-auth**';

export const TORNEOS_URL = `${FRONTEND_URL}/torneos`;
export const TORNEOS_CREAR_URL = `${FRONTEND_URL}/torneos/crear`;
export const CLUB_DASHBOARD_URL = `${FRONTEND_URL}/panel-club/dashboard`;
export const AJUSTES_URL = `${FRONTEND_URL}/ajustes`;
export const LEADERBOARD_URL = `${FRONTEND_URL}/leaderboard`;

/**
 * Route patterns for the backend REST auth endpoints exercised by the
 * /ajustes Seguridad section (US #40 - cambiar contraseña).
 *
 * Decision Context:
 * - The ChangePasswordForm React island posts to `${backendUrl}/api/auth/change-password`
 *   directly from the browser. The fetch is interceptable with page.route() when we
 *   want to assert UI behaviour (toast, inline error, loading state) without mutating
 *   the seeded user's real password in Supabase.
 * - AUTH_CHANGE_PASSWORD_URL is the absolute URL used by API request tests that hit
 *   the backend directly (no browser) — same shape as BACKEND_GRAPHQL_URL above.
 */
export const AUTH_CHANGE_PASSWORD_ROUTE = '**/api/auth/change-password';
export const AUTH_CHANGE_PASSWORD_URL = 'http://localhost:4000/api/auth/change-password';

/** Returns the detail URL for a given tournament ID. */
export function torneoDetailUrl(id: string): string {
  return `${FRONTEND_URL}/torneos/${id}`;
}

/**
 * Match IDs guaranteed by `apps/testing/scripts/seed.ts` (Playwright globalSetup).
 * Importing these from a single place keeps tests in sync if the seed evolves.
 */
export const SEED_MATCHES = {
  /** FULL match — test player Mateo is already inscripto in team B. */
  full: 'e1000000-0000-0000-0000-000000000001',
  /** OPEN match with 0 participants. */
  open: 'e1000000-0000-0000-0000-000000000002',
  /** COMPLETED match with Mateo + Ricardo, reset for result-submission specs. */
  resultVoting: 'e1000000-0000-0000-0000-000000000003',
  /** OPEN match with a single Ricardo participant; leaving it auto-cancels the match. */
  emptyAutoCancel: 'e1000000-0000-0000-0000-000000000004',
} as const;

/**
 * Tournament IDs guaranteed by `apps/testing/scripts/seed.ts` — US #39 / US #35.
 *
 * Decision Context:
 * - Three seeded tournaments with stable UUIDs so specs can navigate to real
 *   /torneos/[id] pages. The SSR fetch is server-side and cannot be intercepted
 *   with page.route(), so real DB rows are required.
 * - `open`: status=REGISTRATION, no teams — inscription form is visible.
 * - `withCaptainMateo`: status=REGISTRATION, Mateo's team pre-registered —
 *   captain management panel is visible when authenticated as playerMateo.
 * - `withFixture`: status=IN_PROGRESS, 2 teams, 1 completed fixtureMatch with
 *   scores and 1 scheduled fixtureMatch. Used by US #35 fixture display tests.
 */
export const SEED_TOURNAMENTS = {
  /** Open registration, zero teams. Inscription form visible. */
  open: 'c0000000-0000-0000-0000-000000000001',
  /**
   * Mateo's team pre-registered. Captain panel visible when authenticated as
   * playerMateo. Previously named withCaptainLucas — renamed after lucas@test.com
   * was found not to exist in the dev DB (see seed.ts Decision Context).
   */
  withCaptainMateo: 'c0000000-0000-0000-0000-000000000002',
  /**
   * In-progress tournament with 2 teams and 2 fixture matches (1 COMPLETED
   * with scores, 1 SCHEDULED). Used by US #35 fixture-display tests.
   */
  withFixture: 'c0000000-0000-0000-0000-000000000003',
} as const;

/**
 * A well-formed UUID that is guaranteed NOT to exist as a tournament in the DB.
 * Used by US #35 "Torneo no encontrado" tests.
 */
export const NON_EXISTENT_TOURNAMENT_ID = 'c0000000-0000-0000-ffff-000000000000';

/**
 * Club dashboard fixtures guaranteed by `apps/testing/scripts/seed.ts`.
 *
 * The dashboard is SSR, so these tests use real DB rows instead of Playwright
 * route mocks for the first load.
 */
export const SEED_CLUB_DASHBOARD = {
  clubName: 'Club Dashboard E2E',
  courtName: 'Cancha Dashboard 1',
  freeSlotTime: '10:00',
  matchSlotTime: '11:00',
  blockedSlotTime: '12:00',
  blockedReason: 'Mantenimiento E2E',
} as const;

/**
 * Permanent team fixtures guaranteed by `apps/testing/scripts/seed.ts`.
 *
 * Used by the admin/captain team E2E flow. Mateo is captain of `captainTeam`;
 * Ricardo is only a member, so the suite can verify both captain and non-captain
 * permissions without mutating historical user data.
 */
export const SEED_TEAMS = {
  captainTeam: 'a3000000-0000-0000-0000-000000000001',
  claimableTeam: 'a3000000-0000-0000-0000-000000000002',
  pendingInvitation: 'a3000000-0000-0000-0000-000000000101',
} as const;
