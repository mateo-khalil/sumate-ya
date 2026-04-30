import { expect, test, type Page, type Route } from '@playwright/test';

/**
 * Tests E2E del registro de jugador (/registro-jugador).
 *
 * Decision Context:
 * - La pagina usa SSR: el submit del form va a Astro y Astro llama al backend.
 *   Por eso `page.route()` no puede mockear el fetch interno al backend; solo puede
 *   interceptar la navegacion POST del navegador hacia /registro-jugador.
 * - Validaciones Zod de forma/campos se prueban contra el flujo SSR real porque no
 *   llegan a Supabase: el backend responde 400 antes de llamar authService.
 * - Casos que crearian o consultarian usuarios reales (exito, email duplicado,
 *   password debil de proveedor, rate limit) se prueban interceptando el POST del
 *   navegador. Asi verificamos el contrato visible de la pantalla sin ensuciar
 *   auth.users/profiles ni depender del estado de Supabase.
 * - Complementa los tests unitarios del backend que verifican createUser(),
 *   insert en profiles con role='player' y rollback ante fallas.
 */

const FRONTEND_URL = 'http://localhost:4321';
const REGISTER_URL = `${FRONTEND_URL}/registro-jugador`;

type RegisterValues = {
  displayName: string;
  email: string;
  password: string;
  confirmPassword: string;
};

const VALID_PLAYER: RegisterValues = {
  displayName: 'Mateo Duran',
  email: 'mateo.e2e@example.com',
  password: 'Hola12345',
  confirmPassword: 'Hola12345',
};

async function fillRegisterForm(page: Page, values: Partial<RegisterValues> = {}): Promise<void> {
  const input = { ...VALID_PLAYER, ...values };

  await page.locator('#displayName').fill(input.displayName);
  await page.locator('#email').fill(input.email);
  await page.locator('#password').fill(input.password);
  await page.locator('#confirmPassword').fill(input.confirmPassword);
}

function parseFormBody(route: Route): RegisterValues {
  const body = route.request().postData() ?? '';
  const params = new URLSearchParams(body);

  return {
    displayName: params.get('displayName') ?? '',
    email: params.get('email') ?? '',
    password: params.get('password') ?? '',
    confirmPassword: params.get('confirmPassword') ?? '',
  };
}

async function submitAndWait(page: Page): Promise<void> {
  await Promise.all([
    page.waitForLoadState('domcontentloaded'),
    page.getByRole('button', { name: /crear cuenta/i }).click(),
  ]);
}

function errorPageHtml({
  values,
  globalError = '',
  fieldErrors = {},
}: {
  values: Pick<RegisterValues, 'displayName' | 'email'>;
  globalError?: string;
  fieldErrors?: Partial<Record<keyof RegisterValues, string>>;
}): string {
  return `<!doctype html>
<html lang="es">
  <head><meta charset="utf-8"><title>Registrarse como jugador - Sumate Ya</title></head>
  <body>
    <main>
      <h1>SUMATE YA</h1>
      <p>Registrate y sumate a los partidos</p>
      ${globalError ? `<div role="alert">${globalError}</div>` : ''}
      <form method="POST" novalidate>
        <label for="displayName">Nombre</label>
        <input id="displayName" name="displayName" value="${values.displayName}" />
        ${fieldErrors.displayName ? `<span>${fieldErrors.displayName}</span>` : ''}

        <label for="email">Email</label>
        <input id="email" name="email" value="${values.email}" />
        ${fieldErrors.email ? `<span>${fieldErrors.email}</span>` : ''}

        <label for="password">Contrasena</label>
        <input id="password" name="password" type="password" />
        ${fieldErrors.password ? `<span>${fieldErrors.password}</span>` : ''}

        <label for="confirmPassword">Confirmar contrasena</label>
        <input id="confirmPassword" name="confirmPassword" type="password" />
        ${fieldErrors.confirmPassword ? `<span>${fieldErrors.confirmPassword}</span>` : ''}

        <button type="submit">CREAR CUENTA</button>
      </form>
      <a href="/login">Inicia sesion</a>
      <a href="/registro-club">Registra tu club</a>
    </main>
  </body>
</html>`;
}

async function mockRegisterPost(
  page: Page,
  handler: (route: Route, submitted: RegisterValues) => Promise<void>,
): Promise<void> {
  await page.route('**/registro-jugador', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }

    await handler(route, parseFormBody(route));
  });
}

