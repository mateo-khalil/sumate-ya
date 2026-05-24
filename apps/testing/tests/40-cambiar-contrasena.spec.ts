/**
 * Tests E2E — US #40 Cambiar contraseña (/ajustes → Seguridad).
 *
 * Decision Context:
 * - /ajustes is SSR with `prerender = false` and the password form is a React island
 *   (`client:load`). All form interaction tests wait for hydration via
 *   ChangePasswordPage.goto() (which calls waitForIslandsHydrated) before clicking
 *   submit — otherwise the native form submit fires and onSubmit's preventDefault
 *   never runs.
 * - Mocking strategy:
 *     · UI behaviour tests (success toast, inline error, loading state, validation):
 *       ALWAYS mock POST /api/auth/change-password. The seeded user
 *       (mateoduran2010@gmail.com / Hola1234) would otherwise have its real Supabase
 *       password changed and break every other authenticated spec in the suite.
 *     · Backend contract tests: hit the real backend with `request` (no browser),
 *       sending intentionally-bad bodies. The backend is not mutated because every
 *       bad input is rejected by Zod before authService.changePassword is called.
 *     · "Wrong current password" is also mocked at the UI layer (we assert the
 *       inline error) AND exercised at the API layer with a real wrong password
 *       (we assert the 400 + errors.currentPassword shape).
 * - Auth posture: every test runs with `playerMateo` storage state EXCEPT the
 *   middleware-redirect test (anonymous context) and the API-401 test (no token
 *   header). This mirrors the convention used in privacy-settings.spec.ts.
 * - Seed: no DB seed is required. The test user already exists in the dev DB and
 *   the password is not mutated by any test thanks to mocking.
 * - Coverage scope (avoiding overlap with privacy-settings.spec.ts which also lives
 *   on /ajustes): this spec covers ONLY the Seguridad section + the password change
 *   contract. Privacy switches / preview modal stay in privacy-settings.spec.ts.
 * - Previously fixed bugs: none relevant (new spec).
 */

import {
  AJUSTES_URL,
  AUTH_CHANGE_PASSWORD_URL,
  expect,
  test,
  TEST_USERS,
} from './support';

