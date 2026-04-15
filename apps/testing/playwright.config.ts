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
 * - `screenshot: 'only-on-failure'` captures a PNG of the failing page into the
 *   HTML report / test-results dir. Cheaper than `on` (no overhead when green)
 *   and exactly the forensic artifact we want when a flow breaks in CI or locally.
 * - `webServer` boots `npm run dev` from the monorepo root (two levels up from
 *   `apps/testing`) so Playwright brings up frontend + backend (turbo dev) before
 *   any spec runs. The frontend serves on :4321 — we wait on that URL because the
 *   tests hit it directly (see matches-list.spec.ts FRONTEND_URL).
 * - `reuseExistingServer: !CI` keeps local iteration fast (if `pnpm dev` is already
 *   up, we don't double-boot); CI always gets a fresh stack.
 * - `timeout: 180_000` — turbo dev cold-start (install + codegen + Astro + Apollo)
 *   can take well over a minute on first run; the default 60s was flaky.
 * - Previously fixed bugs: none relevant.
 */

const REPO_ROOT = path.resolve(__dirname, '..', '..');

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('')`. */
    // baseURL: 'http://localhost:3000',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',

    /* Capture a screenshot whenever a test fails (saved with the HTML report). */
    screenshot: 'only-on-failure',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },

    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },

    /* Test against mobile viewports. */
    // {
    //   name: 'Mobile Chrome',
    //   use: { ...devices['Pixel 5'] },
    // },
    // {
    //   name: 'Mobile Safari',
    //   use: { ...devices['iPhone 12'] },
    // },

    /* Test against branded browsers. */
    // {
    //   name: 'Microsoft Edge',
    //   use: { ...devices['Desktop Edge'], channel: 'msedge' },
    // },
    // {
    //   name: 'Google Chrome',
    //   use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    // },
  ],

  /* Boot the full monorepo dev stack (turbo dev) from the repo root before tests run. */
  webServer: {
    command: 'npm run dev',
    cwd: REPO_ROOT,
    url: 'http://localhost:4321',
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 180_000,
  },
});
