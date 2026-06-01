import { expect, type Locator, type Page } from '@playwright/test';
import { FRONTEND_URL } from '../constants';

/**
 * Page Object for /panel-club/horarios (club slot management — SlotManager island).
 *
 * Decision Context:
 * - The page SSR-prefetches `myClubSlots` server-side and hydrates SlotManager with
 *   `client:load`. The slot rows therefore come from the REAL backend (the clubAdmin
 *   seed), and `page.route()` CANNOT intercept that initial fetch. What IS interceptable
 *   are the browser-issued mutations/queries that fire AFTER hydration — toggleSlotBlock,
 *   bulkBlockSlots and slotAuditLog all POST to `/api/graphql-auth`. Specs mock those at
 *   the browser boundary to stay deterministic regardless of seed contents.
 * - Why the LIST view (not calendar) for row actions: the calendar is week-bound and a
 *   seeded slot can fall on a "past day" of the current week (see
 *   horarios-calendar-overlap.spec.ts). The list view renders ALL active slots regardless
 *   of date, so "the first blockable row" is always present and clickable.
 * - Selectors prefer accessible names: the list-view action buttons expose their intent via
 *   `title` ("Editar"/"Bloquear"/"Desbloquear"), the modal tabs and the confirm dialog use
 *   visible button text, and the audit entries use the stable `.history-entry` class owned
 *   by SlotHistoryTab.
 * - Previously fixed bugs this PO exercises (see slot-management.spec.ts):
 *   · single-slot block-with-match sent bulkBlockSlots with an EMPTY slotIds array;
 *   · the audit Historial tab queried the unauthenticated /api/graphql proxy and 401'd;
 *   · impact-preview matchDetails.participantCount was hardcoded to 0.
 */
export class HorariosPage {
  readonly page: Page;
  readonly url = `${FRONTEND_URL}/panel-club/horarios`;
  readonly heading: Locator;
  readonly listViewButton: Locator;
  readonly calendarViewButton: Locator;
  readonly slotTable: Locator;
  /** Per-row "Bloquear" (Lock) buttons in the list view — active, unblocked slots only. */
  readonly rowBlockButtons: Locator;
  /** Per-row "Editar" (Pencil) buttons in the list view. */
  readonly rowEditButtons: Locator;

  // Bulk/confirm dialog (BulkBlockDialog) — reused for the single-slot force path.
  readonly blockDialog: Locator;
  readonly dialogConfirmCheckbox: Locator;
  readonly dialogForceConfirmButton: Locator;

  // Slot detail modal (SlotEditModal) tabs + history.
  readonly historyTabButton: Locator;
  readonly historyEntries: Locator;
  readonly historyError: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { name: /^horarios$/i });
    this.listViewButton = page.getByRole('button', { name: /^lista$/i });
    this.calendarViewButton = page.getByRole('button', { name: /^calendario$/i });
    this.slotTable = page.locator('.slot-table');
    // exact: true so "Bloquear" does not also match the "Desbloquear" buttons of
    // already-blocked rows (substring matching would catch both).
    this.rowBlockButtons = this.slotTable.getByRole('button', { name: 'Bloquear', exact: true });
    this.rowEditButtons = this.slotTable.getByRole('button', { name: 'Editar', exact: true });

    this.blockDialog = page.locator('.modal-box--sm');
    this.dialogConfirmCheckbox = this.blockDialog.getByRole('checkbox', { name: /confirmo/i });
    this.dialogForceConfirmButton = this.blockDialog.getByRole('button', {
      name: /cancelar matches y bloquear/i,
    });

    this.historyTabButton = page.getByRole('button', { name: /^historial$/i });
    this.historyEntries = page.locator('.history-entry');
    this.historyError = page.getByText(/no se pudo cargar el historial/i);
  }

  async goto(): Promise<void> {
    await this.page.goto(this.url);
    await expect(this.heading).toBeVisible();
    await this.waitForIslandsHydrated();
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

  async switchToList(): Promise<void> {
    await this.listViewButton.click();
    await expect(this.slotTable).toBeVisible();
  }

  /** Clicks the first active+unblocked slot's "Bloquear" button (list view). */
  async blockFirstSlot(): Promise<void> {
    await expect(this.rowBlockButtons.first()).toBeVisible();
    await this.rowBlockButtons.first().click();
  }

  /** Opens the detail modal for the first slot row via its "Editar" button. */
  async openFirstSlotDetail(): Promise<void> {
    await expect(this.rowEditButtons.first()).toBeVisible();
    await this.rowEditButtons.first().click();
  }

  /** Opens the Historial tab inside an already-open slot detail modal. */
  async openHistoryTab(): Promise<void> {
    await this.historyTabButton.click();
  }

  /** Checks the confirmation box and clicks "Cancelar matches y bloquear". */
  async confirmForceBlock(): Promise<void> {
    await expect(this.blockDialog).toBeVisible();
    await this.dialogConfirmCheckbox.check();
    await expect(this.dialogForceConfirmButton).toBeEnabled();
    await this.dialogForceConfirmButton.click();
  }

  /** The "N jugador(es)" text rendered per affected match in the impact preview. */
  playersPerMatch(count: number): Locator {
    return this.blockDialog.getByText(new RegExp(`${count}\\s+jugador\\(es\\)`));
  }
}
