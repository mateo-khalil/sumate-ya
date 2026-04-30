import { test, expect, type Page } from '@playwright/test';


const FRONTEND_URL = 'http://localhost:4321';
const REGISTRO_URL = `${FRONTEND_URL}/registro-club`;

const SKIP_BACKEND = process.env.SKIP_BACKEND_TESTS === '1';

/**
 * Genera un email único por corrida para evitar colisiones cuando el test de POST
 * efectivamente llega al backend (aunque esperamos un 400 por contraseñas que no
 * coinciden, igual queremos minimizar side-effects si la validación cambia).
 */
function uniqueEmail(): string {
  return `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
}

async function gotoRegistro(page: Page): Promise<void> {
  await page.goto(REGISTRO_URL);
  // Esperar a que el form esté presente — confirma que la SSR no nos redirigió.
  await expect(page.locator('form.reg-form')).toBeVisible();
}

test.describe('Registro de club (/registro-club) — render y estructura', () => {
  test('renderiza el header con el branding y subtítulo', async ({ page }) => {
    await gotoRegistro(page);

    await expect(page).toHaveTitle(/Registrar Club — Sumate Ya/);
    await expect(page.getByRole('heading', { name: /SUMATE YA/i })).toBeVisible();
    await expect(page.getByText(/Registrá tu club y publicá tus canchas/i)).toBeVisible();
  });

  test('muestra las dos secciones del formulario', async ({ page }) => {
    await gotoRegistro(page);

    await expect(page.getByText('DATOS DEL ADMINISTRADOR')).toBeVisible();
    await expect(page.getByText('DATOS DEL CLUB')).toBeVisible();
  });

  test('renderiza todos los campos del administrador con sus labels', async ({ page }) => {
    await gotoRegistro(page);

    // Labels asociados por `for=` → `getByLabel` matchea por el atributo accesible.
    await expect(page.getByLabel('Nombre completo')).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Contraseña', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Confirmar contraseña')).toBeVisible();

    // Tipos correctos: password debe ser type=password (no leak en DOM como text).
    await expect(page.locator('input#password')).toHaveAttribute('type', 'password');
    await expect(page.locator('input#confirmPassword')).toHaveAttribute('type', 'password');
    await expect(page.locator('input#email')).toHaveAttribute('type', 'email');
  });

  test('renderiza todos los campos del club con sus labels', async ({ page }) => {
    await gotoRegistro(page);

    await expect(page.getByLabel('Nombre del club')).toBeVisible();
    await expect(page.getByLabel('Dirección')).toBeVisible();
    await expect(page.getByLabel('Zona')).toBeVisible();
    await expect(page.getByLabel('Teléfono')).toBeVisible();
    await expect(page.getByLabel(/Latitud/)).toBeVisible();
    await expect(page.getByLabel(/Longitud/)).toBeVisible();
  });

  test('marca latitud y longitud como opcionales', async ({ page }) => {
    await gotoRegistro(page);

    // Hay exactamente 2 marcadores "(opcional)" — uno por cada coordenada.
    await expect(page.locator('span.optional')).toHaveCount(2);
    // Son inputs numéricos (step=any para permitir decimales).
    await expect(page.locator('input#lat')).toHaveAttribute('type', 'number');
    await expect(page.locator('input#lng')).toHaveAttribute('type', 'number');
  });

  test('el form usa method POST y tiene el botón de submit con el copy correcto', async ({ page }) => {
    await gotoRegistro(page);

    await expect(page.locator('form.reg-form')).toHaveAttribute('method', /post/i);
    await expect(page.getByRole('button', { name: 'REGISTRAR CLUB' })).toBeVisible();
  });

  test('muestra los links a login y a registro de jugador', async ({ page }) => {
    await gotoRegistro(page);

    const loginLink = page.getByRole('link', { name: /Iniciá sesión/i });
    const playerLink = page.getByRole('link', { name: /Registrate acá/i });

    await expect(loginLink).toBeVisible();
    await expect(loginLink).toHaveAttribute('href', '/login');

    await expect(playerLink).toBeVisible();
    await expect(playerLink).toHaveAttribute('href', '/registro-jugador');
  });

  test('el link a login navega correctamente', async ({ page }) => {
    await gotoRegistro(page);

    await page.getByRole('link', { name: /Iniciá sesión/i }).click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('el link a registro de jugador navega correctamente', async ({ page }) => {
    await gotoRegistro(page);

    await page.getByRole('link', { name: /Registrate acá/i }).click();
    await expect(page).toHaveURL(/\/registro-jugador$/);
  });

  test('los inputs aceptan valores y los retienen en el DOM', async ({ page }) => {
    await gotoRegistro(page);

    await page.getByLabel('Nombre completo').fill('Juan Pérez');
    await page.getByLabel('Email').fill('juan@miclub.com');
    await page.getByLabel('Nombre del club').fill('Club Atletico Sur');
    await page.getByLabel('Zona').fill('Sur');

    await expect(page.getByLabel('Nombre completo')).toHaveValue('Juan Pérez');
    await expect(page.getByLabel('Email')).toHaveValue('juan@miclub.com');
    await expect(page.getByLabel('Nombre del club')).toHaveValue('Club Atletico Sur');
    await expect(page.getByLabel('Zona')).toHaveValue('Sur');
  });
});

/**
 * Tests que requieren el backend Express levantado en :4000. Se saltan con
 * `SKIP_BACKEND_TESTS=1` cuando se corren los tests sin backend disponible (ej. CI
 * minimal o ambiente local sin Supabase configurado).
 */
test.describe('Registro de club — submit con datos inválidos (requiere backend)', () => {
  test.skip(SKIP_BACKEND, 'Backend no disponible — set SKIP_BACKEND_TESTS=0 para correr');

  test('contraseñas que no coinciden → muestra error inline en confirmPassword', async ({ page }) => {
    await gotoRegistro(page);

    await page.getByLabel('Nombre completo').fill('Tester QA');
    await page.getByLabel('Email').fill(uniqueEmail());
    await page.getByLabel('Contraseña', { exact: true }).fill('Password123');
    await page.getByLabel('Confirmar contraseña').fill('Otracosa999');
    await page.getByLabel('Nombre del club').fill('Club Test QA');
    await page.getByLabel('Dirección').fill('Av. Siempre Viva 742');
    await page.getByLabel('Zona').fill('Norte');
    await page.getByLabel('Teléfono').fill('+54 11 4000-0000');

    await page.getByRole('button', { name: 'REGISTRAR CLUB' }).click();

    // El backend (Zod) devuelve 400 con `errors.confirmPassword`. La página se
    // re-renderiza con el span.field-error correspondiente. No debe redirigir a /login.
    await expect(page).toHaveURL(/\/registro-club/);
    await expect(page.getByText(/no coinciden/i)).toBeVisible();
  });

  test('campos vacíos → backend devuelve errores múltiples y se renderizan inline', async ({ page }) => {
    await gotoRegistro(page);

    // Submit sin completar nada.
    await page.getByRole('button', { name: 'REGISTRAR CLUB' }).click();

    await expect(page).toHaveURL(/\/registro-club/);
    // Al menos un error inline debe estar visible (Zod requiere todos los campos).
    await expect(page.locator('span.field-error').first()).toBeVisible();
  });
});