test.describe('Cambiar contraseña — usuario autenticado', () => {
  test.use({ storageState: TEST_USERS.playerMateo.storageStatePath });

  /* ════════════════════════════════════════════════════════════════════════
     Bloque 1 — Render del formulario y accesibilidad estructural
     ════════════════════════════════════════════════════════════════════════ */
  test.describe('Render y accesibilidad', () => {
    /**
     * Decision Context:
     * - These tests assert the SSR-rendered structure plus React-hydrated form
     *   element presence. No mutation is performed, so no mock is needed.
     */
    test('la página /ajustes muestra la sección "Seguridad" con el formulario hidratado', async ({
      changePasswordPage,
    }) => {
      await changePasswordPage.goto();
      await expect(changePasswordPage.securityHeading, 'El heading h2 "Seguridad" debe ser visible').toBeVisible();
      await expect(changePasswordPage.form, 'El form.password-form debe estar montado').toBeVisible();
    });

    test('el formulario muestra los 3 campos esperados y el botón de envío', async ({ changePasswordPage }) => {
      await changePasswordPage.goto();
      await expect(changePasswordPage.currentPasswordInput, 'Input "Contraseña actual" visible').toBeVisible();
      await expect(changePasswordPage.newPasswordInput, 'Input "Nueva contraseña" visible').toBeVisible();
      await expect(changePasswordPage.confirmPasswordInput, 'Input "Confirmar nueva contraseña" visible').toBeVisible();
      await expect(changePasswordPage.submitButton, 'Botón "Actualizar contraseña" visible').toBeVisible();
      await expect(changePasswordPage.submitButton, 'Botón habilitado por defecto').toBeEnabled();
    });

    test('los inputs son de tipo password (ocultan caracteres)', async ({ changePasswordPage }) => {
      await changePasswordPage.goto();
      await expect(changePasswordPage.currentPasswordInput).toHaveAttribute('type', 'password');
      await expect(changePasswordPage.newPasswordInput).toHaveAttribute('type', 'password');
      await expect(changePasswordPage.confirmPasswordInput).toHaveAttribute('type', 'password');
    });

    test('los inputs declaran autocomplete adecuado para password managers', async ({ changePasswordPage }) => {
      await changePasswordPage.goto();
      // current-password permite al gestor sugerir la actual; new-password evita autocompletar la nueva.
      await expect(changePasswordPage.currentPasswordInput).toHaveAttribute('autocomplete', 'current-password');
      await expect(changePasswordPage.newPasswordInput).toHaveAttribute('autocomplete', 'new-password');
      await expect(changePasswordPage.confirmPasswordInput).toHaveAttribute('autocomplete', 'new-password');
    });

    test('el indicador de fortaleza parte en "Sin ingresar" cuando newPassword está vacío', async ({
      changePasswordPage,
    }) => {
      await changePasswordPage.goto();
      await expect(changePasswordPage.strengthLabel, 'Strength label visible').toBeVisible();
      await expect(changePasswordPage.strengthLabel).toContainText(/sin ingresar/i);
    });
  });

  /* ════════════════════════════════════════════════════════════════════════
     Bloque 2 — Validación cliente (sin tocar el backend)
     ════════════════════════════════════════════════════════════════════════ */
  test.describe('Validación cliente', () => {
    /**
     * Decision Context:
     * - Each test still mocks the endpoint as a safety net: if validation fails to
     *   short-circuit submission, the mock guarantees the seeded password is never
     *   mutated. The payloads array would expose the bug (length > 0 means the
     *   request leaked through the client-side validate()).
     */

    test('submit con campos vacíos muestra los 3 errores inline', async ({ changePasswordPage }) => {
      const { payloads } = await changePasswordPage.mockChangePasswordSuccess();
      await changePasswordPage.goto();
      await changePasswordPage.submit();

      await expect(changePasswordPage.currentPasswordError, 'Error en current-password debe aparecer').toContainText(
        /ingres.+contrase.a actual/i,
      );
      await expect(changePasswordPage.newPasswordError, 'Error en new-password debe aparecer').toContainText(
        /al menos 8 caracteres/i,
      );
      await expect(
        changePasswordPage.confirmPasswordError,
        'Error en confirm-password debe aparecer',
      ).toContainText(/confirm.+nueva contrase.a/i);

      expect(payloads.length, 'No se debe enviar la request si la validación falla').toBe(0);
    });

    test('newPassword con menos de 8 caracteres muestra error inline y no envía la request', async ({
      changePasswordPage,
    }) => {
      const { payloads } = await changePasswordPage.mockChangePasswordSuccess();
      await changePasswordPage.goto();
      await changePasswordPage.fillForm({ current: 'Hola1234', next: 'corta', confirm: 'corta' });
      await changePasswordPage.submit();

      await expect(changePasswordPage.newPasswordError).toContainText(/al menos 8 caracteres/i);
      expect(payloads.length, 'No se debe enviar la request con newPassword < 8').toBe(0);
    });

    test('newPassword igual a currentPassword muestra error "debe ser distinta a la actual"', async ({
      changePasswordPage,
    }) => {
      const { payloads } = await changePasswordPage.mockChangePasswordSuccess();
      await changePasswordPage.goto();
      await changePasswordPage.fillForm({
        current: 'MismaClave123',
        next: 'MismaClave123',
        confirm: 'MismaClave123',
      });
      await changePasswordPage.submit();

      await expect(changePasswordPage.newPasswordError).toContainText(/distinta a la actual/i);
      expect(payloads.length, 'No se debe enviar la request si new === current').toBe(0);
    });

    test('confirmPassword distinto a newPassword muestra "no coinciden"', async ({ changePasswordPage }) => {
      const { payloads } = await changePasswordPage.mockChangePasswordSuccess();
      await changePasswordPage.goto();
      await changePasswordPage.fillForm({
        current: 'Hola1234',
        next: 'NuevaClave123',
        confirm: 'OtraClave123',
      });
      await changePasswordPage.submit();

      await expect(changePasswordPage.confirmPasswordError).toContainText(/no coinciden/i);
      expect(payloads.length, 'No se debe enviar la request si confirm !== new').toBe(0);
    });

    test('al editar un campo con error, el mensaje de ese campo desaparece (limpieza on-change)', async ({
      changePasswordPage,
    }) => {
      await changePasswordPage.mockChangePasswordSuccess();
      await changePasswordPage.goto();
      // Disparar errores
      await changePasswordPage.submit();
      await expect(changePasswordPage.newPasswordError).toBeVisible();
      // Tipear un char en newPassword → el error de ese campo se va, los otros quedan
      await changePasswordPage.newPasswordInput.fill('a');
      await expect(changePasswordPage.newPasswordError).toHaveCount(0);
      await expect(changePasswordPage.currentPasswordError, 'El error de current sigue').toBeVisible();
    });
  });

  /* ════════════════════════════════════════════════════════════════════════
     Bloque 3 — Indicador de fortaleza
     ════════════════════════════════════════════════════════════════════════ */
  test.describe('Indicador de fortaleza', () => {
    /**
     * Decision Context:
     * - The strength score is purely client-side and based on length(>=8) + has
     *   uppercase + has digit + has symbol. Each test types into newPassword and
     *   reads the visible label so refactors of the scoring algorithm fail loudly.
     */

    test('newPassword débil (solo letras minúsculas, sin números) → "Básica"', async ({ changePasswordPage }) => {
      await changePasswordPage.goto();
      await changePasswordPage.newPasswordInput.fill('abcdef');
      await expect(changePasswordPage.strengthLabel).toContainText(/b.sica/i);
    });

    test('newPassword media (≥8 + dígito) → "Media"', async ({ changePasswordPage }) => {
      await changePasswordPage.goto();
      await changePasswordPage.newPasswordInput.fill('hola1234');
      await expect(changePasswordPage.strengthLabel).toContainText(/media/i);
    });

    test('newPassword fuerte (≥8 + mayúscula + dígito + símbolo) → "Fuerte"', async ({ changePasswordPage }) => {
      await changePasswordPage.goto();
      await changePasswordPage.newPasswordInput.fill('Hola1234!');
      await expect(changePasswordPage.strengthLabel).toContainText(/fuerte/i);
    });
  });

  /* ════════════════════════════════════════════════════════════════════════
     Bloque 4 — Submit exitoso (mock)
     ════════════════════════════════════════════════════════════════════════ */
  test.describe('Submit exitoso (mock)', () => {
    /**
     * Decision Context:
     * - The success path is mocked because letting the real backend mutate
     *   Mateo's password breaks every other authenticated spec. The mock returns
     *   200 + a custom message; the test asserts the toast text and that the form
     *   inputs are cleared (INITIAL_VALUES in ChangePasswordForm.tsx).
     */

    test('cambio exitoso muestra toast verde y limpia los campos del formulario', async ({
      changePasswordPage,
    }) => {
      const { payloads } = await changePasswordPage.mockChangePasswordSuccess(
        'Contraseña actualizada correctamente',
      );
      await changePasswordPage.goto();
      await changePasswordPage.fillForm({
        current: 'Hola1234',
        next: 'NuevaClave2026!',
        confirm: 'NuevaClave2026!',
      });
      await changePasswordPage.submit();

      await expect(changePasswordPage.successToast, 'Toast de éxito visible').toBeVisible();
      await expect(changePasswordPage.successToast).toContainText(/actualizada correctamente/i);

      // Los inputs deben quedar vacíos tras el éxito
      await expect(changePasswordPage.currentPasswordInput).toHaveValue('');
      await expect(changePasswordPage.newPasswordInput).toHaveValue('');
      await expect(changePasswordPage.confirmPasswordInput).toHaveValue('');

      // La request salió con el body esperado
      expect(payloads.length, 'Debe haberse enviado exactamente una request').toBe(1);
      expect(payloads[0]).toMatchObject({
        currentPassword: 'Hola1234',
        newPassword: 'NuevaClave2026!',
        confirmPassword: 'NuevaClave2026!',
      });
    });

    test('mientras la request está pendiente, el botón muestra "Actualizando..." y queda deshabilitado', async ({
      changePasswordPage,
    }) => {
      await changePasswordPage.mockChangePasswordSlow(1500);
      await changePasswordPage.goto();
      await changePasswordPage.fillForm({
        current: 'Hola1234',
        next: 'NuevaClave2026!',
        confirm: 'NuevaClave2026!',
      });

      // Disparamos sin await para inspeccionar el estado in-flight
      const clickPromise = changePasswordPage.submit();
      await expect(changePasswordPage.submitButton, 'Botón muestra "Actualizando..."').toContainText(
        /actualizando/i,
      );
      await expect(changePasswordPage.submitButton, 'Botón queda disabled').toBeDisabled();
      await expect(changePasswordPage.submitButton).toHaveAttribute('aria-busy', 'true');
      await clickPromise;
      await expect(changePasswordPage.submitButton, 'Tras resolver, vuelve a estar habilitado').toBeEnabled();
    });
  });

  /* ════════════════════════════════════════════════════════════════════════
     Bloque 5 — Errores devueltos por el backend (mock)
     ════════════════════════════════════════════════════════════════════════ */
  test.describe('Errores del backend (mock)', () => {
    /**
     * Decision Context:
     * - These tests assert how the React island renders backend errors. Mocking
     *   gives us deterministic 400/401 / network-failure responses without
     *   coupling to live Supabase behaviour.
     */

    test('400 con errors.currentPassword pinta el error inline en el campo actual', async ({
      changePasswordPage,
    }) => {
      await changePasswordPage.mockChangePasswordFailure({
        status: 400,
        message: 'Datos inválidos',
        errors: { currentPassword: 'La contraseña actual no es correcta' },
      });
      await changePasswordPage.goto();
      await changePasswordPage.fillForm({
        current: 'PasswordIncorrecto',
        next: 'NuevaClave2026!',
        confirm: 'NuevaClave2026!',
      });
      await changePasswordPage.submit();

      await expect(changePasswordPage.currentPasswordError, 'Error inline en currentPassword').toContainText(
        /no es correcta/i,
      );
      await expect(changePasswordPage.errorToast, 'También aparece el toast de error').toBeVisible();
    });

    test('401 (sesión inválida) muestra toast rojo con el mensaje del backend', async ({
      changePasswordPage,
    }) => {
      await changePasswordPage.mockChangePasswordFailure({
        status: 401,
        message: 'Sesión inválida. Iniciá sesión nuevamente.',
      });
      await changePasswordPage.goto();
      await changePasswordPage.fillForm({
        current: 'Hola1234',
        next: 'NuevaClave2026!',
        confirm: 'NuevaClave2026!',
      });
      await changePasswordPage.submit();

      await expect(changePasswordPage.errorToast).toBeVisible();
      await expect(changePasswordPage.errorToast).toContainText(/sesi.n inv.lida/i);
    });

    test('falla de red (request abortada) muestra toast "Error de red. Intentá de nuevo."', async ({
      changePasswordPage,
    }) => {
      await changePasswordPage.mockChangePasswordNetworkError();
      await changePasswordPage.goto();
      await changePasswordPage.fillForm({
        current: 'Hola1234',
        next: 'NuevaClave2026!',
        confirm: 'NuevaClave2026!',
      });
      await changePasswordPage.submit();

      await expect(changePasswordPage.errorToast).toBeVisible();
      await expect(changePasswordPage.errorToast).toContainText(/error de red/i);
    });

    test('tras un error, los inputs conservan su valor para que el usuario corrija', async ({
      changePasswordPage,
    }) => {
      await changePasswordPage.mockChangePasswordFailure({
        status: 400,
        message: 'Datos inválidos',
        errors: { currentPassword: 'La contraseña actual no es correcta' },
      });
      await changePasswordPage.goto();
      await changePasswordPage.fillForm({
        current: 'malo',
        next: 'NuevaClave2026!',
        confirm: 'NuevaClave2026!',
      });
      await changePasswordPage.submit();
      await expect(changePasswordPage.errorToast).toBeVisible();

      // Los valores no deben limpiarse — sólo se limpian tras éxito (ver Bloque 4)
      await expect(changePasswordPage.currentPasswordInput).toHaveValue('malo');
      await expect(changePasswordPage.newPasswordInput).toHaveValue('NuevaClave2026!');
      await expect(changePasswordPage.confirmPasswordInput).toHaveValue('NuevaClave2026!');
    });
  });

  /* ════════════════════════════════════════════════════════════════════════
     Bloque 6 — Responsive (mobile)
     ════════════════════════════════════════════════════════════════════════ */
  test.describe('Responsive', () => {
    /**
     * Decision Context:
     * - Below 768px (.password-form @media query in ChangePasswordForm.tsx) the
     *   sidebar collapses to a horizontal scroll bar and the submit button takes
     *   100% width. We assert no horizontal page overflow and that the submit
     *   button is still actionable on a 375x812 viewport.
     */

    test('en mobile 375px el formulario es visible y no introduce scroll horizontal', async ({
      changePasswordPage,
      page,
    }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await changePasswordPage.goto();

      const bodyScroll = await page.evaluate(() => document.body.scrollWidth);
      const viewport = await page.evaluate(() => window.innerWidth);
      expect(bodyScroll, 'Sin scroll horizontal en mobile').toBeLessThanOrEqual(viewport + 1);

      await expect(changePasswordPage.submitButton, 'Botón visible en mobile').toBeVisible();
      await expect(changePasswordPage.submitButton, 'Botón habilitado en mobile').toBeEnabled();
    });
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   Bloque 7 — Seguridad: redirect por middleware (sin auth)
   ══════════════════════════════════════════════════════════════════════════ */

test.describe('Seguridad — acceso anónimo', () => {
  /**
   * Decision Context:
   * - /ajustes está en PROTECTED_ROUTES (apps/frontend/src/middleware.ts). Un
   *   visitante sin cookie de sesión debe ser redirigido a /login.
   * - Usamos un browser context fresco sin storage state para evitar heredar
   *   cookies del perfil de Chrome.
   */

  test('visitante anónimo es redirigido a /login al intentar abrir /ajustes', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await ctx.newPage();
    try {
      await page.goto(AJUSTES_URL);
      await expect(page, 'La URL debe terminar en /login').toHaveURL(/\/login(\?|$)/, { timeout: 15_000 });
    } finally {
      await ctx.close();
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   Bloque 8 — Contrato del backend (sin browser, vía APIRequestContext)
   ══════════════════════════════════════════════════════════════════════════ */

test.describe('Contrato POST /api/auth/change-password', () => {
  /**
   * Decision Context:
   * - Estos tests pegan directo al backend Express para validar el contrato HTTP
   *   (status codes, shape de errors). El access token de Mateo se obtiene con un
   *   login real (POST /api/auth/login) — no usa la cookie SSR del browser porque
   *   APIRequestContext no comparte storage state del browser.
   * - Todos los bodies enviados son INVÁLIDOS a propósito (faltan campos, son
   *   cortos, no coinciden, currentPassword incorrecto). Eso garantiza que el
   *   backend rechaza antes de tocar Supabase y la password del usuario no cambia.
   */

  /*
   * Decision Context:
   * - El backend Express expone POST /api/auth/login en :4000 con respuesta
   *   `{ accessToken, refreshToken, user }` (ver loginWithBackend en
   *   apps/frontend/src/lib/auth.ts). Usamos esa ruta directa porque
   *   APIRequestContext no carga storage state del browser, así que no hay
   *   cookie pre-existente que reutilizar.
   */
  async function loginAndReadAccessToken(request: import('@playwright/test').APIRequestContext): Promise<string> {
    const resp = await request.post('http://localhost:4000/api/auth/login', {
      data: { email: TEST_USERS.playerMateo.email, password: TEST_USERS.playerMateo.password },
    });
    expect(resp.ok(), `login debe retornar 200 (status real: ${resp.status()})`).toBeTruthy();
    const body = (await resp.json()) as { accessToken?: string };
    expect(body.accessToken, 'login debe devolver accessToken').toBeTruthy();
    return body.accessToken as string;
  }

  test('sin Authorization header → 401 "Missing or malformed token"', async ({ request }) => {
    const resp = await request.post(AUTH_CHANGE_PASSWORD_URL, {
      data: { currentPassword: 'Hola1234', newPassword: 'NuevaClave!', confirmPassword: 'NuevaClave!' },
    });
    expect(resp.status(), 'Debe retornar 401').toBe(401);
    const body = (await resp.json()) as { message?: string };
    expect(body.message ?? '').toMatch(/missing or malformed token/i);
  });

  test('con token válido pero body vacío → 400 con errors en los 3 campos', async ({ request }) => {
    const token = await loginAndReadAccessToken(request);
    const resp = await request.post(AUTH_CHANGE_PASSWORD_URL, {
      headers: { Authorization: `Bearer ${token}` },
      data: {},
    });
    expect(resp.status(), 'Debe retornar 400').toBe(400);
    const body = (await resp.json()) as { errors?: Record<string, string> };
    expect(body.errors, 'Debe incluir errors por campo').toBeTruthy();
    expect(body.errors).toHaveProperty('currentPassword');
    expect(body.errors).toHaveProperty('newPassword');
    expect(body.errors).toHaveProperty('confirmPassword');
  });

  test('newPassword con menos de 8 caracteres → 400 con errors.newPassword', async ({ request }) => {
    const token = await loginAndReadAccessToken(request);
    const resp = await request.post(AUTH_CHANGE_PASSWORD_URL, {
      headers: { Authorization: `Bearer ${token}` },
      data: { currentPassword: 'Hola1234', newPassword: 'corta', confirmPassword: 'corta' },
    });
    expect(resp.status()).toBe(400);
    const body = (await resp.json()) as { errors?: Record<string, string> };
    expect(body.errors?.newPassword ?? '').toMatch(/al menos 8 caracteres/i);
  });

  test('newPassword !== confirmPassword → 400 con errors.confirmPassword', async ({ request }) => {
    const token = await loginAndReadAccessToken(request);
    const resp = await request.post(AUTH_CHANGE_PASSWORD_URL, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        currentPassword: 'Hola1234',
        newPassword: 'NuevaClave2026!',
        confirmPassword: 'OtraClave2026!',
      },
    });
    expect(resp.status()).toBe(400);
    const body = (await resp.json()) as { errors?: Record<string, string> };
    expect(body.errors?.confirmPassword ?? '').toMatch(/no coinciden/i);
  });

  test('newPassword === currentPassword → 400 con errors.newPassword "distinta a la actual"', async ({
    request,
  }) => {
    const token = await loginAndReadAccessToken(request);
    const resp = await request.post(AUTH_CHANGE_PASSWORD_URL, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        currentPassword: 'MismaClave1234',
        newPassword: 'MismaClave1234',
        confirmPassword: 'MismaClave1234',
      },
    });
    expect(resp.status()).toBe(400);
    const body = (await resp.json()) as { errors?: Record<string, string> };
    expect(body.errors?.newPassword ?? '').toMatch(/distinta a la actual/i);
  });

  test('currentPassword incorrecta (Zod ok, Supabase falla) → 400 con errors.currentPassword', async ({
    request,
  }) => {
    const token = await loginAndReadAccessToken(request);
    const resp = await request.post(AUTH_CHANGE_PASSWORD_URL, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        currentPassword: 'PasswordTotalmenteIncorrecto1234',
        newPassword: 'NuevaClaveDistinta2026!',
        confirmPassword: 'NuevaClaveDistinta2026!',
      },
    });
    expect(resp.status(), 'Debe retornar 400 (no 401)').toBe(400);
    const body = (await resp.json()) as { errors?: Record<string, string> };
    expect(body.errors?.currentPassword ?? '', 'Mensaje específico de actual incorrecta').toMatch(
      /actual no es correcta/i,
    );
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   Bloque 9 — Navegación interna al panel de Seguridad
   ══════════════════════════════════════════════════════════════════════════ */

test.describe('Navegación a Seguridad', () => {
  test.use({ storageState: TEST_USERS.playerMateo.storageStatePath });

  /**
   * Decision Context:
   * - El sidebar de /ajustes muestra un link "Seguridad" que apunta a #seguridad.
   *   Hacer click debe mover el foco/scroll a la sección sin recargar la página.
   * - Verificamos que el link existe, que el section#seguridad tiene el id correcto
   *   y que la URL pasa a tener el fragmento #seguridad.
   */

  test('el link "Seguridad" en el sidebar lleva a la sección #seguridad', async ({ page }) => {
    await page.goto(AJUSTES_URL);
    const link = page.getByRole('link', { name: /^seguridad$/i });
    await expect(link, 'Link "Seguridad" visible en el sidebar').toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/#seguridad$/);
    const securitySection = page.locator('section#seguridad');
    await expect(securitySection, 'La sección debe ser visible tras navegar').toBeVisible();
  });
});

