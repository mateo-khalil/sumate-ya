import { expect, type Locator, type Page } from '@playwright/test';
import { FRONTEND_URL } from '../constants';

/**
 * Page Object for /panel-club/crear-partido — the ClubMatchWizard (3 steps).
 *
 * Decision Context:
 * - The page is SSR but does NOT pre-fetch slots: AvailableSlotsPicker fetches
 *   the AvailableSlotsForClubMatch query browser-side on mount. That means
 *   `page.route('**\/api/graphql-auth**')` CAN intercept it (unlike the player
 *   create-match flow, where the slot list is server-rendered). Specs install
 *   the mock BEFORE goto() so the mount fetch is captured.
 * - Step 1 slot grid: AvailableSlotsPicker renders CalendarGrid. A clickable
 *   cell is a `role="button"` whose accessible name is
 *   `${courtName} ${startTime}–${endTime} el ${date}` (see AvailableSlotsPicker
 *   renderCell ariaLabel). `selectFirstAvailableSlot()` clicks the first such
 *   button, which is the only reliable, user-facing handle on the cell.
 * - Hydration: the wizard is a `client:load` island. We wait for Astro's
 *   `client-render-time` marker before interacting, mirroring ClubDashboardPage —
 *   an early click on the calendar cell is a no-op before React owns it.
 * - The capacity field is a number input wired to `<label for="capacity">`, so
 *   we target it by the "Capacidad" accessible label (role=spinbutton). The
 *   −/+ steppers carry a U+2212 minus and a plus; we match them by exact text.
 * - Success screen, error banner, format buttons, and the auto-enroll toggle are
 *   all addressed by role/label/text to keep the contract user-facing.
 * - Previously fixed bugs: none relevant (new feature).
 *
 * Mocking assumptions (owned by the spec, restated for context):
 * - Mocked occurrences MUST land on a future date inside the current Mon–Sun
 *   week or the grid won't render a clickable cell — see buildClubSlotOccurrence.
 */
export class ClubMatchWizardPage {
  readonly page: Page;

  // Shell / steps
  readonly card: Locator;
  readonly stepIndicator: Locator;
  readonly step1Title: Locator;
  readonly step2Title: Locator;
  readonly step3Title: Locator;

  // Navigation
  readonly nextButton: Locator;
  readonly backButton: Locator;

  // Step 2 controls
  readonly capacityInput: Locator;
  readonly capacityDecrement: Locator;
  readonly capacityIncrement: Locator;
  readonly descriptionInput: Locator;
  readonly autoEnrollToggle: Locator;

  // Step 3 confirm + submit
  readonly confirmCard: Locator;
  readonly clubBadge: Locator;
  readonly submitButton: Locator;
  readonly errorBanner: Locator;

  // Success screen
  readonly successTitle: Locator;
  readonly viewMatchLink: Locator;
  readonly createAnotherButton: Locator;
  readonly dashboardLink: Locator;

  constructor(page: Page) {
    this.page = page;

    this.card = page.locator('.wizard-card');
    this.stepIndicator = page.locator('.steps');
    this.step1Title = page.getByRole('heading', { name: /seleccioná un horario disponible/i });
    this.step2Title = page.getByRole('heading', { name: /configurá el partido/i });
    this.step3Title = page.getByRole('heading', { name: /confirmar partido/i });

    // Exact names: the picker's week-nav button is "Semana siguiente", which a
    // loose /siguiente/i would also match (strict-mode violation). The wizard's
    // own nav buttons are exactly "Siguiente" / "Volver".
    this.nextButton = page.getByRole('button', { name: /^siguiente$/i });
    this.backButton = page.getByRole('button', { name: /^volver$/i });

    this.capacityInput = page.getByRole('spinbutton', { name: /capacidad/i });
    // U+2212 minus glyph on the decrement button; '+' on the increment button.
    this.capacityDecrement = page.getByRole('button', { name: '−' });
    this.capacityIncrement = page.getByRole('button', { name: '+' });
    this.descriptionInput = page.getByLabel(/descripción/i);
    this.autoEnrollToggle = page.getByRole('checkbox', { name: /inscribirme como jugador/i });

    this.confirmCard = page.locator('.confirm-card');
    this.clubBadge = page.locator('.club-badge-preview');
    this.submitButton = page.getByRole('button', { name: /^crear partido$/i });
    this.errorBanner = page.getByRole('alert');

    this.successTitle = page.getByRole('heading', { name: /^partido creado$/i });
    this.viewMatchLink = page.getByRole('link', { name: /ver detalle del partido/i });
    this.createAnotherButton = page.getByRole('button', { name: /crear otro partido/i });
    this.dashboardLink = page.getByRole('link', { name: /ir al dashboard/i });
  }

  async goto(): Promise<void> {
    await this.page.goto(`${FRONTEND_URL}/panel-club/crear-partido`);
    await expect(this.card).toBeVisible();
    await this.waitForIslandsHydrated();
  }

  /** Astro stamps `client-render-time` on each `client:load` island after hydration. */
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

  /** True when the StepIndicator marks step `n` as active. */
  async expectActiveStep(n: 1 | 2 | 3): Promise<void> {
    await expect(this.stepIndicator.locator('.step.active .step-label')).toHaveText(
      n === 1 ? /horario/i : n === 2 ? /detalles/i : /confirmar/i,
    );
  }

  /** All currently clickable slot cells (role=button with the "… el YYYY-MM-DD" label). */
  slotCells(): Locator {
    return this.page.getByRole('button', { name: /\bel \d{4}-\d{2}-\d{2}$/ });
  }

  /** Select the first available (clickable) slot occurrence in the visible week. */
  async selectFirstAvailableSlot(): Promise<void> {
    const first = this.slotCells().first();
    await expect(first).toBeVisible();
    await first.click();
  }

  async goToStep2(): Promise<void> {
    await expect(this.nextButton).toBeEnabled();
    await this.nextButton.click();
    await expect(this.step2Title).toBeVisible();
  }

  /** From step 2, advance to the confirmation step. */
  async goToStep3(): Promise<void> {
    await this.nextButton.click();
    await expect(this.step3Title).toBeVisible();
  }

  formatButton(label: '5 vs 5' | '7 vs 7' | '10 vs 10' | '11 vs 11'): Locator {
    return this.page.getByRole('button', { name: new RegExp(`^${label.replace(/ /g, '\\s')}`, 'i') });
  }

  async chooseFormat(label: '5 vs 5' | '7 vs 7' | '10 vs 10' | '11 vs 11'): Promise<void> {
    await this.formatButton(label).click();
  }

  async readCapacity(): Promise<string> {
    return this.capacityInput.inputValue();
  }

  async fillDescription(text: string): Promise<void> {
    await this.descriptionInput.fill(text);
  }

  async toggleAutoEnroll(): Promise<void> {
    await this.autoEnrollToggle.click();
  }

  /** A confirm-card row by its label, e.g. confirmRow('Formato'). */
  confirmRow(label: string): Locator {
    return this.confirmCard.locator('.confirm-row', { hasText: label });
  }

  async submit(): Promise<void> {
    await this.submitButton.click();
  }

  async expectSuccessScreen(): Promise<void> {
    await expect(this.successTitle).toBeVisible();
    await expect(this.viewMatchLink).toBeVisible();
  }
}
