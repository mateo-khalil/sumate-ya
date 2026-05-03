import { test, expect } from '@playwright/test';

/**
 * Tests E2E del flujo de login (/login).
 *
 * Decision Context:
 * - Por qué la mayoría NO mockea: login.astro es SSR (`prerender = false`) y el POST se
 *   procesa en el servidor de Astro, que llama al backend Express via `loginWithBackend()`
 *   desde Node. Esa request nunca pasa por el browser, así que `page.route()` no la
 *   intercepta. Los tests se separan en dos grupos:
 *     1. Render + interacción client-side: siempre corren, no requieren nada.
 *     2. Submit real → redirect por rol: requieren backend en :4000 + Supabase
 *        autenticado. `playwright.config.ts` arranca `npm run dev` (turbo) antes de
 *        correr la suite, así que el backend siempre está disponible.
 * - Por qué hardcodeamos los seed users por defecto: los emails y contraseñas de
 *   `lucas@test.com` / `admin@clubsur.com` viven sin cifrar en
 *   `apps/backend/supabase/seed.sql` — no son secretos, son data de bootstrapping para
 *   cualquier dev que levanta el ambiente. Las env vars TEST_PLAYER_EMAIL etc. están
 *   por si alguien corre los tests contra una DB cloud con otros usuarios.
 * - Lo que validamos del role-based redirect: que después del POST exitoso, la URL
 *   final sea `/partidos` para player y `/panel-club` para club_admin (ver getRoleRedirect
 *   en lib/auth.ts).
 * - Assumptions:
 *   * Frontend en :4321 y backend en :4000 (`pnpm dev` en cada uno).
 *   * Para los tests con backend: el .env tiene SUPABASE_ANON_KEY válido y los usuarios
 *     existen en la DB con sus respectivos roles.
 * - Previously fixed bugs: none relevant.
 */

const FRONTEND_URL = 'http://localhost:4321';
const LOGIN_URL = `${FRONTEND_URL}/login`;

// Credenciales por defecto: cuentas de prueba registradas a mano en la cloud DB del
// proyecto, exclusivas para E2E. Los usuarios seed del seed.sql (lucas@test.com etc.)
// no existen en cloud — sólo se aplican al Supabase local. Estas cuentas son
// "throwaway QA accounts": passwords débiles a propósito (corren contra una DB
// de desarrollo, no producción), y commiteadas para que cualquier dev pueda correr
// la suite sin setear env vars.
// Las env vars permiten overridear si alguien corre contra otra DB.
const PLAYER_EMAIL = process.env.TEST_PLAYER_EMAIL ?? 'ricardo@gmail.com';
const PLAYER_PASSWORD = process.env.TEST_PLAYER_PASSWORD ?? 'bbbb1234';
const CLUB_EMAIL = process.env.TEST_CLUB_EMAIL ?? 'frantestsumateya@gmail.com';
const CLUB_PASSWORD = process.env.TEST_CLUB_PASSWORD ?? 'aaaa1234';

async function gotoLogin(page: Page): Promise<void> {
  await page.goto(LOGIN_URL);
  await expect(page.locator('form.login-form')).toBeVisible();
}

test.describe('Login (/login) — render y estructura', () => {
  test('renderiza el header con el branding y el subtítulo', async ({ page }) => {
    await gotoLogin(page);

    await expect(page).toHaveTitle(/Iniciar sesión — Sumate Ya/);
    await expect(page.getByRole('heading', { name: /SUMATE YA/i })).toBeVisible();
    await expect(page.getByText(/Iniciá sesión para continuar/i)).toBeVisible();
  });

  test('muestra los campos de email y contraseña con sus tipos correctos', async ({ page }) => {
    await gotoLogin(page);

    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Contraseña')).toBeVisible();

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

  test('el form usa POST y tiene el botón "INGRESAR"', async ({ page }) => {
    await gotoLogin(page);

    await expect(page.locator('form.login-form')).toHaveAttribute('method', /post/i);
    await expect(page.getByRole('button', { name: 'INGRESAR' })).toBeVisible();
  });

  test('muestra los links a registro de club y de jugador', async ({ page }) => {
    await gotoLogin(page);

    const clubLink = page.getByRole('link', { name: /Registrate acá/i }).first();
    const playerLink = page.getByRole('link', { name: /Registrate acá/i }).nth(1);

    await expect(clubLink).toHaveAttribute('href', '/registro-club');
    await expect(playerLink).toHaveAttribute('href', '/registro-jugador');
  });

  test('al venir desde registro exitoso muestra el banner de éxito', async ({ page }) => {
    // El query param `?registered=1` lo setea registro-club.astro tras crear la cuenta.
    await page.goto(`${LOGIN_URL}?registered=1`);

    await expect(page.getByText(/Registro exitoso\. Ya podés iniciar sesión/i)).toBeVisible();
  });

  test('por defecto (sin query param) NO muestra el banner de éxito', async ({ page }) => {
    await gotoLogin(page);

    await expect(page.getByText(/Registro exitoso/i)).not.toBeVisible();
  });
});

test.describe('Login — validación y errores (requiere backend)', () => {
  test('submit con campos vacíos → mensaje "Completá todos los campos"', async ({ page }) => {
    await gotoLogin(page);

    // novalidate en el form deshabilita la validación HTML5, así que el POST llega al server.
    await page.getByRole('button', { name: 'INGRESAR' }).click();

    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText(/Completá todos los campos/i)).toBeVisible();
  });

  test('credenciales inválidas → mensaje genérico "Email o contraseña incorrectos"', async ({
    page,
  }) => {
    await gotoLogin(page);

    await page.getByLabel('Email').fill('noexiste@example.test');
    await page.getByLabel('Contraseña').fill('contraseña-incorrecta-123');
    await page.getByRole('button', { name: 'INGRESAR' }).click();

    // El mensaje debe ser genérico — no debe revelar si el email existe (anti enumeration).
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText(/Email o contraseña incorrectos/i)).toBeVisible();
  });

  test('después de un error fallido, el campo email retiene el valor (UX)', async ({ page }) => {
    await gotoLogin(page);

    const email = 'tester@example.test';
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Contraseña').fill('mal');
    await page.getByRole('button', { name: 'INGRESAR' }).click();

    // El SSR re-renderiza con `emailValue` para no obligar al usuario a re-tipearlo.
    await expect(page.getByLabel('Email')).toHaveValue(email);
    // La contraseña, en cambio, NO se retiene (no se hace eco de credenciales).
    await expect(page.getByLabel('Contraseña')).toHaveValue('');
  });
});

