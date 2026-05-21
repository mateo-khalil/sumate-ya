import { expect, type Locator, type Page, type Route } from '@playwright/test';
import { GRAPHQL_AUTH_ROUTE, torneoDetailUrl } from '../constants';
import {
  buildAddMemberFailure,
  buildAddMemberResponse,
  buildEligiblePlayersResponse,
  buildJoinTournamentFailure,
  buildJoinTournamentResponse,
  buildMockTournamentPlayer,
  buildRemoveMemberFailure,
  buildRemoveMemberResponse,
  type MockTournamentPlayer,
  type MockTournamentTeamRegistrationResult,
} from '../builders';

/**
 * Sentinel player injected into eligible-players mock responses.
 *
 * Decision Context:
 * - TournamentRegistrationForm is rendered SSR (client:load). The submit button
 *   and "No hay jugadores disponibles" text appear in the SSR HTML BEFORE React
 *   hydrates and attaches event handlers. waitForFormHydrated() checking button
 *   visibility resolves from the SSR output — clicking the button before hydration
 *   triggers native form submission instead of React's onSubmit, so setError() is
 *   never called and [role="alert"] never appears.
 * - Fix: inject a known sentinel player into every eligible-players mock response.
 *   The sentinel button (.player-result-item containing 'Centinela E2E') can ONLY
 *   appear after: (1) React hydrates the island, (2) the 250ms useEffect debounce
 *   fires, (3) the mock fulfils the eligible-players fetch. Waiting for this button
 *   guarantees onSubmit is attached before fill+click.
 * - Used by: mockJoinSuccess, mockJoinFailure, mockSentinelEligiblePlayers.
 *   waitForReactHydrated() checks for this button display name.
 * - Previously fixed bugs: all inscription tests that called waitForFormHydrated()
 *   then submitted the form were doing so before React hydration, triggering native
 *   form submits and seeing no error feedback.
 */
const HYDRATION_SENTINEL: MockTournamentPlayer = buildMockTournamentPlayer({
  id: 'e2e-hydration-sentinel',
  displayName: 'Centinela E2E',
});

/**
 * Page Object for /torneos/[id] (tournament detail + registration form).
 *
 * Decision Context:
 * - The page is SSR (`prerender = false`) — the initial tournament data (teams,
 *   fixture, status) is fetched server-side from the backend and CANNOT be
 *   intercepted with page.route(). Tests rely on seeded DB data for the initial
 *   render (SEED_TOURNAMENTS.open / SEED_TOURNAMENTS.withCaptainLucas).
 * - The TournamentRegistrationForm React island (client:load) issues all
 *   mutations to /api/graphql-auth. These CAN be intercepted and are always
 *   mocked in tests to prevent writing real data during the spec run.
 * - Player search also goes to /api/graphql-auth (tournamentEligiblePlayers
 *   query). It is mocked alongside the mutation mock to return a predictable
 *   list of candidates.
 * - No data-testid attributes exist in TournamentRegistrationForm.tsx or the
 *   [id].astro page. All locators use accessible roles, ARIA labels, and CSS
 *   class names as a documented fallback.
 * - Previously fixed bugs: none relevant.
 *
 * TODO for the frontend team — add these data-testid attributes to
 * TournamentRegistrationForm.tsx and [id].astro to make selectors stable:
 *   - data-testid="tournament-join-form"          → the <form> in registration view
 *   - data-testid="tournament-team-name-input"    → the team name <input>
 *   - data-testid="tournament-submit-join"        → the "Anotar equipo" button
 *   - data-testid="tournament-form-error"         → the error <p role="alert">
 *   - data-testid="tournament-form-message"       → the success <p role="status">
 *   - data-testid="tournament-captain-panel"      → the .captain-panel div
 *   - data-testid="tournament-member-search"      → the member search input
 *   - data-testid="tournament-member-chip"        → each removable member chip
 *   - data-testid="tournament-player-result"      → each eligible player button
 *   - data-testid="tournament-login-cta"          → the login link for anonymous
 *   - data-testid="tournament-registration-closed" → the closed status div
 *   - data-testid="tournament-status-pill"        → the status badge
 *   - data-testid="tournament-capacity-number"    → the X/Y capacity display
 */
export class TournamentDetailPage {
  readonly page: Page;
  readonly tournamentId: string;

  /* ── Tournament heading ── */
  readonly pageHeading: Locator;
  readonly statusPill: Locator;

  /* ── Registration form (anonymous visitor) ── */
  readonly loginCta: Locator;

  /* ── Registration form (authenticated, can register) ── */
  readonly teamNameInput: Locator;
  readonly submitJoinButton: Locator;
  readonly memberSearchInput: Locator;
  readonly formError: Locator;
  readonly formMessage: Locator;

  /* ── Captain panel (already registered) ── */
  readonly captainPanel: Locator;
  readonly captainMemberSearchInput: Locator;

  /* ── Closed / full state ── */
  readonly registrationClosed: Locator;

  /* ── Fixture section ── */
  readonly fixtureSection: Locator;
  readonly fixtureEmptyState: Locator;

