import { expect, type Locator, type Page } from '@playwright/test';
import { FRONTEND_URL } from '../constants';

/**
 * Page Object for /registro-club.
 *
 * Decision Context:
 * - The form has two visible sections (admin / club) with their own labels.
 *   We expose locators by accessible name so tests stay focused on behaviour.
 * - `uniqueEmail()` is intentionally a static helper rather than a fixture so
 *   the same email format is used wherever a fresh-registration email is
 *   needed (avoids accidental DB collisions across reruns).
 * - Previously fixed bugs: none relevant.
 */
export class RegisterClubPage {
  readonly page: Page;
  readonly form: Locator;
  readonly fullName: Locator;
  readonly email: Locator;
  readonly password: Locator;
  readonly confirmPassword: Locator;
  readonly clubName: Locator;
  readonly address: Locator;
  readonly phone: Locator;
  readonly submitButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.form = page.locator('form.reg-form');
    this.fullName = page.getByLabel('Nombre completo');
    this.email = page.getByLabel('Email');
    this.password = page.getByLabel('Contraseña', { exact: true });
    this.confirmPassword = page.getByLabel('Confirmar contraseña');
    this.clubName = page.getByLabel('Nombre del club');
    this.address = page.getByLabel('Dirección');
    this.phone = page.getByLabel('Teléfono');
    this.submitButton = page.getByRole('button', { name: 'REGISTRAR CLUB' });
  }

  async goto(): Promise<void> {
    await this.page.goto(`${FRONTEND_URL}/registro-club`);
    await expect(this.form).toBeVisible();
  }

  static uniqueEmail(): string {
    return `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
  }
}
