import { expect, type Locator, type Page } from '@playwright/test';
import { FRONTEND_URL } from '../constants';

/**
 * Page Object for the matches map view (/partidos with the Mapa toggle).
 *
 * Decision Context:
 * - The map is lazy: `GetMatchesWithCoords` fires only after the Mapa toggle
 *   is clicked. We assert that lazy boundary in tests by checking the request
 *   tracker on the GraphQL mock.
 * - `name: 'Mapa', exact: true` (not regex) avoids strict-mode collisions with
 *   match cards whose aria-label includes the word "mapa". Same trick used for
 *   `Lista`.
 * - Previously fixed bugs: switchToMap() failed strict-mode when the listing
 *   contained a card with the word "mapa" in its title.
 */
export class MatchesMapPage {
  readonly page: Page;
  readonly listToggle: Locator;
  readonly mapToggle: Locator;
  readonly mapContainer: Locator;
  readonly markers: Locator;
  readonly popup: Locator;
  readonly emptyMessage: Locator;
  readonly searchInput: Locator;

  constructor(page: Page) {
    this.page = page;
    this.listToggle = page.getByRole('button', { name: 'Lista', exact: true });
    this.mapToggle = page.getByRole('button', { name: 'Mapa', exact: true });
    this.mapContainer = page.locator('.leaflet-container');
    this.markers = page.locator('.leaflet-marker-icon');
    this.popup = page.locator('.leaflet-popup');
    this.emptyMessage = page.locator('.match-map-empty-msg');
    this.searchInput = page.getByPlaceholder(/buscar partido o club/i);
  }

  async goto(): Promise<void> {
    await this.page.goto(`${FRONTEND_URL}/partidos`);
    await this.page.locator('.matches-section').scrollIntoViewIfNeeded();
    await expect(this.listToggle).toBeVisible();
  }

  async waitForListHydration(): Promise<void> {
    await expect
      .poll(async () => {
        const text = await this.page.locator('main').innerText();
        return /No hay partidos disponibles|Error|jugadores/i.test(text);
      })
      .toBe(true);
  }

  async switchToMap(): Promise<void> {
    await this.mapToggle.click();
    await expect(this.mapToggle).toHaveAttribute('aria-pressed', 'true');
  }
}
