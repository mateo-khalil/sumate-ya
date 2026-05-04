import path from 'node:path';

/**
 * Test users and their saved auth-state files.
 *
 * Decision Context:
 * - These are throwaway QA accounts that exist in the cloud development DB. The
 *   credentials are NOT secrets — the project commits them so any dev can run
 *   the suite without setting env vars. Env overrides exist in case someone
 *   points the suite at a different DB.
 * - `storageStatePath` points to a file produced by `auth.setup.ts` at the
 *   start of every Playwright run. Specs that need a logged-in browser context
 *   reference these paths via `test.use({ storageState })` (or via the
 *   `authenticatedAs(...)` helper). The login form itself is exercised in
 *   login.spec.ts, which intentionally does NOT use a saved storage state.
 * - Why storage-state caching: doing a real UI login in every spec's
 *   `beforeEach` was costing 1-2s per test (Astro SSR + bcrypt). With saved
 *   state we boot a context that already has the HttpOnly cookie set and the
 *   spec lands directly on the protected page.
 * - Roles in the suite:
 *   * `playerMateo` — primary player; default for most match-detail / matches
 *     /create-match / profile tests. Inscripto in seed match E1 (team B).
 *   * `playerRicardo` — secondary player; used by leave-match and
 *     historial-partidos because those flows want a player whose state can
 *     change without affecting the primary player.
 *   * `clubAdmin` — the only club_admin in the dev DB; used by login.spec.ts
 *     redirect-by-role tests.
 * - Previously fixed bugs: none relevant.
 */

export type TestUser = {
  email: string;
  password: string;
  storageStatePath: string;
};

const AUTH_DIR = path.resolve(__dirname, '..', '..', 'playwright', '.auth');

export const TEST_USERS = {
  playerMateo: {
    email: process.env.TEST_PLAYER_EMAIL ?? 'mateoduran2010@gmail.com',
    password: process.env.TEST_PLAYER_PASSWORD ?? 'Hola1234',
    storageStatePath: path.join(AUTH_DIR, 'player-mateo.json'),
  },
  playerRicardo: {
    email: process.env.TEST_PLAYER_RICARDO_EMAIL ?? 'ricardo@gmail.com',
    password: process.env.TEST_PLAYER_RICARDO_PASSWORD ?? 'bbbb1234',
    storageStatePath: path.join(AUTH_DIR, 'player-ricardo.json'),
  },
  clubAdmin: {
    email: process.env.TEST_CLUB_EMAIL ?? 'frantestsumateya@gmail.com',
    password: process.env.TEST_CLUB_PASSWORD ?? 'aaaa1234',
    storageStatePath: path.join(AUTH_DIR, 'club-admin.json'),
  },
} as const satisfies Record<string, TestUser>;

export type TestUserKey = keyof typeof TEST_USERS;
