import { expect, type Locator, type Page, type Route } from '@playwright/test';
import { AJUSTES_URL, AUTH_CHANGE_PASSWORD_ROUTE } from '../constants';

/**
 * Page Object for the "Seguridad / Cambiar contraseña" section of /ajustes (US #40).
 *
 * Decision Context:
 * - /ajustes is SSR (`prerender = false`) and the ChangePasswordForm is a React island
 *   mounted with `client:load`. The form's three password inputs are present in the
 *   SSR HTML but the onSubmit handler, error rendering and toast only run after React
 *   hydrates. waitForIslandsHydrated() polls Astro's `client-render-time` marker so
 *   tests do not fill+click before the island is interactive.
 * - The form posts to `${backendUrl}/api/auth/change-password` straight from the
 *   browser (no Astro proxy). page.route() intercepts that URL for UI-behaviour tests
 *   so we never mutate the seeded test user's real Supabase password. Security tests
 *   that DO want to exercise the real backend issue an APIRequestContext POST instead.
 * - Locators use accessible labels and roles to mirror what a real user sees. Field
 *   errors are co-located <span class="field-error"> beside each label; the toast is
 *   a <div role="alert"> at the top of the form.
 * - Previously fixed bugs: none relevant (new PO).
 *
 * TODO for the frontend team — add data-testid attributes to ChangePasswordForm.tsx
 * so this PO can drop class-based fallbacks:
 *   - data-testid="change-password-form"
 *   - data-testid="change-password-current"
 *   - data-testid="change-password-new"
 *   - data-testid="change-password-confirm"
 *   - data-testid="change-password-submit"
 *   - data-testid="change-password-toast"
 *   - data-testid="change-password-strength"
 *   - data-testid="change-password-current-error"
 *   - data-testid="change-password-new-error"
 *   - data-testid="change-password-confirm-error"
 */
export class ChangePasswordPage {
  readonly page: Page;

  /* ── Page chrome ── */
  readonly pageHeading: Locator;
  readonly securitySection: Locator;
  readonly securityHeading: Locator;

  /* ── Form ── */
  readonly form: Locator;
  readonly currentPasswordInput: Locator;
  readonly newPasswordInput: Locator;
  readonly confirmPasswordInput: Locator;
  readonly submitButton: Locator;

  /* ── Feedback ── */
  readonly toast: Locator;
  readonly successToast: Locator;
  readonly errorToast: Locator;
  readonly strengthLabel: Locator;
  readonly currentPasswordError: Locator;
  readonly newPasswordError: Locator;
  readonly confirmPasswordError: Locator;

  constructor(page: Page) {
    this.page = page;

    this.pageHeading = page.getByRole('heading', { name: /^ajustes$/i, level: 1 });
    /*
     * The security section is identified by its id "seguridad" — anchored from the
     * sidebar nav. Scoping locators to this section keeps them stable even if the
     * privacy section is restructured.
     */
    this.securitySection = page.locator('section#seguridad');
    this.securityHeading = this.securitySection.getByRole('heading', {
      name: /seguridad/i,
      level: 2,
    });

    this.form = this.securitySection.locator('form.password-form');
    /*
     * Locator strategy:
     * - The inputs have no `id` attribute, so getByLabel reads the accessible
     *   name from the wrapping <label>. The middle <label> ALSO contains the
     *   strength <span>, so its accessible name is "Nueva contraseña Fortaleza:
     *   Sin ingresar" — getByLabel('Nueva contraseña', { exact: true }) never
     *   matches and the test hangs at .fill().
     * - Fix: scope to `label.field` and filter by the .field-label span text.
     *   Confirm-password disambiguates with hasNotText: /confirmar/i so the
     *   "Nueva contraseña" filter is not accidentally satisfied by the
     *   confirmation field (whose .field-label is "Confirmar nueva contraseña").
     * - Previously fixed bugs: getByLabel timeouts on newPassword because the
     *   <label> wrapped both the input AND the strength indicator span.
     */
    const fields = this.form.locator('label.field');
    this.currentPasswordInput = fields
      .filter({ has: page.locator('span.field-label', { hasText: /^Contraseña actual$/ }) })
      .locator('input[type="password"]');
    this.newPasswordInput = fields
      .filter({ has: page.locator('span.field-label', { hasText: /^Nueva contraseña$/ }) })
      .locator('input[type="password"]');
    this.confirmPasswordInput = fields
      .filter({ has: page.locator('span.field-label', { hasText: /^Confirmar nueva contraseña$/ }) })
      .locator('input[type="password"]');
    this.submitButton = this.form.getByRole('button', { name: /actualizar contrase.a|actualizando/i });

    this.toast = this.form.locator('div.toast');
    this.successToast = this.form.locator('div.toast--success');
    this.errorToast = this.form.locator('div.toast--error');
    this.strengthLabel = this.form.locator('#password-strength');
    this.currentPasswordError = this.form.locator('#current-password-error');
    this.newPasswordError = this.form.locator('#new-password-error');
    this.confirmPasswordError = this.form.locator('#confirm-password-error');
  }

