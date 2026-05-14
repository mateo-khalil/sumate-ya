import { expect, type Locator, type Page } from '@playwright/test';
import { FRONTEND_URL } from '../constants';

/**
 * Page Object for /ajustes.
 *
 * Decision Context:
 * - /ajustes renders privacy controls inside a React `client:load` island. The page
 *   can be visible before the island has mounted, so goto() waits for Astro's
 *   `client-render-time` marker before tests click toggles.
 * - Locators use accessible roles/names for the switches and action buttons so tests
 *   assert the player-facing contract instead of component class names.
 */
export class SettingsPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly publicProfileSwitch: Locator;
  readonly statsSwitch: Locator;
  readonly historySwitch: Locator;
  readonly positionSwitch: Locator;
  readonly divisionSwitch: Locator;
  readonly saveButton: Locator;
  readonly previewButton: Locator;
  readonly previewDialog: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { name: /^ajustes$/i });
    this.publicProfileSwitch = page.getByRole('switch', { name: /perfil p.blico/i });
    this.statsSwitch = page.getByRole('switch', { name: /estad/i });
    this.historySwitch = page.getByRole('switch', { name: /historial de partidos/i });
    this.positionSwitch = page.getByRole('switch', { name: /posici/i });
    this.divisionSwitch = page.getByRole('switch', { name: /divisi/i });
    this.saveButton = page.getByRole('button', { name: /guardar cambios/i });
    this.previewButton = page.getByRole('button', { name: /ver como otros me ven/i });
    this.previewDialog = page.getByRole('dialog', { name: /vista previa de tu perfil/i });
  }

  async goto(): Promise<void> {
    await this.page.goto(`${FRONTEND_URL}/ajustes`);
    await expect(this.heading).toBeVisible();
    await this.waitForIslandsHydrated();
    await expect(this.publicProfileSwitch).toBeVisible();
  }

  /** Astro stamps `client-render-time` on a client island after hydration. */
  async waitForIslandsHydrated(): Promise<void> {
    await this.page.waitForFunction(
      () => {
        const islands = Array.from(document.querySelectorAll('astro-island[client="load"]'));
        if (islands.length === 0) return true;
        return islands.every((island) => island.hasAttribute('client-render-time'));
      },
      { timeout: 10_000 },
    );
  }

  async save(): Promise<void> {
    await this.saveButton.click();
    await expect(this.page.getByRole('alert')).toContainText(
      /configuraci.n de privacidad guardada/i,
    );
  }
}
