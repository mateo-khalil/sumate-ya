import { expect, test, type Page, type Route } from '@playwright/test';

/**
 * Tests E2E de subida de foto de perfil (/perfil).
 *
 * Decision Context:
 * - /perfil es SSR y requiere sesion real; usamos el mismo usuario de prueba que
 *   los specs de login/listado. El upload en si se mockea en /api/profile/avatar
 *   para no escribir en Supabase Storage ni modificar profiles.avatarUrl.
 * - El componente comprime client-side antes de enviar un data URL JSON al proxy de
 *   Astro. Los tests validan el contrato visible: preview, estados, formato/tamano,
 *   payload enviado, errores del backend y que no haya llamadas cuando falla la
 *   validacion cliente.
 * - Los casos de bucket inexistente y limite 2MB se simulan como respuestas del proxy:
 *   la verificacion real del bucket y la validacion autoritativa viven en el backend,
 *   pero el E2E asegura que el jugador ve el mensaje correcto sin quedar bloqueado.
 */

const FRONTEND_URL = 'http://localhost:4321';
const PROFILE_URL = `${FRONTEND_URL}/perfil`;
const AVATAR_UPLOAD_ROUTE = '**/api/profile/avatar';

const TEST_USER = {
  email: 'mateoduran2010@gmail.com',
  password: 'Hola1234',
};

const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
  'base64',
);

type UploadResponse = {
  status?: number;
  body?: { avatarUrl?: string; error?: string };
  delayMs?: number;
};

async function login(page: Page): Promise<void> {
  await page.goto(`${FRONTEND_URL}/login`);
  await page.getByRole('textbox', { name: 'Email' }).fill(TEST_USER.email);
  await page.getByRole('textbox', { name: /contrase/i }).fill(TEST_USER.password);
  await page.getByRole('button', { name: /ingresar/i }).click();
  await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 10_000 });
}

async function gotoProfile(page: Page): Promise<void> {
  await page.goto(PROFILE_URL);
  await expect(page.getByRole('heading', { name: /mi perfil/i })).toBeVisible();
  await expect(page.locator('.profile-card')).toBeVisible();
}

async function openAvatarModal(page: Page): Promise<void> {
  await page.locator('.profile-card-wrapper').hover();
  await page.getByTitle(/cambiar foto de perfil/i).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('heading', { name: /actualizar foto de perfil/i })).toBeVisible();
  await expect(page.locator('input[type="file"]')).toHaveAttribute(
    'accept',
    'image/jpeg,image/png,image/webp',
  );
}

async function chooseFile(
  page: Page,
  file: { name: string; mimeType: string; buffer: Buffer },
): Promise<void> {
  await page.locator('input[type="file"]').setInputFiles(file);
}

async function chooseValidPng(page: Page): Promise<void> {
  await chooseFile(page, {
    name: 'avatar.png',
    mimeType: 'image/png',
    buffer: ONE_PIXEL_PNG,
  });
}

async function mockAvatarUpload(
  page: Page,
  response: UploadResponse = {},
): Promise<{ getPayloads: () => unknown[] }> {
  const payloads: unknown[] = [];

  await page.unroute(AVATAR_UPLOAD_ROUTE).catch(() => undefined);
  await page.route(AVATAR_UPLOAD_ROUTE, async (route: Route) => {
    const rawBody = route.request().postData() ?? '{}';
    payloads.push(JSON.parse(rawBody) as unknown);

    if (response.delayMs) {
      await new Promise((resolve) => setTimeout(resolve, response.delayMs));
    }

    await route.fulfill({
      status: response.status ?? 200,
      contentType: 'application/json',
      body: JSON.stringify(
        response.body ?? {
          avatarUrl:
            'https://example.supabase.co/storage/v1/object/public/avatars/test-user/avatar.png',
        },
      ),
    });
  });

  return { getPayloads: () => payloads };
}

