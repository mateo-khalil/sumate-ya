import { expect, type Locator, type Page } from '@playwright/test';
import { FRONTEND_URL } from '../constants';

/**
 * Page Object for /partidos/[id].
 *
 * Decision Context:
 * - The detail is SSR; the join/leave React islands use `client:load`. If a
 *   click fires before hydration the onClick handler isn't attached and the
 *   mutation never goes out. `waitForIslandsHydrated` polls Astro 6's
 *   `client-render-time` attribute on every `astro-island[client="load"]` —
 *   that attribute is set when React finishes mounting.
 * - Why filter by `client="load"` (not all islands): islands with
 *   `client:visible` (e.g. MatchResultsSection at the bottom) never hydrate
 *   without scrolling; waiting for them would timeout.
 * - Previously fixed bugs:
 *   1. Join-team tests failing with `expected 1, received 0` because the click
 *      ran before hydration.
 *   2. Helper timing out at 10s after MatchResultsSection was added — fixed by
 *      filtering on `client="load"` only.
 */
export class MatchDetailPage {
  readonly page: Page;
  readonly root: Locator;
  readonly joinTeamA: Locator;
  readonly joinTeamB: Locator;
  readonly leaveButton: Locator;
  readonly confirmDialog: Locator;
  readonly confirmLeaveButton: Locator;
  readonly cancelLeaveButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.root = page.locator('.match-detail');
    this.joinTeamA = page.getByRole('button', { name: /sumarme al equipo a/i });
    this.joinTeamB = page.getByRole('button', { name: /sumarme al equipo b/i });
    this.leaveButton = page.getByRole('button', { name: /salirme del partido/i });
    this.confirmDialog = page.getByRole('dialog');
    this.confirmLeaveButton = page.getByRole('button', { name: /sí, salirme/i });
    this.cancelLeaveButton = page.getByRole('button', { name: /cancelar/i });
  }

  async goto(matchId: string): Promise<void> {
    await this.page.goto(`${FRONTEND_URL}/partidos/${matchId}`);
    await expect(this.root).toBeVisible();
    await this.waitForIslandsHydrated();
  }

  /** Astro 6 stamps `client-render-time` on each island after hydration. */
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

  joinButton(team: 'A' | 'B'): Locator {
    return team === 'A' ? this.joinTeamA : this.joinTeamB;
  }

  async openLeaveDialog(): Promise<void> {
    await this.leaveButton.click();
    await expect(this.confirmDialog).toBeVisible();
  }

  /** Returns the .player-card element that contains the given player display name. */
  playerCard(displayName: string): Locator {
    return this.page.locator('.player-card').filter({ hasText: displayName }).first();
  }

  /**
   * Returns the .division-badge inside the player-card matching displayName.
   * In PlayerCard.astro the badge is rendered in compact mode, so it also
   * carries the class `division-badge--compact`.
   */
  playerDivisionBadge(displayName: string): Locator {
    return this.playerCard(displayName).locator('.division-badge');
  }

  /** All .division-badge elements visible inside any .player-card on the page. */
  get allPlayerDivisionBadges(): Locator {
    return this.page.locator('.player-card .division-badge');
  }
}