test.describe('Login — redirect por rol (requiere backend + credenciales válidas)', () => {
  test('login exitoso como player → redirige a /partidos', async ({ page }) => {
    await gotoLogin(page);

    await page.getByLabel('Email').fill(PLAYER_EMAIL);
    await page.getByLabel('Contraseña').fill(PLAYER_PASSWORD);
    await page.getByRole('button', { name: 'INGRESAR' }).click();

    await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 10_000 });
    await expect(page).toHaveURL(/\/partidos/);
  });

  test('login exitoso como club_admin → redirige a /panel-club', async ({ page }) => {
    await gotoLogin(page);

    await page.getByLabel('Email').fill(CLUB_EMAIL);
    await page.getByLabel('Contraseña').fill(CLUB_PASSWORD);
    await page.getByRole('button', { name: 'INGRESAR' }).click();

    await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 10_000 });
    await expect(page).toHaveURL(/\/panel-club/);
  });

  test('sesión persiste tras refresh de la página', async ({ page }) => {
    // Loguearse
    await gotoLogin(page);
    await page.getByLabel('Email').fill(PLAYER_EMAIL);
    await page.getByLabel('Contraseña').fill(PLAYER_PASSWORD);
    await page.getByRole('button', { name: 'INGRESAR' }).click();
    await page.waitForURL(/\/partidos/, { timeout: 10_000 });

    // Reload — la cookie HttpOnly debe mantener la sesión y el middleware no debe rebotar.
    await page.reload();
    await expect(page).toHaveURL(/\/partidos/);

    // Re-visitar /login con sesión activa debe redirigir al home del rol.
    await page.goto(LOGIN_URL);
    await expect(page).toHaveURL(/\/partidos/);
  });

  test('player intentando entrar a /panel-club → es rebotado a /partidos', async ({ page }) => {
    // Login como player primero.
    await gotoLogin(page);
    await page.getByLabel('Email').fill(PLAYER_EMAIL);
    await page.getByLabel('Contraseña').fill(PLAYER_PASSWORD);
    await page.getByRole('button', { name: 'INGRESAR' }).click();
    await page.waitForURL(/\/partidos/, { timeout: 10_000 });

    // Intentar entrar a la ruta exclusiva del club_admin.
    // El middleware (ROLE_RESTRICTED) debe rebotarlo via getRoleRedirect.
    await page.goto(`${FRONTEND_URL}/panel-club`);
    await expect(page).toHaveURL(/\/partidos/);
  });

  test('club_admin intentando entrar a /partidos/crear → es rebotado a /panel-club', async ({
    page,
  }) => {
    await gotoLogin(page);
    await page.getByLabel('Email').fill(CLUB_EMAIL);
    await page.getByLabel('Contraseña').fill(CLUB_PASSWORD);
    await page.getByRole('button', { name: 'INGRESAR' }).click();
    await page.waitForURL(/\/panel-club/, { timeout: 10_000 });

    // /partidos/crear es player-only en ROLE_RESTRICTED → debe rebotar al home del rol.
    await page.goto(`${FRONTEND_URL}/partidos/crear`);
    await expect(page).toHaveURL(/\/panel-club/);
  });
});
