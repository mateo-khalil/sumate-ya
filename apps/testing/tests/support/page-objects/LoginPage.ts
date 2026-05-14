import { expect, type Locator, type Page } from '@playwright/test';
import { FRONTEND_URL } from '../constants';
import { type TestUser } from '../users';

/**
 * Page Object for /login.
 *
 * Decision Context:
 * - Used both by login.spec.ts (which exercises the form behavior directly)
 *   and by `auth.setup.ts` (which warms up storage-state). Specs that just
 *   need a logged-in browser context should declare
 *   `test.use({ storageState: TEST_USERS.<role>.storageStatePath })` instead
 *   of calling `loginAs` — re-doing UI logins is the slowest way to get auth.
 * - Navigation waits for DOMContentLoaded, then asserts the form is visible. The full
 *   `load` event can be held hostage by fonts/assets even though the login form is ready.
 *   Previously fixed bugs: auth.setup timed out on page.goto while the form was already
 *   rendered in the Playwright error snapshot.
 * - Locators are defined once as fields so test bodies stay declarative.
 * - Previously fixed bugs: none relevant.
 */
export class LoginPage {
  readonly page: Page;
  readonly form: Locator;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly registeredBanner: Locator;

  constructor(page: Page) {
    this.page = page;
    this.form = page.locator('form.login-form');
    this.emailInput = page.getByLabel('Email');
    this.passwordInput = page.getByLabel('Contraseña');
    this.submitButton = page.getByRole('button', { name: /ingresar/i });
    this.registeredBanner = page.getByText(/Registro exitoso\. Ya podés iniciar sesión/i);
  }

  async goto(query?: string): Promise<void> {
    const url = query ? `${FRONTEND_URL}/login?${query}` : `${FRONTEND_URL}/login`;
    await this.page.goto(url, { waitUntil: 'domcontentloaded' });
    await expect(this.form).toBeVisible();
  }

  async fillCredentials(email: string, password: string): Promise<void> {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
  }

  async submit(): Promise<void> {
    await this.submitButton.click();
  }

  /** Full UI login. Waits for the SSR redirect to leave /login. */
  async loginAs(user: Pick<TestUser, 'email' | 'password'>): Promise<void> {
    await this.goto();
    await this.fillCredentials(user.email, user.password);
    await this.submit();
    await this.page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 10_000 });
  }
}
