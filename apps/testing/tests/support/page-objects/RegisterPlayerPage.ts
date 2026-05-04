import { expect, type Locator, type Page } from '@playwright/test';
import { FRONTEND_URL } from '../constants';

export type PlayerRegisterValues = {
  displayName: string;
  email: string;
  password: string;
  confirmPassword: string;
};

export const VALID_PLAYER_REGISTER: PlayerRegisterValues = {
  displayName: 'Mateo Duran',
  email: 'mateo.e2e@example.com',
  password: 'Hola12345',
  confirmPassword: 'Hola12345',
};

/**
 * Page Object for /registro-jugador.
 *
 * Decision Context:
 * - The page is SSR — the POST is processed server-side. Some specs intercept
 *   that POST with `page.route('**\/registro-jugador')` to validate the SSR
 *   contract without writing real users. The page object exposes the form
 *   fields as locators so tests can also read field values for the
 *   "data is preserved on error" assertion.
 * - Previously fixed bugs: none relevant.
 */
export class RegisterPlayerPage {
  readonly page: Page;
  readonly displayName: Locator;
  readonly email: Locator;
  readonly password: Locator;
  readonly confirmPassword: Locator;
  readonly submitButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.displayName = page.locator('#displayName');
    this.email = page.locator('#email');
    this.password = page.locator('#password');
    this.confirmPassword = page.locator('#confirmPassword');
    this.submitButton = page.getByRole('button', { name: /crear cuenta/i });
  }

  async goto(): Promise<void> {
    await this.page.goto(`${FRONTEND_URL}/registro-jugador`);
    await expect(this.page.getByRole('heading', { name: /sumate ya/i })).toBeVisible();
  }

  async fillForm(overrides: Partial<PlayerRegisterValues> = {}): Promise<PlayerRegisterValues> {
    const values = { ...VALID_PLAYER_REGISTER, ...overrides };
    await this.displayName.fill(values.displayName);
    await this.email.fill(values.email);
    await this.password.fill(values.password);
    await this.confirmPassword.fill(values.confirmPassword);
    return values;
  }

  async submitAndWait(): Promise<void> {
    await Promise.all([
      this.page.waitForLoadState('domcontentloaded'),
      this.submitButton.click(),
    ]);
  }
}
