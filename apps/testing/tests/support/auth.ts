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

export type AuthenticatedRequestOptions = {
  request: APIRequestContext;
  accessToken: string;
};
