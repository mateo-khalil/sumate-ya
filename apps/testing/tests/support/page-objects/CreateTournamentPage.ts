import { expect, type Locator, type Page } from '@playwright/test';
import { TORNEOS_CREAR_URL } from '../constants';

/**
 * Page Object for /torneos/crear (tournament creation form).
 *
 * Decision Context:
 * - /torneos/crear now exposes TWO creation modes behind tabs (commit 0ae5f3d /
 *   PR #148 "mejorar-torneos-132"): "Modo automático" (NewTournamentWizard, the
 *   default-active tab in #panel-wizard) and "Modo clásico (horarios)" (the legacy
 *   CreateTournamentFlow in #panel-legacy, hidden via display:none until selected).
 *   This PO drives the LEGACY flow, so goto() activates the "Modo clásico" tab and
 *   every form-field locator is scoped to `#panel-legacy`. Scoping is mandatory:
 *   the wizard renders fields with overlapping accessible names (e.g. "Equipos en el
 *   torneo" vs legacy "Equipos", "Nombre del torneo" vs legacy "Nombre"), so an
 *   unscoped getByLabel() would hit a strict-mode violation or the hidden wizard input.
 * - The form is a single-page React island (client:load) rendered inside an SSR
 *   Astro shell. Club list is SSR-prefetched and cannot be mocked via page.route();
 *   tests rely on the real backend for the initial page render.
 * - Slot availability is fetched client-side via /api/graphql after hydration.
 *   Tests mock this via GRAPHQL_PROXY_ROUTE (guarded to skip /api/graphql-auth).
 * - The createTournament mutation goes to /api/graphql-auth and is also mocked
 *   so no real tournament data is written during the spec run.
 * - The form component has NO data-testid attributes. All locators use accessible
 *   roles, ARIA-computed labels (from wrapping <label> elements), and CSS class
 *   selectors as a last resort (documented with TODO comments below).
 * - Previously fixed bugs: none relevant.
 *
 * TODO for the frontend team — add these data-testid attributes to
 * CreateTournamentFlow.tsx so the test suite can use stable selectors:
 *   - data-testid="tournament-name-input"        → the Nombre input
 *   - data-testid="tournament-club-select"       → the Club select
 *   - data-testid="tournament-team-count-input"  → the Equipos number input
 *   - data-testid="tournament-players-input"     → the Jugadores por equipo input
 *   - data-testid="tournament-description"       → the Descripción textarea
 *   - data-testid="tournament-slot-date"         → the Fecha date input
 *   - data-testid="tournament-format-chip"       → each format button (+ value attr)
 *   - data-testid="tournament-slot-option"       → each slot button (+ slotId attr)
 *   - data-testid="tournament-submit"            → the Crear torneo button
 *   - data-testid="tournament-success"           → the TORNEO CREADO container
 *   - data-testid="tournament-submit-error"      → the inline error panel
 *   - data-testid="tournament-metric-matches"    → the "partidos" metric strong
 *   - data-testid="tournament-metric-remaining"  → the "horarios faltan" metric strong
 */
export class CreateTournamentPage {
  readonly page: Page;
  readonly heading: Locator;

  /* ── Form fields ── */
  readonly nameInput: Locator;
  readonly clubSelect: Locator;
  readonly teamsCountInput: Locator;
  readonly playersPerTeamInput: Locator;
  readonly descriptionTextarea: Locator;
  readonly slotDateInput: Locator;

  /* ── Submit ── */
  readonly submitButton: Locator;

  /* ── Success screen ── */
  readonly successTitle: Locator;
  readonly createAnotherButton: Locator;
  readonly backButton: Locator;

  /* ── Error / empty states ── */
  readonly submitError: Locator;
  readonly slotLoadingMessage: Locator;
  readonly emptySlotMessage: Locator;

