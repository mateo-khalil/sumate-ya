import { expect, RegisterClubPage, test } from './support';

/**
 * Tests E2E del registro de club (/registro-club).
 *
 * Decision Context:
 * - Los tests "render y estructura" no requieren backend; los tests de "submit
 *   inválido" sí, y `playwright.config` arranca `npm run dev` antes de la suite.
 * - El form expone secciones (admin / club) con labels accesibles; usamos
 *   getByLabel via la PO `RegisterClubPage` para evitar selectores frágiles.
 * - Previously fixed bugs: none relevant.
 */

test.describe('Registro de club (/registro-club) — render y estructura', () => {
  test('renderiza el header con el branding y subtítulo', async ({ registerClubPage, page }) => {
    await registerClubPage.goto();

    await expect(page).toHaveTitle(/Registrar Club — Sumate Ya/);
    await expect(page.getByRole('heading', { name: /SUMATE YA/i })).toBeVisible();
    await expect(page.getByText(/Registrá tu club y publicá tus canchas/i)).toBeVisible();
  });

  test('muestra las dos secciones del formulario', async ({ registerClubPage, page }) => {
    await registerClubPage.goto();

    await expect(page.getByText('DATOS DEL ADMINISTRADOR')).toBeVisible();
    await expect(page.getByText('DATOS DEL CLUB')).toBeVisible();
  });

  test('renderiza todos los campos del administrador con sus labels', async ({
    registerClubPage,
    page,
  }) => {
    await registerClubPage.goto();

    await expect(registerClubPage.fullName).toBeVisible();
    await expect(registerClubPage.email).toBeVisible();
    await expect(registerClubPage.password).toBeVisible();
    await expect(registerClubPage.confirmPassword).toBeVisible();

    // Tipos correctos: password debe ser type=password (no leak en DOM como text).
    await expect(page.locator('input#password')).toHaveAttribute('type', 'password');
    await expect(page.locator('input#confirmPassword')).toHaveAttribute('type', 'password');
    await expect(page.locator('input#email')).toHaveAttribute('type', 'email');
  });

  test('renderiza todos los campos del club con sus labels', async ({ registerClubPage }) => {
    await registerClubPage.goto();

    await expect(registerClubPage.clubName).toBeVisible();
    await expect(registerClubPage.address).toBeVisible();
    await expect(registerClubPage.phone).toBeVisible();
  });

  test('los campos de zona, latitud y longitud ya no existen en el form', async ({
    registerClubPage,
    page,
  }) => {
    // Decisión de producto (2026-05-03): zona / lat / lng se sacaron del registro.
    // Las columnas siguen existiendo en DB pero nullable; el form no las pide.
    await registerClubPage.goto();

    await expect(page.locator('input#lat')).toHaveCount(0);
    await expect(page.locator('input#lng')).toHaveCount(0);
    await expect(page.locator('input#zone')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Usar mi ubicación/i })).toHaveCount(0);
  });

  test('el form usa method POST y tiene el botón con copy correcto', async ({
    registerClubPage,
  }) => {
    await registerClubPage.goto();

    await expect(registerClubPage.form).toHaveAttribute('method', /post/i);
    await expect(registerClubPage.submitButton).toBeVisible();
  });

  test('muestra los links a login y a registro de jugador', async ({ registerClubPage, page }) => {
    await registerClubPage.goto();

    const loginLink = page.getByRole('link', { name: /Iniciá sesión/i });
    const playerLink = page.getByRole('link', { name: /Registrate acá/i });

    await expect(loginLink).toHaveAttribute('href', '/login');
    await expect(playerLink).toHaveAttribute('href', '/registro-jugador');
  });

  test('el link a login navega correctamente', async ({ registerClubPage, page }) => {
    await registerClubPage.goto();

    await page.getByRole('link', { name: /Iniciá sesión/i }).click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('el link a registro de jugador navega correctamente', async ({ registerClubPage, page }) => {
    await registerClubPage.goto();

    await page.getByRole('link', { name: /Registrate acá/i }).click();
    await expect(page).toHaveURL(/\/registro-jugador$/);
  });

  test('los inputs aceptan valores y los retienen en el DOM', async ({ registerClubPage }) => {
    await registerClubPage.goto();

    await registerClubPage.fullName.fill('Juan Pérez');
    await registerClubPage.email.fill('juan@miclub.com.uy');
    await registerClubPage.clubName.fill('Club Atletico Sur');
    await registerClubPage.address.fill('Av. 18 de Julio 1234, Montevideo');

    await expect(registerClubPage.fullName).toHaveValue('Juan Pérez');
    await expect(registerClubPage.email).toHaveValue('juan@miclub.com.uy');
    await expect(registerClubPage.clubName).toHaveValue('Club Atletico Sur');
    await expect(registerClubPage.address).toHaveValue('Av. 18 de Julio 1234, Montevideo');
  });
});

/**
 * Tests que requieren el backend Express levantado en :4000.
 * `playwright.config.ts` levanta `npm run dev` (turbo) antes de correr la suite,
 * así que el backend siempre está disponible cuando se ejecutan estos tests.
 */
test.describe('Registro de club — submit con datos inválidos (requiere backend)', () => {
  test('contraseñas que no coinciden → muestra error inline', async ({
    registerClubPage,
    page,
  }) => {
    await registerClubPage.goto();

    await registerClubPage.fullName.fill('Tester QA');
    await registerClubPage.email.fill(RegisterClubPage.uniqueEmail());
    await registerClubPage.password.fill('Password123');
    await registerClubPage.confirmPassword.fill('Otracosa999');
    await registerClubPage.clubName.fill('Club Test QA');
    await registerClubPage.address.fill('Av. 18 de Julio 1234, Montevideo');
    await registerClubPage.phone.fill('+598 2 400 1234');

    await registerClubPage.submitButton.click();

    // El backend (Zod) devuelve 400 con `errors.confirmPassword`. La página se
    // re-renderiza con el span.field-error correspondiente. No debe redirigir a /login.
    await expect(page).toHaveURL(/\/registro-club/);
    await expect(page.getByText(/no coinciden/i)).toBeVisible();
  });

  test('campos vacíos → backend devuelve errores múltiples y se renderizan inline', async ({
    registerClubPage,
    page,
  }) => {
    await registerClubPage.goto();
    await registerClubPage.submitButton.click();

    await expect(page).toHaveURL(/\/registro-club/);
    // Al menos un error inline debe estar visible (Zod requiere todos los campos).
    await expect(page.locator('span.field-error').first()).toBeVisible();
  });
});