test.describe('Subida de foto de perfil (/perfil)', () => {
  test.describe.configure({ mode: 'serial' });

  test('redirige a login si el jugador no esta autenticado', async ({ page }) => {
    await page.goto(PROFILE_URL);

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('textbox', { name: 'Email' })).toBeVisible();
  });

  test.describe('con sesion de jugador', () => {
    test.beforeEach(async ({ page }) => {
      await login(page);
      await gotoProfile(page);
      await openAvatarModal(page);
    });

    test('abre el modal, selecciona una imagen valida y muestra preview antes de subir', async ({
      page,
    }) => {
      const upload = await mockAvatarUpload(page);

      await expect(page.getByRole('button', { name: /subir foto/i })).toBeDisabled();
      await chooseValidPng(page);

      await expect(page.getByAltText(/vista previa de tu nueva foto/i)).toBeVisible();
      await expect(page.getByRole('button', { name: /subir foto/i })).toBeEnabled();
      expect(upload.getPayloads()).toHaveLength(0);
    });

    test('comprime y envia la imagen como data URL JSON al proxy de avatar', async ({
      page,
    }) => {
      const upload = await mockAvatarUpload(page, { delayMs: 1_000 });

      await chooseValidPng(page);
      await page.getByRole('button', { name: /subir foto/i }).click();

      await expect(page.getByRole('button', { name: /procesando/i })).toBeVisible();
      await expect
        .poll(() => upload.getPayloads().length, { timeout: 30_000 })
        .toBe(1);

      const payload = upload.getPayloads()[0] as { dataUrl?: string };
      expect(payload.dataUrl).toMatch(/^data:image\/png;base64,/);
      expect(payload.dataUrl?.length).toBeLessThan(3_100_000);
      await expect(page.getByText(/foto actualizada/i)).toBeVisible();
    });

    test('rechaza formatos no permitidos antes de llamar al backend', async ({ page }) => {
      const upload = await mockAvatarUpload(page);

      await chooseFile(page, {
        name: 'avatar.gif',
        mimeType: 'image/gif',
        buffer: Buffer.from('not-an-allowed-image'),
      });

      await expect(page.getByRole('alert')).toContainText(/formato no permitido/i);
      await expect(page.getByRole('button', { name: /subir foto/i })).toBeDisabled();
      await expect(page.getByAltText(/vista previa/i)).toHaveCount(0);
      expect(upload.getPayloads()).toHaveLength(0);
    });

    test('rechaza archivos demasiado grandes en el cliente sin hacer upload', async ({
      page,
    }) => {
      const upload = await mockAvatarUpload(page);

      await chooseFile(page, {
        name: 'avatar-grande.png',
        mimeType: 'image/png',
        buffer: Buffer.alloc(6 * 1024 * 1024 + 1, 1),
      });

      await expect(page.getByRole('alert')).toContainText(/archivo es demasiado grande/i);
      await expect(page.getByRole('button', { name: /subir foto/i })).toBeDisabled();
      expect(upload.getPayloads()).toHaveLength(0);
    });

    test('muestra el error autoritativo de tamano maximo 2MB devuelto por el backend', async ({
      page,
    }) => {
      await mockAvatarUpload(page, {
        status: 400,
        body: {
          error: 'La imagen supera el limite de 2MB. Reducí el tamaño e intentá de nuevo.',
        },
      });

      await chooseValidPng(page);
      await page.getByRole('button', { name: /subir foto/i }).click();

      await expect(page.getByRole('alert')).toContainText(/limite de 2MB/i);
      await expect(page.getByRole('button', { name: /subir foto/i })).toBeEnabled();
    });

    test('muestra error si el bucket avatars no esta disponible', async ({ page }) => {
      await mockAvatarUpload(page, {
        status: 500,
        body: {
          error: 'El bucket de almacenamiento no esta disponible. Contacta al administrador.',
        },
      });

      await chooseValidPng(page);
      await page.getByRole('button', { name: /subir foto/i }).click();

      await expect(page.getByRole('alert')).toContainText(/bucket de almacenamiento/i);
      await expect(page.getByRole('button', { name: /subir foto/i })).toBeEnabled();
    });

    test('permite cerrar el modal sin subir imagen', async ({ page }) => {
      await chooseValidPng(page);
      await expect(page.getByAltText(/vista previa/i)).toBeVisible();

      await page.getByRole('button', { name: /cerrar modal/i }).click();

      await expect(page.getByRole('dialog')).not.toBeVisible();
      await expect(page.locator('#avatar-upload-modal')).toHaveClass(/hidden/);
    });
  });
});
