import { expect, type Locator, type Page, type Route } from '@playwright/test';
import { BACKEND_GRAPHQL_ROUTE, FRONTEND_URL } from '../constants';

/**
 * Page Object for the result-voting section that lives at the bottom of
 * /partidos/[id]. Covers US #54 — "Confirmar resultado y actualizar stats".
 *
 * Decision Context:
 * - The section is a React island mounted with `client:visible` in
 *   `apps/frontend/src/pages/partidos/[id].astro`. It only renders when:
 *     showResultSection = matchStarted && isJoined && isPlayer && !matchCancelled
 *   So specs must pick a seed match that already satisfies those guards
 *   (most use SEED_MATCHES.full where playerMateo is inscripto). The PO does
 *   NOT try to bypass the gate — that would mask a regression in the SSR
 *   guard added by the P1 audit (cancelled matches must not show this UI).
 * - The island fetches `${backendUrl}/graphql` straight from the browser
 *   (see MatchResultsSection.tsx → gql()). That URL is interceptable with
 *   `page.route(BACKEND_GRAPHQL_ROUTE, ...)` — unlike the SSR `match()` query
 *   in the page frontmatter, which runs server-side and can't be mocked.
 * - We mock per-operation (matching on the operation name in the GraphQL
 *   query string) rather than wholesale, so the page's join/leave/myMatches
 *   islands keep their real responses and a regression in any of those
 *   shows up here too. This mirrors the pattern in match-detail.spec.ts.
 * - Lazy hydration: because the island is `client:visible`, it only mounts
 *   AFTER the user scrolls it into the viewport. `scrollIntoView()` +
 *   `waitForIslandsHydrated()` is required before asserting locators — every
 *   spec must call `goto()` on this PO (NOT MatchDetailPage.goto) when
 *   exercising this section, because that helper handles both.
 * - statusChanged contract (the heart of US #54): when a vote crosses strict
 *   majority, the RPC returns `statusChanged: true` and the UI must:
 *     (a) replace the voted card with a CONFIRMED card,
 *     (b) auto-reject any other PENDING submission in the list
 *         (handled in handleVote in MatchResultsSection.tsx).
 *   The PO exposes `expectConfirmedBadge()` / `expectRejectedBadge()` so
 *   specs assert both effects with one call each.
 * - Previously fixed bugs:
 *   * P2 audit: "Cargar resultado" CTA disappeared when ALL submissions were
 *     REJECTED — the spec asserts the CTA reappears in that branch so the
 *     bug never re-lands.
 *   * Race condition where 2 simultaneous "final approve" votes
 *     double-incremented stats — covered by the unit test suite
 *     (matchResultVoteService.test.ts "is idempotent when the RPC reports
 *     alreadyConfirmed") and surfaces here as the statusChanged=false branch
 *     that must NOT update the UI to CONFIRMED.
 */
export class MatchResultsSectionPage {
  readonly page: Page;
  readonly section: Locator;
  readonly heading: Locator;
  readonly loadResultButton: Locator;
  readonly proposeAnotherButton: Locator;
  readonly approveButton: Locator;
  readonly rejectButton: Locator;
  readonly changeVoteButton: Locator;
  readonly editTeamsButton: Locator;
  readonly saveTeamsButton: Locator;
  readonly scoreAInput: Locator;
  readonly scoreBInput: Locator;
  readonly resultSummary: Locator;
  readonly submitResultButton: Locator;
  readonly cancelResultButton: Locator;
  readonly errorMessage: Locator;

