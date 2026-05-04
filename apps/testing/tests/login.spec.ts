import { expect, FRONTEND_URL, test, TEST_USERS } from './support';

/**
 * Tests E2E del flujo de login (/login).
 *
 * Decision Context:
 * - Por qué este spec NO usa `test.use({ storageState })`: estamos validando el
 *   flujo de login en sí. Cualquier saved-state nos saltearía la página que
 *   queremos probar.
 * - Por qué la mayoría NO mockea: login.astro es SSR y el POST se procesa en el
 *   servidor de Astro, que llama al backend Express via `loginWithBackend()`.
 *   `page.route()` no intercepta esas requests; el playwright.config arranca
 *   `npm run dev` (turbo) antes de la suite, así que el backend siempre está
 *   disponible.
 * - Lo que validamos del role-based redirect: que después del POST exitoso, la URL
 *   final sea `/partidos` para player y `/panel-club` para club_admin (ver
 *   getRoleRedirect en lib/auth.ts).
 * - Previously fixed bugs: none relevant.
 */

const { playerMateo: PLAYER, clubAdmin: CLUB } = TEST_USERS;

test.describe('Login (/login) — render y estructura', () => {
  test('renderiza el header con el branding y el subtítulo', async ({ loginPage, page }) => {
    await loginPage.goto();

    await expect(page).toHaveTitle(/Iniciar sesión — Sumate Ya/);
    await expect(page.getByRole('heading', { name: /SUMATE YA/i })).toBeVisible();
    await expect(page.getByText(/Iniciá sesión para continuar/i)).toBeVisible();
  });

  test('muestra los campos de email y contraseña con sus tipos correctos', async ({
    loginPage,
    page,
  }) => {
    await loginPage.goto();

    await expect(loginPage.emailInput).toBeVisible();
    await expect(loginPage.passwordInput).toBeVisible();

    // type=email habilita validación nativa del browser; type=password oculta el valor.
    await expect(page.locator('input#email')).toHaveAttribute('type', 'email');
    await expect(page.locator('input#password')).toHaveAttribute('type', 'password');

    // autocomplete correcto — habilita el password manager del browser.
    await expect(page.locator('input#email')).toHaveAttribute('autocomplete', 'email');
    await expect(page.locator('input#password')).toHaveAttribute(
      'autocomplete',
      'current-password',
    );
  });

  test('el form usa POST y tiene el botón "INGRESAR"', async ({ loginPage }) => {
    await loginPage.goto();

    await expect(loginPage.form).toHaveAttribute('method', /post/i);
    await expect(loginPage.submitButton).toBeVisible();
  });

  test('muestra los links a registro de club y de jugador', async ({ loginPage, page }) => {
    await loginPage.goto();

    const clubLink = page.getByRole('link', { name: /Registrate acá/i }).first();
    const playerLink = page.getByRole('link', { name: /Registrate acá/i }).nth(1);

    await expect(clubLink).toHaveAttribute('href', '/registro-club');
    await expect(playerLink).toHaveAttribute('href', '/registro-jugador');
  });

  test('al venir desde registro exitoso muestra el banner de éxito', async ({ loginPage }) => {
    await loginPage.goto('registered=1');

    await expect(loginPage.registeredBanner).toBeVisible();
  });

  test('por defecto (sin query param) NO muestra el banner de éxito', async ({ loginPage }) => {
    await loginPage.goto();

    await expect(loginPage.registeredBanner).not.toBeVisible();
  });
});

test.describe('Login — validación y errores (requiere backend)', () => {
  test('submit con campos vacíos → mensaje "Completá todos los campos"', async ({
    loginPage,
    page,
  }) => {
    await loginPage.goto();
    await loginPage.submit();

    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText(/Completá todos los campos/i)).toBeVisible();
  });

  test('credenciales inválidas → mensaje genérico "Email o contraseña incorrectos"', async ({
    loginPage,
    page,
  }) => {
    await loginPage.goto();
    await loginPage.fillCredentials('noexiste@example.test', 'contraseña-incorrecta-123');
    await loginPage.submit();

    // Mensaje genérico — no debe revelar si el email existe (anti enumeration).
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText(/Email o contraseña incorrectos/i)).toBeVisible();
  });

  test('después de un error fallido, el campo email retiene el valor (UX)', async ({
    loginPage,
  }) => {
    await loginPage.goto();
    const email = 'tester@example.test';
    await loginPage.fillCredentials(email, 'mal');
    await loginPage.submit();

    // El SSR re-renderiza con `emailValue` para no obligar al usuario a re-tipearlo.
    await expect(loginPage.emailInput).toHaveValue(email);
    // La contraseña, en cambio, NO se retiene (no se hace eco de credenciales).
    await expect(loginPage.passwordInput).toHaveValue('');
  });
});

test.describe('Login — redirect por rol (requiere backend + credenciales válidas)', () => {
  test('login exitoso como player → redirige a /partidos', async ({ loginPage, page }) => {
    await loginPage.loginAs(PLAYER);

    await expect(page).toHaveURL(/\/partidos/);
  });

  test('login exitoso como club_admin → redirige a /panel-club', async ({ loginPage, page }) => {
    await loginPage.loginAs(CLUB);

    await expect(page).toHaveURL(/\/panel-club/);
  });

  test('sesión persiste tras refresh de la página', async ({ loginPage, page }) => {
    await loginPage.loginAs(PLAYER);

    // Reload — la cookie HttpOnly debe mantener la sesión.
    await page.reload();
    await expect(page).toHaveURL(/\/partidos/);

    // Re-visitar /login con sesión activa debe redirigir al home del rol.
    await page.goto(`${FRONTEND_URL}/login`);
    await expect(page).toHaveURL(/\/partidos/);
  });

  test('player intentando entrar a /panel-club → es rebotado a /partidos', async ({
    loginPage,
    page,
  }) => {
    await loginPage.loginAs(PLAYER);

    await page.goto(`${FRONTEND_URL}/panel-club`);
    await expect(page).toHaveURL(/\/partidos/);
  });

  test('club_admin intentando entrar a /partidos/crear → es rebotado a /panel-club', async ({
    loginPage,
    page,
  }) => {
    await loginPage.loginAs(CLUB);

    await page.goto(`${FRONTEND_URL}/partidos/crear`);
    await expect(page).toHaveURL(/\/panel-club/);
  });
});