  constructor(page: Page, tournamentId: string) {
    this.page = page;
    this.tournamentId = tournamentId;

    this.pageHeading = page.getByRole('heading', { level: 1 });
    // TODO: use data-testid="tournament-status-pill" once added
    this.statusPill = page.locator('.status-pill');

    // The login CTA link text comes from TournamentRegistrationForm when !isAuthenticated
    this.loginCta = page.getByRole('link', { name: /iniciar sesion para anotar equipo/i });

    // Accessible label via sr-only <label htmlFor="teamName">Nombre del equipo</label>
    this.teamNameInput = page.getByLabel('Nombre del equipo');
    this.submitJoinButton = page.getByRole('button', { name: /anotar equipo/i });

    // Search input placeholders come from TournamentRegistrationForm
    // Registration form uses placeholder "Buscar miembros"
    this.memberSearchInput = page.getByPlaceholder('Buscar miembros');

    // Both error and success use ARIA roles (role="alert" / role="status")
    // TODO: use data-testid="tournament-form-error" once added
    this.formError = page.locator('[role="alert"]');
    // TODO: use data-testid="tournament-form-message" once added
    this.formMessage = page.locator('[role="status"]').last();

    // TODO: use data-testid="tournament-captain-panel" once added
    this.captainPanel = page.locator('.captain-panel');
    // Captain view uses placeholder "Buscar jugador para agregar"
    this.captainMemberSearchInput = page.getByPlaceholder('Buscar jugador para agregar');

    // TODO: use data-testid="tournament-registration-closed" once added
    this.registrationClosed = page.locator('.registration-closed');

    // Fixture is in a <section> with accessible label "Fixture"
    this.fixtureSection = page.locator('.fixture-section');
    this.fixtureEmptyState = page
      .locator('.fixture-section')
      .getByText(/el fixture todavia no fue generado/i);
  }

  async goto(): Promise<void> {
    await this.page.goto(torneoDetailUrl(this.tournamentId));
    // The SSR page renders a <h1> with the tournament name; wait for it.
    await expect(this.pageHeading).toBeVisible({ timeout: 15_000 });
  }

  /**
   * Returns the player result button for a given display name in the search results.
   * TODO: replace with data-testid="tournament-player-result" once added.
   */
  playerResultButton(displayName: string): Locator {
    return this.page.locator('.player-result-item').filter({ hasText: displayName });
  }

  /**
   * Returns a removable member chip by display name (captain view only).
   * TODO: replace with data-testid="tournament-member-chip" once added.
   */
  memberChip(displayName: string): Locator {
    return this.page.locator('.selected-player-chip').filter({ hasText: displayName });
  }

  /**
   * Returns a selected-player chip in the registration form (pre-submit member list).
   * Same CSS class as memberChip but shown in the join form, not the captain panel.
   */
  selectedPlayerChip(displayName: string): Locator {
    return this.page.locator('.selected-player-chip').filter({ hasText: displayName });
  }

  /**
   * Mocks ALL /api/graphql-auth traffic to return a fixed response. Use when
   * a test only issues one type of mutation and doesn't need selective routing.
   */
  async mockAllAuthRequests(
    body: Record<string, unknown>,
  ): Promise<{ payloads: unknown[] }> {
    const payloads: unknown[] = [];
    await this.page.unroute(GRAPHQL_AUTH_ROUTE).catch(() => undefined);
    await this.page.route(GRAPHQL_AUTH_ROUTE, async (route: Route) => {
      payloads.push(JSON.parse(route.request().postData() ?? '{}') as unknown);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    });
    return { payloads };
  }