  async goto(): Promise<void> {
    await this.page.goto(AJUSTES_URL);
    await expect(this.pageHeading).toBeVisible({ timeout: 15_000 });
    await this.waitForIslandsHydrated();
    await expect(this.form).toBeVisible({ timeout: 10_000 });
  }

  /**
   * Astro stamps `client-render-time` on every <astro-island client="load"> AFTER
   * React hydration completes. Waiting on it guarantees onSubmit + setState handlers
   * are attached before the test types into inputs or clicks the submit button.
   * Mirrors the pattern used in SettingsPage.waitForIslandsHydrated.
   */
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

  /**
   * Fills the three form inputs. Pass empty strings to leave a field blank — the
   * form treats empty currentPassword/confirmPassword as a validation error, while
   * empty newPassword is caught by the min-length check.
   */
  async fillForm(values: {
    current: string;
    next: string;
    confirm: string;
  }): Promise<void> {
    await this.currentPasswordInput.fill(values.current);
    await this.newPasswordInput.fill(values.next);
    await this.confirmPasswordInput.fill(values.confirm);
  }

  async submit(): Promise<void> {
    await this.submitButton.click();
  }

  /**
   * Mocks POST /api/auth/change-password to return success (200 + custom message).
   * Captures every payload so the test can assert the body the island actually sent.
   * Use whenever a test wants to verify the post-success UI (cleared inputs, toast)
   * WITHOUT changing the seeded user's real Supabase password.
   */
  async mockChangePasswordSuccess(
    message = 'Contraseña actualizada correctamente',
  ): Promise<{ payloads: unknown[] }> {
    const payloads: unknown[] = [];
    await this.page.unroute(AUTH_CHANGE_PASSWORD_ROUTE).catch(() => undefined);
    await this.page.route(AUTH_CHANGE_PASSWORD_ROUTE, async (route: Route) => {
      payloads.push(JSON.parse(route.request().postData() ?? '{}') as unknown);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ message }),
      });
    });
    return { payloads };
  }

  /**
   * Mocks POST /api/auth/change-password to return a structured 400 with optional
   * field-level errors. Mirrors the shape the real backend returns (see
   * authController.changePassword).
   */
  async mockChangePasswordFailure(input: {
    status?: number;
    message?: string;
    errors?: Record<string, string>;
  }): Promise<{ payloads: unknown[] }> {
    const payloads: unknown[] = [];
    const body: Record<string, unknown> = { message: input.message ?? 'Datos inválidos' };
    if (input.errors) body.errors = input.errors;
    await this.page.unroute(AUTH_CHANGE_PASSWORD_ROUTE).catch(() => undefined);
    await this.page.route(AUTH_CHANGE_PASSWORD_ROUTE, async (route: Route) => {
      payloads.push(JSON.parse(route.request().postData() ?? '{}') as unknown);
      await route.fulfill({
        status: input.status ?? 400,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    });
    return { payloads };
  }

  /**
   * Aborts the change-password request with a network error so the test can
   * assert the "Error de red" toast that fires from the catch block.
   */
  async mockChangePasswordNetworkError(): Promise<void> {
    await this.page.unroute(AUTH_CHANGE_PASSWORD_ROUTE).catch(() => undefined);
    await this.page.route(AUTH_CHANGE_PASSWORD_ROUTE, async (route: Route) => {
      await route.abort('failed');
    });
  }

  /**
   * Mocks the request with an artificial delay so the test can assert the
   * "Actualizando..." button state and the disabled flag while the request is
   * in-flight. Resolves after `delayMs` with a 200 response.
   */
  async mockChangePasswordSlow(delayMs: number): Promise<void> {
    await this.page.unroute(AUTH_CHANGE_PASSWORD_ROUTE).catch(() => undefined);
    await this.page.route(AUTH_CHANGE_PASSWORD_ROUTE, async (route: Route) => {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Contraseña actualizada correctamente' }),
      });
    });
  }
}
