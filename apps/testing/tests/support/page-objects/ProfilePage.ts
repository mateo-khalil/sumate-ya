import { expect, type Locator, type Page } from '@playwright/test';
import { FRONTEND_URL } from '../constants';

/**
 * Page Object for /perfil — both the profile card and the avatar-upload modal.
 *
 * Decision Context:
 * - Splitting the profile card and the avatar modal into separate POs would
 *   duplicate the page navigation; instead, this single PO exposes both
 *   surfaces. Tests that only need the modal call `openAvatarModal()` and
 *   ignore the rest.
 * - The avatar modal opens via a hover-revealed icon button. We hover the
 *   wrapper before clicking, otherwise the button is invisible to Playwright.
 * - The 1×1 PNG below is the canonical valid image for upload tests — keeping
 *   it on the PO avoids spec-level magic strings.
 * - Previously fixed bugs: none relevant.
 */

export const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
  'base64',
);

export class ProfilePage {
  readonly page: Page;
  readonly heading: Locator;
  readonly card: Locator;
  readonly historySection: Locator;
  readonly avatarModal: Locator;
  readonly fileInput: Locator;
  readonly submitAvatarButton: Locator;
  readonly closeAvatarButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { name: /mi perfil/i });
    this.card = page.locator('.profile-card');
    this.historySection = page.locator('.history-section');
    this.avatarModal = page.locator('#avatar-upload-modal');
    this.fileInput = page.locator('input[type="file"]');
    this.submitAvatarButton = page.getByRole('button', { name: /subir foto/i });
    this.closeAvatarButton = page.locator('#close-modal-btn');
  }

  async goto(): Promise<void> {
    await this.page.goto(`${FRONTEND_URL}/perfil`);
    await expect(this.heading).toBeVisible();
    await expect(this.card).toBeVisible();
  }

  async openAvatarModal(): Promise<void> {
    await this.page.locator('.profile-card-wrapper').hover();
    await this.page.getByTitle(/cambiar foto de perfil/i).click();
    await expect(this.page.getByRole('dialog')).toBeVisible();
    await expect(
      this.page.getByRole('heading', { name: /actualizar foto de perfil/i }),
    ).toBeVisible();
  }

  async chooseFile(file: { name: string; mimeType: string; buffer: Buffer }): Promise<void> {
    await this.fileInput.setInputFiles(file);
  }

  async chooseValidPng(): Promise<void> {
    await this.chooseFile({ name: 'avatar.png', mimeType: 'image/png', buffer: ONE_PIXEL_PNG });
  }

  /** Lookup helper for the stat cells (Partidos / Victorias / Efectividad). */
  statCell(label: string): Locator {
    return this.card.locator('.stat-cell').filter({ hasText: label });
  }

  async expectStatValue(label: string, value: string | number): Promise<void> {
    await expect(this.statCell(label).locator('.stat-value')).toHaveText(String(value));
  }
}