  /** The legacy "Modo clásico" panel — every form locator is scoped to it. */
  readonly legacyPanel: Locator;
  readonly legacyTab: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { name: /crear torneo/i });

    // The legacy CreateTournamentFlow lives in #panel-legacy. Scoping every field
    // locator here keeps getByLabel() from colliding with the wizard's overlapping
    // field names (in the hidden #panel-wizard) — a strict-mode hazard.
    this.legacyPanel = page.locator('#panel-legacy');
    this.legacyTab = page.getByRole('tab', { name: /modo cl.sico/i });

    // Accessible name comes from the wrapping <label><span>Nombre</span><input/></label>
    this.nameInput = this.legacyPanel.getByLabel('Nombre');
    this.clubSelect = this.legacyPanel.getByLabel('Club');
    this.teamsCountInput = this.legacyPanel.getByLabel('Equipos');
    this.playersPerTeamInput = this.legacyPanel.getByLabel('Jugadores por equipo');
    this.descriptionTextarea = this.legacyPanel.getByLabel('Descripción');
    // TODO: use data-testid="tournament-slot-date" once added
    this.slotDateInput = this.legacyPanel.locator('input[type="date"]');

    // The button says "Crear torneo" when idle, "Creando..." when submitting.
    // Using exact /^crear torneo$/i avoids matching "Crear otro torneo".
    this.submitButton = this.legacyPanel.getByRole('button', { name: /^crear torneo$/i });

    this.successTitle = this.legacyPanel.getByText('TORNEO CREADO');
    this.createAnotherButton = this.legacyPanel.getByRole('button', { name: /crear otro torneo/i });
    this.backButton = this.legacyPanel.getByRole('link', { name: /volver/i });

    // TODO: use data-testid="tournament-submit-error" once added
    this.submitError = this.legacyPanel.locator('.submit-error');
    this.slotLoadingMessage = this.legacyPanel.getByText(/cargando horarios/i);
    this.emptySlotMessage = this.legacyPanel.getByText(/no hay horarios disponibles/i);
  }

  /**
   * Returns the format chip button for a given format label (e.g. '5v5', '7v7').
   * TODO: replace with getByTestId once data-testid="tournament-format-chip" is added.
   */
  formatChip(label: string): Locator {
    return this.legacyPanel.locator('.format-chip').filter({ hasText: label });
  }

  /**
   * Returns the slot option button that contains the given start time string
   * (e.g. '19:00'). Uses CSS class because the button's accessible name includes
   * court and format text, making role+name matching fragile.
   * TODO: replace with getByTestId once data-testid="tournament-slot-option" is added.
   */
  slotButton(time: string): Locator {
    return this.page.locator('.slot-option').filter({ hasText: time }).first();
  }

  /**
   * Returns the <strong> element inside the "partidos" metric card showing how
   * many matches the current round-robin config requires.
   * TODO: replace with data-testid="tournament-metric-matches" once added.
   */
  requiredMatchesMetric(): Locator {
    return this.page.locator('.metric').filter({ hasText: 'partidos' }).locator('strong');
  }

  /**
   * Returns the <strong> element inside the "horarios faltan" metric card.
   * TODO: replace with data-testid="tournament-metric-remaining" once added.
   */
  remainingSlotsMetric(): Locator {
    return this.page.locator('.metric').filter({ hasText: 'horarios faltan' }).locator('strong');
  }

  async goto(): Promise<void> {
    await this.page.goto(TORNEOS_CREAR_URL);
    await expect(this.heading).toBeVisible();
    // Switch from the default "Modo automático" (wizard) tab to "Modo clásico
    // (horarios)" so the legacy CreateTournamentFlow this PO drives becomes visible.
    // The tab-switch handler is an inline Astro <script>; retry until #panel-legacy
    // is shown in case the click lands before the listener is attached.
    await expect(this.legacyTab).toBeVisible({ timeout: 15_000 });
    await expect(async () => {
      await this.legacyTab.click({ timeout: 1_000 });
      await expect(this.nameInput).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 15_000, intervals: [200, 500, 1000] });
  }

  /**
   * Waits for the client-side slot fetch to complete. Either slot buttons or
   * the "no hay horarios" empty state must become visible.
   */
  async waitForSlotsLoaded(): Promise<void> {
    await expect(
      this.page.locator('.slot-option').or(this.emptySlotMessage),
    ).toBeVisible({ timeout: 10_000 });
  }

  /**
   * Sets the teams count input to the given value using triple-click + pressSequentially.
   *
   * Decision Context:
   * - locator.fill() on a React-controlled <input type="number"> can race with React's
   *   reconciler: fill dispatches a synthetic input event but React may not commit the
   *   new state before a concurrent re-render (e.g., slot-fetch completion) overwrites the
   *   DOM value. Triple-click selects all existing text and pressSequentially fires real
   *   keydown/keyup/input events per character, giving React's event system time to process
   *   each one before the next character arrives.
   * - Previously fixed bugs: fill('2') silently failed in tests that called
   *   mockCreateTournament() before goto() — the input showed the old value in screenshots.
   */
  async setTeamsCount(count: number): Promise<void> {
    await this.teamsCountInput.click({ clickCount: 3 });
    await this.teamsCountInput.pressSequentially(String(count));
    await this.teamsCountInput.blur();
  }
}
