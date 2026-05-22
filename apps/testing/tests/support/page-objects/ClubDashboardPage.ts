import { expect, type Locator, type Page } from '@playwright/test';
import { CLUB_DASHBOARD_URL } from '../constants';

/**
 * Page Object for /panel-club/dashboard.
 *
 * Decision Context:
 * - The page SSR-prefetches dashboard data, then hydrates a React island for
 *   week navigation, filters and modals. goto() waits for both the SSR shell
 *   and the island hydration marker before tests click calendar cells.
 * - Cell locators use CalendarGrid's accessible aria-labels instead of CSS
 *   color classes, so the E2E contract remains user-facing: a slot is free,
 *   occupied by a match, or blocked.
 */
export class ClubDashboardPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly root: Locator;
  readonly calendarViewButton: Locator;
  readonly agendaViewButton: Locator;
  readonly previousWeekButton: Locator;
  readonly nextWeekButton: Locator;
  readonly loadingBar: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { name: /^dashboard$/i });
    this.root = page.locator('.dash-view');
    this.calendarViewButton = page.getByRole('button', { name: /vista calendario/i });
    this.agendaViewButton = page.getByRole('button', { name: /vista agenda/i });
    this.previousWeekButton = page.getByRole('button', { name: /semana anterior/i });
    this.nextWeekButton = page.getByRole('button', { name: /semana siguiente/i });
    this.loadingBar = page.getByLabel(/cargando dashboard/i);
  }

  async goto(): Promise<void> {
    await this.page.goto(CLUB_DASHBOARD_URL);
    await expect(this.heading).toBeVisible();
    await this.waitForIslandsHydrated();
    await expect(this.root).toBeVisible();
    await expect(this.calendarViewButton).toBeVisible();
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

  async waitForRefetchSettled(): Promise<void> {
    await expect(this.loadingBar).toHaveCount(0);
  }

  slotCell(time: string, status: string): Locator {
    const safeStatus = status.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return this.page.getByRole('button', {
      name: new RegExp(`saturday\\s+${time}.*${safeStatus}`, 'i'),
    });
  }

  agendaMatchCell(): Locator {
    return this.page.getByRole('button', { name: /cancha .*abierto/i });
  }
}
