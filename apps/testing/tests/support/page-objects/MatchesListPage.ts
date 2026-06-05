import { expect, type Locator, type Page } from '@playwright/test';
import { FRONTEND_URL } from '../constants';

/**
 * Page Object for the matches list view (/partidos).
 *
 * Decision Context:
 * - The page is statically rendered; the React island (`MatchesView`) hydrates
 *   client-side and queries via urql. Specs typically wait for the empty-state
 *   text or a known card title before interacting with filters — that's our
 *   proxy for "hydration finished and handlers are attached". Calling
 *   `expectListSettled(page, knownTitle)` documents that wait at the call site.
 * - Locators scoped to `main` keep the Astro dev-toolbar's injected `<select>`
 *   from contaminating filter counts. Don't drop that scope.
 * - Previously fixed bugs:
 *   1. `page.locator('select')` counted 4 because of the dev-toolbar; scoped
 *      to `main select` to fix.
 *   2. Strict-mode violation between the `Ver detalle` button and a card with
 *      aria-label `Ver detalle del partido ...`; using `name: 'Ver detalle',
 *      exact: true` (not regex) makes the matcher unambiguous.
 */
export class MatchesListPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly searchInput: Locator;
  readonly formatSelect: Locator;
  readonly zoneSelect: Locator;
  readonly scheduleSelect: Locator;
  readonly dateFromInput: Locator;
  readonly dateToInput: Locator;
  readonly clearButton: Locator;
  readonly emptyState: Locator;
  readonly showCancelledToggle: Locator;

  constructor(page: Page) {
    this.page = page;
    // /partidos unified matches + tournaments under one h1 (commit 432281a):
    // the page heading changed from "Partidos Disponibles" to "Partidos & Torneos".
    this.heading = page.getByRole('heading', { name: /Partidos\s*&\s*Torneos/i });
    this.searchInput = page.getByPlaceholder(/Buscar partido o club/i);
    this.formatSelect = page.getByLabel('Formato');
    this.zoneSelect = page.getByLabel('Zona');
    this.scheduleSelect = page.getByLabel('Horario');
    this.dateFromInput = page.getByLabel(/fecha desde/i);
    this.dateToInput = page.getByLabel(/fecha hasta/i);
    this.clearButton = page.getByRole('button', { name: /limpiar/i });
    this.emptyState = page.getByText('No hay partidos disponibles');
    // Authenticated-only checkbox that reveals the caller's own cancelled matches.
    // Rendered in the timeframe row by MatchesView; matched by its aria-label.
    this.showCancelledToggle = page.getByLabel(/mostrar mis partidos cancelados/i);
  }

  async goto(path = '/partidos'): Promise<void> {
    await this.page.goto(`${FRONTEND_URL}${path}`);
    await this.page.locator('.matches-section').scrollIntoViewIfNeeded();
  }

  /**
   * Wait until the list has either rendered the empty state or the given known
   * title — guarantees the React island has hydrated and onChange handlers are
   * attached before the test interacts with filters.
   */
  async expectListSettled(knownTitleOrEmpty?: string): Promise<void> {
    if (knownTitleOrEmpty) {
      await expect(this.page.getByText(knownTitleOrEmpty)).toBeVisible();
      return;
    }
    await expect(this.emptyState).toBeVisible();
  }

  /** Open a card by its visible title. */
  card(title: string): Locator {
    return this.page.getByText(title);
  }

  /** Disabled-or-enabled state of the always-rendered Limpiar button. */
  async expectClearState(state: 'enabled' | 'disabled'): Promise<void> {
    await expect(this.clearButton).toBeVisible();
    if (state === 'enabled') {
      await expect(this.clearButton).toBeEnabled();
    } else {
      await expect(this.clearButton).toBeDisabled();
    }
  }

  /** The detail CTA used for FULL matches. Exact match avoids the aria-label collision. */
  detailButton(): Locator {
    return this.page.getByRole('button', { name: 'Ver detalle', exact: true });
  }
}
