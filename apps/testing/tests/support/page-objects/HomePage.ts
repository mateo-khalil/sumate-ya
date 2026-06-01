import { expect, type Locator, type Page } from '@playwright/test';
import { FRONTEND_URL } from '../constants';

/**
 * Page Object for the marketing home (/).
 *
 * Decision Context:
 * - Used by `menu-overview.spec.ts` and any flow that lands on `/`. The home
 *   issues a `matches` GraphQL query on hydration; specs that don't care about
 *   real data should mock that endpoint with `mockGraphQLAll`.
 * - Stat cards have ambiguous text matches (e.g. `500+` also appears in the
 *   hero ticker). Use `metricCard()` to scope by label.
 */
export class HomePage {
  readonly page: Page;
  readonly hero: Locator;
  readonly loginLink: Locator;
  readonly registerLink: Locator;
  readonly viewAllMatchesLink: Locator;
  readonly viewAllTournamentsLink: Locator;
  readonly searchInput: Locator;

  constructor(page: Page) {
    this.page = page;
    this.hero = page.getByRole('heading', { name: /sumate\s+al juego/i });
    this.loginLink = page.getByRole('link', { name: /iniciar sesi/i }).first();
    this.registerLink = page.getByRole('link', { name: /registrarse/i }).first();
    // The home now renders two "Ver todos" links — one per section (matches ->
    // /partidos, tournaments -> /torneos). Scope by href so the matcher is
    // unambiguous instead of relying on DOM order.
    this.viewAllMatchesLink = page
      .getByRole('link', { name: /ver todos/i })
      .and(page.locator('a[href="/partidos"]'));
    this.viewAllTournamentsLink = page
      .getByRole('link', { name: /ver todos/i })
      .and(page.locator('a[href="/torneos"]'));
    this.searchInput = page.getByPlaceholder(/buscar partido o club/i);
  }

  async goto(): Promise<void> {
    await this.page.goto(FRONTEND_URL);
    await expect(this.hero).toBeVisible();
  }

  metricCard(label: string, value: string): Locator {
    return this.page
      .locator('div', { has: this.page.getByText(label, { exact: true }) })
      .filter({ hasText: value })
      .first();
  }
}
