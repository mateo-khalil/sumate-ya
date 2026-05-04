import { test as setup } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { LoginPage } from './support/page-objects/LoginPage';
import { TEST_USERS } from './support/users';

/**
 * Setup project: warms up storage-state files for every test user once per
 * Playwright run. Specs that need a logged-in browser context reference these
 * files via `test.use({ storageState: TEST_USERS.<role>.storageStatePath })`.
 *
 * Decision Context:
 * - Without this step every spec did its own UI login in `beforeEach`, costing
 *   1-2s per test. With saved state the browser context starts already
 *   authenticated and the spec navigates straight to the protected page.
 * - We run a real form login (not API token forging) so storage state ends up
 *   identical to a real browser session — same HttpOnly cookies, same SSR
 *   middleware behaviour. Cheaper hacks (e.g. minting JWTs) drift from prod
 *   and have masked auth bugs in the past.
 * - Each user is its own `setup(...)` call so failures are scoped (one bad
 *   credential blocks only the dependent specs, not the whole run).
 * - The login form itself is exercised by `login.spec.ts` which intentionally
 *   does NOT consume storage state — that spec is the regression test for the
 *   login flow.
 * - Previously fixed bugs: none relevant.
 */

const AUTH_DIR = path.dirname(TEST_USERS.playerMateo.storageStatePath);
fs.mkdirSync(AUTH_DIR, { recursive: true });

setup('authenticate as player Mateo', async ({ page }) => {
  const login = new LoginPage(page);
  await login.loginAs(TEST_USERS.playerMateo);
  await page.context().storageState({ path: TEST_USERS.playerMateo.storageStatePath });
});

setup('authenticate as player Ricardo', async ({ page }) => {
  const login = new LoginPage(page);
  await login.loginAs(TEST_USERS.playerRicardo);
  await page.context().storageState({ path: TEST_USERS.playerRicardo.storageStatePath });
});

setup('authenticate as club admin', async ({ page }) => {
  const login = new LoginPage(page);
  await login.loginAs(TEST_USERS.clubAdmin);
  await page.context().storageState({ path: TEST_USERS.clubAdmin.storageStatePath });
});