  constructor(page: Page) {
    this.page = page;
    /*
     * Locator strategy: the section is the <section> that wraps the
     * "Resultado del partido" heading. Scoping to it keeps locators stable
     * even when the rest of the page adds more sections (e.g. fixtures,
     * stadium info) above or below it.
     */
    this.section = page.locator('section', {
      has: page.getByRole('heading', { name: /resultado del partido/i, level: 2 }),
    });
    this.heading = this.section.getByRole('heading', { name: /resultado del partido/i });

    this.loadResultButton = this.section.getByRole('button', { name: /cargar resultado/i });
    this.proposeAnotherButton = this.section.getByRole('button', { name: /proponer otro resultado/i });
    this.approveButton = this.section.getByRole('button', { name: /^aprobar$/i });
    this.rejectButton = this.section.getByRole('button', { name: /^rechazar$/i });
    this.changeVoteButton = this.section.getByRole('button', { name: /cambiar voto/i });
    // Roster-correction controls (EditTeamsForm): the "Editar equipos" toggle opens the form
    // and "Guardar equipos" submits the ReassignMatchTeams mutation. Available until a result
    // is CONFIRMED (the component hides the toggle once hasConfirmed).
    this.editTeamsButton = this.section.getByRole('button', { name: /editar equipos/i });
    this.saveTeamsButton = this.section.getByRole('button', { name: /guardar equipos/i });
    const resultForm = this.section.locator('form', { hasText: /marcador final/i });
    this.scoreAInput = resultForm.locator('input[type="number"]').nth(0);
    this.scoreBInput = resultForm.locator('input[type="number"]').nth(1);
    this.resultSummary = resultForm.getByText(/resultado:/i);
    this.submitResultButton = resultForm.getByRole('button', { name: /enviar resultado/i });
    this.cancelResultButton = resultForm.getByRole('button', { name: /cancelar/i });
    /*
     * Vote / fetch errors are rendered as <p class="text-destructive"> right
     * under the heading. We use a relaxed text-class selector because the
     * component intentionally avoids role="alert" — the error is informational,
     * not a screen-reader interruption.
     */
    this.errorMessage = this.section.locator('p.text-destructive');
  }

  /**
   * Navigate to /partidos/[id] and wait for the (lazy) result section to
   * hydrate. Scrolling triggers the `client:visible` mount, then we poll
   * Astro's `client-render-time` marker.
   */
  async goto(matchId: string): Promise<void> {
    await this.page.goto(`${FRONTEND_URL}/partidos/${matchId}`);
    await this.heading.scrollIntoViewIfNeeded();
    await this.waitForIslandsHydrated();
    await expect(this.section, 'Result section must render for participants').toBeVisible();
  }

  /**
   * Astro 6 stamps `client-render-time` on every island after React mounts.
   * We accept either form (`client="load"` or `client="visible"`) because
   * this PO's island is the visible-mounted one but the page also has
   * load-mounted islands that must finish before any interaction is safe.
   */
  async waitForIslandsHydrated(): Promise<void> {
    await this.page.waitForFunction(
      () => {
        const islands = Array.from(
          document.querySelectorAll(
            'astro-island[client="load"], astro-island[client="visible"]',
          ),
        );
        if (islands.length === 0) return true;
        return islands.every((island) => island.hasAttribute('client-render-time'));
      },
      { timeout: 15_000 },
    );
  }

  /**
   * Returns the card representing a single submission by its score. The
   * cards in the section don't expose stable IDs (the component renders
   * .bg-card / .bg-success-surface div blocks), so we scope by the score
   * text + the wrapping flex container. This matches what a real user
   * would visually identify.
   */
  submissionCardByScore(scoreA: number, scoreB: number): Locator {
    return this.section
      .locator('div.flex.flex-col.gap-\\[0\\.7rem\\]')
      .filter({
        hasText: new RegExp(`^${scoreA}\\s*—\\s*${scoreB}`),
      });
  }

  /**
   * Mocks the initial submissions fetch (GetMatchResultSubmissions). Use
   * for tests that need a specific list state at first render (e.g. "no
   * submissions" CTA, "one pending submission with 2 approves", etc.).
   *
   * Returns the captured payloads so a spec can assert exactly one query
   * fired with the expected matchId variable.
   */
  async mockGetSubmissions<T>(body: T): Promise<{ payloads: Array<{ variables?: unknown }> }> {
    return this.mockOperation('matchResultSubmissions', body);
  }

