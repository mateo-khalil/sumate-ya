import { expect, type Locator, type Page } from '@playwright/test';
import { FRONTEND_URL } from '../constants';

/**
 * Page Object for /partidos/crear (the create-match wizard).
 *
 * Decision Context:
 * - The wizard has 4 logical steps: club → slot → format → summary. Each
 *   `goToX()` method advances the wizard and asserts the next-step element is
 *   visible — that's our hydration/transition checkpoint.
 * - The first wizard step waits for `aria-pressed=true` on the selected card
 *   instead of just `click()`, because the React island hydrates after the
 *   initial Astro paint and an early click is silently no-op'd. Don't remove
 *   that wait.
 * - Previously fixed bugs: clicks on `.club-card` before hydration were
 *   no-ops; polling `aria-pressed` makes the test wait until React owns the
 *   element.
 */
export class CreateMatchPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly wizard: Locator;
  readonly continueButton: Locator;
  readonly dateInput: Locator;
  readonly capacityInput: Locator;
  readonly descriptionInput: Locator;
  readonly summaryHeading: Locator;
  readonly viewSummaryButton: Locator;
  readonly createButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { name: /crear partido/i });
    this.wizard = page.locator('.wizard');
    this.continueButton = page.getByRole('button', { name: /continuar/i });
    this.dateInput = page.getByLabel(/fecha del partido/i);
    this.capacityInput = page.getByRole('spinbutton', { name: /cantidad de jugadores/i });
    this.descriptionInput = page.getByLabel(/descripci/i);
    this.summaryHeading = page.getByRole('heading', { name: /resumen del partido/i });
    this.viewSummaryButton = page.getByRole('button', { name: /ver resumen/i });
    this.createButton = page.getByRole('button', { name: /^crear partido$/i });
  }

  async goto(): Promise<void> {
    await this.page.goto(`${FRONTEND_URL}/partidos/crear`);
    await expect(this.heading).toBeVisible();
    await expect(this.wizard).toBeVisible();
  }

  async selectFirstClubAndContinue(): Promise<void> {
    const firstClub = this.page.locator('.club-card').first();
    await expect(firstClub).toBeVisible();
    await firstClub.click();
    // Wait until React owns the click — see decision context above.
    await expect(firstClub).toHaveAttribute('aria-pressed', 'true');
    await expect(this.continueButton).toBeEnabled();
    await this.continueButton.click();
    await expect(this.dateInput).toBeVisible();
  }

  async selectSlotAndContinue(time = '19:00'): Promise<void> {
    await expect(this.page.getByText(time)).toBeVisible();
    await this.page.locator('.slot-card').filter({ hasText: time }).click();
    await this.continueButton.click();
    await expect(this.formatButton('5v5')).toBeVisible();
  }

  formatButton(label: '5v5' | '7v7' | '10v10' | '11v11'): Locator {
    return this.page.getByRole('button', { name: new RegExp(`^${label}`, 'i') });
  }

  async selectFormatAndOpenSummary(label: '5v5' | '7v7' | '10v10' | '11v11' = '7v7'): Promise<void> {
    await this.formatButton(label).click();
    await this.viewSummaryButton.click();
    await expect(this.summaryHeading).toBeVisible();
  }

  async readDate(): Promise<string> {
    return this.dateInput.inputValue();
  }
}
