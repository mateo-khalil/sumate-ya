import { expect, type Locator, type Page } from '@playwright/test';
import { TORNEOS_URL } from '../constants';

/**
 * Page Object for the tournament listing view (/torneos).
 *
 * Decision Context:
 * - The page shell is SSR (prerender = false), but TournamentList hydrates
 *   client-side with client:visible. Tournament data is fetched via useEffect
 *   through /api/graphql — interceptable with mockGraphQLAll(GRAPHQL_PROXY_ROUTE)
 *   before goto().
 * - isAuthenticated is injected server-side from Astro.locals.user. The CTA
 *   shown in each card ("Anotar equipo" vs "Iniciar sesión para anotar") depends
 *   on the session at SSR time. Auth state must be controlled via
 *   test.use({ storageState }) at the describe level.
 * - The client-side keepRegistrationOnly() filter runs after the fetch, so
 *   tournaments with status !== REGISTRATION sent in mocks do not render as cards.
 * - Loading skeletons are plain <div> elements; cards are <article> elements.
 *   expectListSettled() waits for the first <article>, empty state, or error panel
 *   — all reliable hydration proxies.
 * - joinTournament mutations go to /api/graphql-auth. Specs that test form
 *   submission mock that route via mockGraphQLAll(GRAPHQL_AUTH_ROUTE, ...).
 * - Previously fixed bugs: none relevant.
 */
export class TournamentsListPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly subtitle: Locator;
  readonly emptyState: Locator;
  readonly errorPanel: Locator;
  readonly retryButton: Locator;
  readonly teamNameInput: Locator;
  readonly cancelButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { name: /Torneos Disponibles/i });
    this.subtitle = page.getByText(/Encontrá una copa abierta/i);
    this.emptyState = page.getByText('No hay torneos en inscripción');
    this.errorPanel = page.getByText('No pudimos cargar los torneos');
    this.retryButton = page.getByRole('button', { name: /Reintentar/i });
    this.teamNameInput = page.getByPlaceholder('Nombre del equipo');
    this.cancelButton = page.getByRole('button', { name: 'Cancelar' });
  }

  async goto(): Promise<void> {
    await this.page.goto(TORNEOS_URL);
    await this.page.locator('.tournaments-section').scrollIntoViewIfNeeded();
  }

  /**
   * Wait until the list has settled into a stable state: either the empty state,
   * the error panel, or the first tournament card is visible. This is the
   * reliable hydration proxy since loading skeletons are plain <div> elements
   * and don't match getByRole('article').
   */
  async expectListSettled(): Promise<void> {
    await expect(
      this.emptyState.or(this.errorPanel).or(this.page.getByRole('article')).first(),
    ).toBeVisible({ timeout: 15_000 });
  }

  /** Returns the card <article> locator for a tournament by its visible name. */
  card(name: string): Locator {
    return this.page.getByRole('article').filter({ hasText: name });
  }

  /** "Anotar equipo" CTA button (authenticated, not-full tournament). */
  anotarButton(): Locator {
    return this.page.getByRole('button', { name: 'Anotar equipo' });
  }

  /** "Iniciar sesión para anotar" CTA button (anonymous user). */
  loginToRegisterButton(): Locator {
    return this.page.getByRole('button', { name: /Iniciar sesión para anotar/i });
  }

  /** "Completo" disabled button (tournament at full capacity). */
  completoButton(): Locator {
    return this.page.getByRole('button', { name: /Completo/i });
  }

  /** Submit button inside the inline registration form (text "Anotar"). */
  submitAnotarButton(): Locator {
    return this.page.getByRole('button', { name: 'Anotar', exact: true });
  }

  /** Inline error inside the card (role="alert"). */
  cardError(): Locator {
    return this.page.getByRole('alert');
  }

  /** Success message inside the card after a successful registration (role="status"). */
  cardSuccess(): Locator {
    return this.page.getByRole('status');
  }
}