  /**
   * Mocks the joinTournament mutation to return a success response.
   *
   * Serves HYDRATION_SENTINEL for eligible-players so waitForReactHydrated()
   * can confirm the island is fully hydrated before the test clicks submit.
   * Only join mutation requests are pushed to payloads — eligible-players
   * requests are handled separately and excluded.
   */
  async mockJoinSuccess(): Promise<{ payloads: unknown[] }> {
    const payloads: unknown[] = [];
    await this.page.unroute(GRAPHQL_AUTH_ROUTE).catch(() => undefined);
    await this.page.route(GRAPHQL_AUTH_ROUTE, async (route: Route) => {
      const body = JSON.parse(route.request().postData() ?? '{}') as { query?: string };
      if (body.query?.includes('tournamentEligiblePlayers')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(buildEligiblePlayersResponse([HYDRATION_SENTINEL])),
        });
        return;
      }
      payloads.push(body);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildJoinTournamentResponse()),
      });
    });
    return { payloads };
  }

  /**
   * Mocks the joinTournament mutation to return a failure with the given message.
   *
   * Serves HYDRATION_SENTINEL for eligible-players (same reasoning as mockJoinSuccess).
   * Only join mutation requests are pushed to payloads.
   */
  async mockJoinFailure(message: string): Promise<{ payloads: unknown[] }> {
    const payloads: unknown[] = [];
    await this.page.unroute(GRAPHQL_AUTH_ROUTE).catch(() => undefined);
    await this.page.route(GRAPHQL_AUTH_ROUTE, async (route: Route) => {
      const body = JSON.parse(route.request().postData() ?? '{}') as { query?: string };
      if (body.query?.includes('tournamentEligiblePlayers')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(buildEligiblePlayersResponse([HYDRATION_SENTINEL])),
        });
        return;
      }
      payloads.push(body);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildJoinTournamentFailure(message)),
      });
    });
    return { payloads };
  }

  /**
   * Sets up a route that serves HYDRATION_SENTINEL for eligible-players and lets
   * all other requests pass through. Use when a test needs hydration detection but
   * does NOT need to mock the join mutation (e.g. "nombre vacío" which relies on
   * client-side validation, not a backend response).
   */
  async mockSentinelEligiblePlayers(): Promise<void> {
    await this.page.unroute(GRAPHQL_AUTH_ROUTE).catch(() => undefined);
    await this.page.route(GRAPHQL_AUTH_ROUTE, async (route: Route) => {
      const body = JSON.parse(route.request().postData() ?? '{}') as { query?: string };
      if (body.query?.includes('tournamentEligiblePlayers')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(buildEligiblePlayersResponse([HYDRATION_SENTINEL])),
        });
        return;
      }
      await route.continue();
    });
  }

  /**
   * Mocks the eligible-players query to return the given list, and mocks any
   * subsequent mutation (add/remove) to return the given mutation response.
   * Used in captain-panel tests where both the search and the mutation need
   * to be controlled.
   */
  async mockEligiblePlayersAndMutation(
    players: MockTournamentPlayer[],
    mutationKey: 'addTournamentTeamMember' | 'removeTournamentTeamMember',
    mutationResult:
      | { data: { addTournamentTeamMember: MockTournamentTeamRegistrationResult } }
      | { data: { removeTournamentTeamMember: MockTournamentTeamRegistrationResult } },
  ): Promise<void> {
    await this.page.unroute(GRAPHQL_AUTH_ROUTE).catch(() => undefined);
    await this.page.route(GRAPHQL_AUTH_ROUTE, async (route: Route) => {
      const body = JSON.parse(route.request().postData() ?? '{}') as {
        query?: string;
      };
      if (body.query?.includes('tournamentEligiblePlayers')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(buildEligiblePlayersResponse(players)),
        });
        return;
      }
      if (body.query?.includes(mutationKey)) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mutationResult),
        });
        return;
      }
      await route.continue();
    });
  }

  /** Mock helpers for add-member success/failure. */
  async mockAddMemberSuccess(players: MockTournamentPlayer[] = []): Promise<void> {
    await this.mockEligiblePlayersAndMutation(
      players,
      'addTournamentTeamMember',
      buildAddMemberResponse(),
    );
  }

  async mockAddMemberFailure(
    message: string,
    players: MockTournamentPlayer[] = [],
  ): Promise<void> {
    await this.mockEligiblePlayersAndMutation(
      players,
      'addTournamentTeamMember',
      buildAddMemberFailure(message),
    );
  }

  /** Mock helpers for remove-member success/failure. */
  async mockRemoveMemberSuccess(players: MockTournamentPlayer[] = []): Promise<void> {
    await this.mockEligiblePlayersAndMutation(
      players,
      'removeTournamentTeamMember',
      buildRemoveMemberResponse(),
    );
  }

  async mockRemoveMemberFailure(
    message: string,
    players: MockTournamentPlayer[] = [],
  ): Promise<void> {
    await this.mockEligiblePlayersAndMutation(
      players,
      'removeTournamentTeamMember',
      buildRemoveMemberFailure(message),
    );
  }

  /**
   * Waits for the React island to be fully hydrated by checking for the
   * HYDRATION_SENTINEL player button. This button only appears after:
   * (1) React hydrates the island, (2) the 250ms useEffect debounce fires,
   * (3) the eligible-players mock (set up by mockJoinSuccess/mockJoinFailure/
   *     mockSentinelEligiblePlayers) fulfils with the sentinel player.
   *
   * Call this instead of waitForFormHydrated() in any test that fills the team
   * name input and clicks the submit button — those actions require the React
   * onSubmit handler to be attached, which is only guaranteed after hydration.
   */
  async waitForReactHydrated(): Promise<void> {
    await expect(
      this.playerResultButton(HYDRATION_SENTINEL.displayName),
      'El centinela de hidratación debe aparecer antes de interactuar con el formulario',
    ).toBeVisible({ timeout: 15_000 });
  }

  /**
   * Waits for the TournamentRegistrationForm React island to hydrate.
   * Either the join form, the login CTA, the captain panel, or the closed
   * state must be visible — whichever applies given the current auth + tournament state.
   * NOTE: prefer waitForReactHydrated() for tests that fill+click the join form.
   */
  async waitForFormHydrated(): Promise<void> {
    await expect(
      this.submitJoinButton
        .or(this.loginCta)
        .or(this.captainPanel)
        .or(this.registrationClosed),
    ).toBeVisible({ timeout: 15_000 });
  }
}
