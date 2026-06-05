import { expect, type Locator, type Page } from '@playwright/test';
import { LEADERBOARD_URL } from '../constants';

/**
 * Page Object for the public leaderboard view (/leaderboard).
 *
 * Decision Context:
 * - The page shell is SSR (prerender = false) so the shared Topbar renders with the
 *   session, but LeaderboardTable hydrates client-side (client:visible) and fetches
 *   the ranking via fetch('/api/graphql'). That request is interceptable with
 *   mockGraphQLAll(GRAPHQL_PROXY_ROUTE) BEFORE goto().
 * - The endpoint `leaderboard` is public — anonymous and authenticated visitors both
 *   see the table. Self-highlight (.leaderboard-row--self) only renders when an
 *   authenticated session's userId matches a row, so those specs set storageState.
 * - Loading skeletons are plain <div> (.leaderboard-skeleton-row); the settled state
 *   is the table, the empty state, or the error panel. expectSettled() waits on that.
 * - Rows are <li> elements inside [data-testid="leaderboard-table"]; we locate a row
 *   by visible player name, matching how the real user scans the table.
 * - Previously fixed bugs: none relevant.
 */
export class LeaderboardPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly subtitle: Locator;
  readonly table: Locator;
  readonly emptyState: Locator;
  readonly errorPanel: Locator;
  readonly retryButton: Locator;
  readonly selfRow: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { name: /Mejores Jugadores/i });
    this.subtitle = page.getByText(/Ordenado por efectividad/i);
    this.table = page.getByTestId('leaderboard-table');
    this.emptyState = page.getByText(/Todav.a no hay ranking/i);
    this.errorPanel = page.getByText('No pudimos cargar el ranking');
    this.retryButton = page.getByRole('button', { name: /Reintentar/i });
    this.selfRow = page.locator('.leaderboard-row--self');
  }

  async goto(url: string = LEADERBOARD_URL): Promise<void> {
    await this.page.goto(url);
    // The island is client:visible; nudge it into view to trigger hydration + fetch.
    await this.heading.scrollIntoViewIfNeeded().catch(() => {});
  }

  /**
   * Wait until the ranking settles into a stable state: the table, the empty state,
   * or the error panel is visible. Reliable hydration proxy since the skeleton rows
   * are plain <div> that don't match any of these.
   */
  async expectSettled(): Promise<void> {
    await expect(
      this.table.or(this.emptyState).or(this.errorPanel).first(),
    ).toBeVisible({ timeout: 15_000 });
  }

  /** Returns the row <li> for a player by visible display name. */
  row(displayName: string): Locator {
    return this.table.locator('.leaderboard-row').filter({ hasText: displayName });
  }
}
