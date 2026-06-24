import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { ACCESS_TOKEN_COOKIE, FRONTEND_URL } from './constants';
import { TEST_USERS, type TestUser, type TestUserKey } from './users';

/**
 * Auth helpers used both by `auth.setup.ts` (storage-state warm-up) and by
 * specs that need a logged-in user but exercise the login flow itself.
 *
 * Decision Context:
 * - `loginViaForm` is the canonical UI login. It's used by auth.setup.ts to
 *   produce per-user storage-state files, and by login.spec.ts which validates
 *   the form behaviour directly. Specs that just need a logged-in browser do
 *   NOT call this — they declare `test.use({ storageState: ... })` at the top
 *   of the file and skip the login round-trip entirely.
 * - `readAccessToken` extracts the HttpOnly cookie set by the SSR login. Tests
 *   that hit the backend GraphQL directly (matchSnapshot, ensureJoinedMatch,
 *   myProfile) need this token because the backend doesn't read browser
 *   cookies — it only honors `Authorization: Bearer ...`.
 * - Previously fixed bugs: none relevant.
 */

export async function loginViaForm(page: Page, user: TestUser): Promise<void> {
  await page.goto(`${FRONTEND_URL}/login`);
  await page.getByRole('textbox', { name: 'Email' }).fill(user.email);
  await page.getByRole('textbox', { name: /contrase/i }).fill(user.password);
  await page.getByRole('button', { name: /ingresar/i }).click();
  await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 10_000 });
}

export async function readAccessToken(page: Page): Promise<string> {
  const cookies = await page.context().cookies(FRONTEND_URL);
  const token = cookies.find((c) => c.name === ACCESS_TOKEN_COOKIE)?.value;
  expect(token, 'login should have left an access-token cookie').toBeTruthy();
  return token as string;
}

/**
 * Performs a real UI login via APIRequestContext (no browser) so we can grab
 * an access token without running tests through a full page navigation. Used
 * for tests that prepare backend state via direct GraphQL calls.
 */
export async function loginAndReadToken(page: Page, userKey: TestUserKey): Promise<string> {
  await loginViaForm(page, TEST_USERS[userKey]);
  return readAccessToken(page);
}

/**
 * Multi-token harness: authenticates directly against the backend REST auth endpoint
 * without a browser, returning the raw Bearer token.
 *
 * Decision Context:
 * - Why REST instead of UI login: tests that need tokens for multiple users in the
 *   same spec (e.g. joining a match as both Mateo and Ricardo) cannot open two browser
 *   pages in a single serial test. Direct REST login bypasses the browser and cookies
 *   entirely, returning only the accessToken needed for gqlPostOrThrow().
 * - The endpoint POST /api/auth/login returns LoginResult { accessToken, refreshToken,
 *   user } — we only extract accessToken.
 * - Previously fixed bugs: none relevant.
 */
export async function loginApiAndGetToken(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<string> {
  const response = await request.post('http://localhost:4000/api/auth/login', {
    data: { email, password },
    headers: { 'Content-Type': 'application/json' },
  });
  expect(response.ok(), `Login REST failed for ${email}: HTTP ${String(response.status())}`).toBeTruthy();
  const data = (await response.json()) as { accessToken?: string };
  expect(data.accessToken, `No accessToken in login response for ${email}`).toBeTruthy();
  return data.accessToken as string;
}

export type AuthenticatedRequestOptions = {
  request: APIRequestContext;
  accessToken: string;
};
