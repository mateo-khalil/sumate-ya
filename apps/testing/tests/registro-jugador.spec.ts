import type { Page, Route } from '@playwright/test';
import {
  expect,
  FRONTEND_URL,
  test,
  VALID_PLAYER_REGISTER,
  type PlayerRegisterValues,
} from './support';

/**
 * Tests E2E del registro de jugador (/registro-jugador).
 *
 * Decision Context:
 * - La página usa SSR: el submit del form va a Astro, que llama al backend.
 *   Por eso `page.route()` no puede mockear el fetch interno al backend; sólo
 *   intercepta la navegación POST del navegador hacia /registro-jugador.
 * - Validaciones Zod de forma/campos se prueban contra el flujo SSR real porque
 *   el backend responde 400 antes de llamar a authService.
 * - Casos que crearían usuarios reales (éxito, email duplicado, password débil,
 *   rate limit) interceptan el POST del navegador. Validamos el contrato visible
 *   sin ensuciar auth.users/profiles ni depender del estado de Supabase.
 * - Previously fixed bugs: none relevant.
 */

const REGISTER_URL = `${FRONTEND_URL}/registro-jugador`;

function parseFormBody(route: Route): PlayerRegisterValues {
  const params = new URLSearchParams(route.request().postData() ?? '');
  return {
    displayName: params.get('displayName') ?? '',
    email: params.get('email') ?? '',
    password: params.get('password') ?? '',
    confirmPassword: params.get('confirmPassword') ?? '',
  };
}

function errorPageHtml({
  values,
  globalError = '',
  fieldErrors = {},
}: {
  values: Pick<PlayerRegisterValues, 'displayName' | 'email'>;
  globalError?: string;
  fieldErrors?: Partial<Record<keyof PlayerRegisterValues, string>>;
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
  handler: (route: Route, submitted: PlayerRegisterValues) => Promise<void>,
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
  test('renderiza el formulario y los links esperados', async ({ registerPlayerPage, page }) => {
    await registerPlayerPage.goto();

    await expect(registerPlayerPage.displayName).toBeVisible();
    await expect(registerPlayerPage.email).toBeVisible();
    await expect(registerPlayerPage.password).toBeVisible();
    await expect(registerPlayerPage.confirmPassword).toBeVisible();
    await expect(registerPlayerPage.submitButton).toBeVisible();
    await expect(page.getByRole('link', { name: /inici/i })).toHaveAttribute('href', '/login');
    await expect(page.getByRole('link', { name: /club/i })).toHaveAttribute(
      'href',
      '/registro-club',
    );
  });

  test('muestra errores Zod para email invalido, password corta y nombre incompleto', async ({
    registerPlayerPage,
    page,
  }) => {
    await registerPlayerPage.goto();
    await registerPlayerPage.fillForm({
      displayName: 'M',
      email: 'no-es-email',
      password: '1234567',
      confirmPassword: '',
    });
    await registerPlayerPage.submitAndWait();

    await expect(page).toHaveURL(/\/registro-jugador$/);
    await expect(page.getByText(/nombre completo requerido/i)).toBeVisible();
    await expect(page.getByText(/email inv/i)).toBeVisible();
    await expect(page.getByText(/al menos 8 caracteres/i)).toBeVisible();
    await expect(page.getByText(/confirm[aá] tu contrase/i)).toBeVisible();
    await expect(registerPlayerPage.displayName).toHaveValue('M');
    await expect(registerPlayerPage.email).toHaveValue('no-es-email');
  });

  test('muestra error cuando las contrasenas no coinciden', async ({
    registerPlayerPage,
    page,
  }) => {
    await registerPlayerPage.goto();
    await registerPlayerPage.fillForm({ password: 'Hola12345', confirmPassword: 'Otra12345' });
    await registerPlayerPage.submitAndWait();

    await expect(page).toHaveURL(/\/registro-jugador$/);
    await expect(page.getByText(/contras.*no coinciden/i)).toBeVisible();
  });

  test('envia el payload correcto y redirige a login cuando el registro es exitoso', async ({
    registerPlayerPage,
    page,
  }) => {
    let submitted: PlayerRegisterValues | undefined;
    await mockRegisterPost(page, async (route, formValues) => {
      submitted = formValues;
      await route.fulfill({
        status: 303,
        headers: { location: `${FRONTEND_URL}/login?registered=1` },
      });
    });

    await registerPlayerPage.goto();
    await registerPlayerPage.fillForm();
    await registerPlayerPage.submitButton.click();

    await page.waitForURL('**/login?registered=1');
    await expect(page.getByText(/registro exitoso/i)).toBeVisible();
    expect(submitted).toEqual(VALID_PLAYER_REGISTER);
  });

  test('muestra error inline para email duplicado y conserva los datos no sensibles', async ({
    registerPlayerPage,
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

    await registerPlayerPage.goto();
    await registerPlayerPage.fillForm();
    await registerPlayerPage.submitAndWait();

    await expect(page.getByText(/email ya esta registrado/i)).toBeVisible();
    await expect(registerPlayerPage.displayName).toHaveValue(VALID_PLAYER_REGISTER.displayName);
    await expect(registerPlayerPage.email).toHaveValue(VALID_PLAYER_REGISTER.email);
    await expect(registerPlayerPage.password).toHaveValue('');
    await expect(registerPlayerPage.confirmPassword).toHaveValue('');
  });

  test('muestra error inline cuando Supabase rechaza una contrasena debil', async ({
    registerPlayerPage,
    page,
  }) => {
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

    await registerPlayerPage.goto();
    await registerPlayerPage.fillForm({ password: 'password', confirmPassword: 'password' });
    await registerPlayerPage.submitAndWait();

    await expect(page.getByText(/contrasena no cumple/i)).toBeVisible();
  });

  test('muestra error global ante rate limit del proveedor de auth', async ({
    registerPlayerPage,
    page,
  }) => {
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

    await registerPlayerPage.goto();
    await registerPlayerPage.fillForm();
    await registerPlayerPage.submitAndWait();

    await expect(page.getByRole('alert')).toContainText(/demasiados intentos/i);
  });
});