  /**
   * Mocks VoteMatchResult mutation. Pass a fully-formed VoteSubmissionResult
   * body (including statusChanged + submission) so the test controls whether
   * the UI transitions to CONFIRMED or stays PENDING.
   */
  async mockVoteMatchResult<T>(body: T): Promise<{ payloads: Array<{ variables?: unknown }> }> {
    return this.mockOperation('VoteMatchResult', body);
  }

  /** Mocks ProposeMatchResult mutation (used by ProposeResultForm sibling). */
  async mockProposeMatchResult<T>(body: T): Promise<{ payloads: Array<{ variables?: unknown }> }> {
    return this.mockOperation('ProposeMatchResult', body);
  }

  async fillResult(scoreA: number, scoreB: number): Promise<void> {
    await this.scoreAInput.fill(String(scoreA));
    await this.scoreBInput.fill(String(scoreB));
  }

  /**
   * Mocks the ReassignMatchTeams mutation fired by EditTeamsForm. Returns the captured
   * payloads so a spec can assert the assignments sent. Note: on success the component calls
   * window.location.reload(), so assert the payload (via expect.poll) right after the click.
   */
  async mockReassignMatchTeams<T>(body: T): Promise<{ payloads: Array<{ variables?: unknown }> }> {
    return this.mockOperation('ReassignMatchTeams', body);
  }

  /** The A/B toggle button for a given player inside the open EditTeamsForm. */
  teamToggle(playerName: string, team: 'A' | 'B'): Locator {
    return this.section
      .locator('li', { hasText: playerName })
      .getByRole('button', { name: new RegExp(`^equipo ${team}$`, 'i') });
  }

  /**
   * Internal helper: intercept GraphQL requests whose query string contains
   * `operationMarker`. All other GraphQL traffic continues to the real
   * backend so the SSR proxy + join/leave islands keep working.
   *
   * Decision Context:
   * - We DON'T use the shared `mockGraphQLOperation` helper here because
   *   the section adds its routes lazily (one per test) and we want to
   *   keep the PO self-contained. The shape is identical; just inline
   *   for clarity at the call site.
   */
  private async mockOperation<T>(
    operationMarker: string,
    body: T,
  ): Promise<{ payloads: Array<{ variables?: unknown }> }> {
    const payloads: Array<{ variables?: unknown }> = [];
    await this.page.route(BACKEND_GRAPHQL_ROUTE, async (route: Route) => {
      const postData = route.request().postData();
      if (!postData) {
        // route.fallback() chains to previously-registered handlers so multiple
        // mockOperation() calls can co-exist (e.g. mock GetMatchResultSubmissions
        // + mock VoteMatchResult). route.continue() would send to network and
        // bypass the earlier handler.
        await route.fallback();
        return;
      }
      let parsed: { query?: string; variables?: unknown };
      try {
        parsed = JSON.parse(postData) as { query?: string; variables?: unknown };
      } catch {
        await route.fallback();
        return;
      }
      if (!parsed.query?.includes(operationMarker)) {
        await route.fallback();
        return;
      }
      payloads.push(parsed);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    });
    return { payloads };
  }

  /**
   * Asserts that a given score-pair shows the "Resultado oficial" badge.
   * Used after voteMatchResult returns statusChanged=true.
   */
  async expectConfirmedBadge(scoreA: number, scoreB: number): Promise<void> {
    const card = this.submissionCardByScore(scoreA, scoreB);
    await expect(card.getByText(/resultado oficial/i)).toBeVisible();
  }

  async expectRejectedBadge(scoreA: number, scoreB: number): Promise<void> {
    const card = this.submissionCardByScore(scoreA, scoreB);
    await expect(card.getByText(/^rechazado$/i)).toBeVisible();
  }

  async expectPendingBadge(scoreA: number, scoreB: number): Promise<void> {
    const card = this.submissionCardByScore(scoreA, scoreB);
    await expect(card.getByText(/^pendiente$/i)).toBeVisible();
  }
}
