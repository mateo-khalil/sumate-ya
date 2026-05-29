import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// import dotenv from 'dotenv';
// dotenv.config({ path: path.resolve(__dirname, '.env') });

/**
 * Decision Context:
 * - `screenshot: 'only-on-failure'` and `video: 'retain-on-failure'` — we keep
 *   visual evidence ONLY when a test fails. We previously ran with
 *   `screenshot: 'on'` and `video: 'on'` to always have artifacts, but that hit
 *   the known Playwright hang documented in microsoft/playwright#27048: with
 *   `video: 'on'` + nested describe blocks + per-test browser context (Playwright
 *   defaults) + `mode: 'serial'`, the worker reliably wedges on the LAST test in
 *   the serial chain while flushing/finalizing video recordings. In our suite
 *   this manifested as profile-avatar-upload's "permite cerrar el modal" test
 *   (the 8th and final test of a serial describe) hanging indefinitely while
 *   ports stayed alive and the dev server kept responding to other workers.
 *   Switching to on-failure capture eliminates the per-test video flush that
 *   triggers the bug while preserving evidence on actual failures.
 * - `webServer` boots `npm run dev` from the monorepo root (two levels up from
 *   `apps/testing`) so Playwright brings up frontend + backend (turbo dev) before
 *   any spec runs. The frontend serves on :4321 — we wait on that URL because the
 *   tests hit it directly (see matches-list.spec.ts FRONTEND_URL).
 * - `reuseExistingServer: !CI` keeps local iteration fast (if `pnpm dev` is already
 *   up, we don't double-boot); CI always gets a fresh stack.
 * - `timeout: 180_000` — turbo dev cold-start (install + codegen + Astro + Apollo)
 *   can take well over a minute on first run; the default 60s was flaky.
 * - WebServer output is redirected to `apps/testing/server.log` via shell redirection
 *   inside the command (`> file 2>&1`), and Playwright's `stdout`/`stderr` are set
 *   to `'ignore'`. Otherwise turbo dev would flood the test reporter output with
 *   `[WebServer]`-prefixed lines (Astro/Apollo/Redis logs) and bury the actual test
 *   results. Tail `apps/testing/server.log` to debug a failing test's server side.
 *   The file is overwritten on every run (single `>`) so it never grows unbounded.
 * - Single `chrome` project (channel: 'chrome') — we intentionally target only
 *   Google Chrome. Firefox/WebKit were dropped because our user base runs Chrome
 *   and cross-browser runs tripled CI time without catching real regressions.
 *   Using `channel: 'chrome'` pins the real Chrome build rather than bare
 *   chromium, so what CI tests matches what users actually run.
 * - `workers: 4` (locally) — Playwright is backed by Astro's dev server which is
 *   single-thread JS plus on-demand Vite compilation. Eight Chrome workers all
 *   issuing concurrent SSR/`/api/graphql` requests saturated the dev server and
 *   produced multi-minute action hangs (notably profile-avatar-upload [54/60] /
 *   [81/90] sat indefinitely on `click()` because `actionTimeout: 0` lets actions
 *   wait the full test timeout). Four workers keeps things parallel without
 *   starving the dev stack.
 * - `actionTimeout: 15_000` and `navigationTimeout: 30_000` — the Playwright
 *   defaults are `0` (= cap at test timeout, 90s). With explicit caps a stuck
 *   action fails fast with a real error ("element not actionable") instead of
 *   appearing to hang for 90s+. This is what surfaced the dev-server saturation
 *   bug above and prevents a single flaky action from looking like a frozen run.
 * - Previously fixed bugs:
 *   1. profile-avatar-upload close-modal test sitting at [81/90] for 5+ minutes
 *      when the dev server was overwhelmed by 8 workers — action waits had no
 *      upper bound and Playwright never surfaced the underlying slow-response
 *      error. Fixed by `actionTimeout: 15_000` + `workers: 4`.
 *   2. SAME test then sat at [84/90] permanently with workers=4 — root cause
 *      was the microsoft/playwright#27048 hang, not dev server saturation. The
 *      `video: 'on'` + nested-describe + serial pattern wedged worker teardown
 *      on the last test of the chain. Fixed by switching to on-failure capture.
 */

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SERVER_LOG = path.resolve(__dirname, 'server.log');

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests',
  /* Seed determinista de fixtures de DB antes de cualquier test. Garantiza que los
   * casos de match-detail.spec.ts no se queden en `test.skip` por falta de data
   * (usuario inscripto / partido completo). El script es idempotente y se ejecuta
   * con ts-node desde apps/testing/scripts/seed.ts. */
  globalSetup: require.resolve('./scripts/seed'),
  /* Keep the test budget above the assertion budget so slow UI waits can finish cleanly. */
  timeout: 90_000,
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. Locally we cap at 4 to avoid saturating Astro's
   * single-thread dev server (see decision context above).
   *
   * Decision Context (2026-05-03): bajamos de 8 → 4 workers porque con 8 workers el
   * dev server de Astro/Apollo se saturaba y producia hangs multi-minuto en el ULTIMO
   * test de las describes en `serial mode` (concretamente match-detail.spec.ts:383
   * quedaba colgado ~5 min). El comentario del bloque arriba ya documentaba `workers:4`
   * como el valor correcto, pero el codigo decia 8 — fix incoherencia.
   * Previously fixed bugs: see #1 in the Decision Context block above (test 91/91 hang). */
  workers: process.env.CI ? 1 : 6,
  /* Give UI assertions enough time for Astro islands + GraphQL mocks to settle. */
  expect: {
    timeout: 30_000,
  },
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('')`. */
    // baseURL: 'http://localhost:3000',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',

    /* Capture visual evidence ONLY when a test fails. `screenshot: 'on'` +
     * `video: 'on'` triggers the microsoft/playwright#27048 hang on the last
     * test of a nested+serial describe (see decision context above). */
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',

    /* Explicit upper bounds so a stuck action surfaces as a fast actionable error
     * instead of hanging until the 90s test timeout (see decision context). */
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },

  /* Run tests only in Google Chrome.
   *
   * Decision Context (auth storage state):
   * - The `setup` project runs `tests/auth.setup.ts` once before any chrome
   *   test. It performs a real UI login for every test user defined in
   *   `tests/support/users.ts` and persists each context's storage state to
   *   `playwright/.auth/<role>.json`. Specs that need a logged-in browser
   *   reference those files via `test.use({ storageState: ... })`, skipping
   *   the per-test login round-trip (saves 1-2s per test).
   * - `chrome.dependencies = ['setup']` means setup must complete before any
   *   chrome spec runs, but the chrome tests themselves don't need to declare
   *   the dependency individually.
   * - The login form itself is covered by login.spec.ts, which intentionally
   *   does NOT consume storage state — it's the regression test for that flow.
   */
  projects: [
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts$/,
      /*
       * Decision Context:
       * - Setup logins hit the SSR /login POST handler which then calls the backend
       *   loginWithBackend(). When several setups run in parallel against a freshly
       *   booted dev stack, the FIRST login warms Astro's Vite cache and subsequent
       *   logins can spike past the global actionTimeout: 15_000 cap on click().
       * - Symptom: TimeoutError on submitButton.click() "waiting for scheduled
       *   navigations to finish" — the click was performed but the SSR redirect
       *   to /partidos or /panel-club takes longer than the action budget.
       * - Fix: bump actionTimeout and navigationTimeout for setup only (chrome
       *   project keeps the strict 15s/30s caps), and allow retries so a one-off
       *   slow boot does not block every dependent spec.
       * - Previously fixed bugs:
       *     1. clubAdmin setup timed out under 6-worker load → 25 chrome tests
       *        "did not run" because setup is a hard dependency. Tightened
       *        timeouts + retries instead of removing the dependency.
       */
      retries: 2,
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
        actionTimeout: 30_000,
        navigationTimeout: 60_000,
      },
    },
    {
      name: 'chrome',
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
      dependencies: ['setup'],
    },
  ],

  /* Boot the full monorepo dev stack (turbo dev) from the repo root before tests run. */
  webServer: {
    command: `npm run dev > "${SERVER_LOG}" 2>&1`,
    cwd: REPO_ROOT,
    url: 'http://localhost:4321',
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore',
    stderr: 'ignore',
    timeout: 180_000,
  },
});