test.describe('Registro de jugador (/registro-jugador)', () => {
  test('renderiza el formulario y los links esperados', async ({ page }) => {
    await page.goto(REGISTER_URL);

    await expect(page.getByRole('heading', { name: /sumate ya/i })).toBeVisible();
    await expect(page.locator('#displayName')).toBeVisible();
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.locator('#confirmPassword')).toBeVisible();
    await expect(page.getByRole('button', { name: /crear cuenta/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /inici/i })).toHaveAttribute('href', '/login');
    await expect(page.getByRole('link', { name: /club/i })).toHaveAttribute(
      'href',
      '/registro-club',
    );
  });

  test('muestra errores Zod para email invalido, password corta y nombre incompleto', async ({
    page,
  }) => {
    await page.goto(REGISTER_URL);

    await fillRegisterForm(page, {
      displayName: 'M',
      email: 'no-es-email',
      password: '1234567',
      confirmPassword: '',
    });
    await submitAndWait(page);

    await expect(page).toHaveURL(/\/registro-jugador$/);
    await expect(page.getByText(/nombre completo requerido/i)).toBeVisible();
    await expect(page.getByText(/email inv/i)).toBeVisible();
    await expect(page.getByText(/al menos 8 caracteres/i)).toBeVisible();
    await expect(page.getByText(/confirm[aá] tu contrase/i)).toBeVisible();
    await expect(page.locator('#displayName')).toHaveValue('M');
    await expect(page.locator('#email')).toHaveValue('no-es-email');
  });

  test('muestra error cuando las contrasenas no coinciden', async ({ page }) => {
    await page.goto(REGISTER_URL);

    await fillRegisterForm(page, {
      password: 'Hola12345',
      confirmPassword: 'Otra12345',
    });
    await submitAndWait(page);

    await expect(page).toHaveURL(/\/registro-jugador$/);
    await expect(page.getByText(/contras.*no coinciden/i)).toBeVisible();
  });

  test('envia el payload correcto y redirige a login cuando el registro es exitoso', async ({
    page,
  }) => {
    let submitted: RegisterValues | undefined;

    await mockRegisterPost(page, async (route, formValues) => {
      submitted = formValues;
      await route.fulfill({
        status: 303,
        headers: { location: `${FRONTEND_URL}/login?registered=1` },
      });
    });

    await page.goto(REGISTER_URL);
    await fillRegisterForm(page);
    await page.getByRole('button', { name: /crear cuenta/i }).click();

    await page.waitForURL('**/login?registered=1');
    await expect(page.getByText(/registro exitoso/i)).toBeVisible();
    expect(submitted).toEqual(VALID_PLAYER);
  });

  test('muestra error inline para email duplicado y conserva los datos no sensibles', async ({
    page,
  }) => {
    await mockRegisterPost(page, async (route, formValues) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: errorPageHtml({
          values: formValues,
          fieldErrors: { email: 'Este email ya esta registrado' },
        }),
      });
    });

    await page.goto(REGISTER_URL);
    await fillRegisterForm(page);
    await submitAndWait(page);

    await expect(page.getByText(/email ya esta registrado/i)).toBeVisible();
    await expect(page.locator('#displayName')).toHaveValue(VALID_PLAYER.displayName);
    await expect(page.locator('#email')).toHaveValue(VALID_PLAYER.email);
    await expect(page.locator('#password')).toHaveValue('');
    await expect(page.locator('#confirmPassword')).toHaveValue('');
  });

  test('muestra error inline cuando Supabase rechaza una contrasena debil', async ({ page }) => {
    await mockRegisterPost(page, async (route, formValues) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: errorPageHtml({
          values: formValues,
          fieldErrors: { password: 'La contrasena no cumple los requisitos minimos' },
        }),
      });
    });

    await page.goto(REGISTER_URL);
    await fillRegisterForm(page, {
      password: 'password',
      confirmPassword: 'password',
    });
    await submitAndWait(page);

    await expect(page.getByText(/contrasena no cumple/i)).toBeVisible();
  });

  test('muestra error global ante rate limit del proveedor de auth', async ({ page }) => {
    await mockRegisterPost(page, async (route, formValues) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: errorPageHtml({
          values: formValues,
          globalError: 'Demasiados intentos de registro. Espera unos minutos y volve a intentarlo.',
        }),
      });
    });

    await page.goto(REGISTER_URL);
    await fillRegisterForm(page);
    await submitAndWait(page);

    await expect(page.getByRole('alert')).toContainText(/demasiados intentos/i);
  });
});
