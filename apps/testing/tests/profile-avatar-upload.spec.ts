import { expect, FRONTEND_URL, mockJsonRoute, test, TEST_USERS } from './support';

/**
 * Tests E2E de subida de foto de perfil (/perfil).
 *
 * Decision Context:
 * - /perfil es SSR y requiere sesión real; usamos storage state pre-autenticado
 *   del player Mateo. El upload se mockea en `/api/profile/avatar` para no
 *   escribir en Supabase Storage ni modificar profiles.avatarUrl.
 * - El componente comprime client-side antes de enviar un data URL JSON al
 *   proxy de Astro. Validamos el contrato visible: preview, estados,
 *   formato/tamaño, payload enviado, errores del backend y la ausencia de
 *   llamadas cuando falla la validación cliente.
 * - Los casos "bucket no disponible" y "límite 2MB" se simulan como respuestas
 *   del proxy: la verificación real vive en el backend, pero el E2E asegura
 *   que el jugador ve el mensaje correcto.
 */

const AVATAR_UPLOAD_ROUTE = '**/api/profile/avatar';

test.describe('Subida de foto de perfil (/perfil)', () => {
  test.describe.configure({ mode: 'serial' });

  test('redirige a login si el jugador no esta autenticado', async ({ browser }) => {
    // Caso anónimo: contexto fresco sin storage state.
    const anonContext = await browser.newContext();
    const anonPage = await anonContext.newPage();
    try {
      await anonPage.goto(`${FRONTEND_URL}/perfil`);
      await expect(anonPage).toHaveURL(/\/login$/);
      await expect(anonPage.getByRole('textbox', { name: 'Email' })).toBeVisible();
    } finally {
      await anonContext.close();
    }
  });

  test.describe('con sesion de jugador', () => {
    test.use({ storageState: TEST_USERS.playerMateo.storageStatePath });

    test.beforeEach(async ({ profilePage }) => {
      await profilePage.goto();
      await profilePage.openAvatarModal();
    });

    test('abre el modal, selecciona una imagen valida y muestra preview antes de subir', async ({
      profilePage,
      page,
    }) => {
      const upload = await mockJsonRoute(page, AVATAR_UPLOAD_ROUTE, {
        body: {
          avatarUrl:
            'https://example.supabase.co/storage/v1/object/public/avatars/test-user/avatar.png',
        },
      });

      await expect(profilePage.submitAvatarButton).toBeDisabled();
      await profilePage.chooseValidPng();

      await expect(page.getByAltText(/vista previa de tu nueva foto/i)).toBeVisible();
      await expect(profilePage.submitAvatarButton).toBeEnabled();
      expect(upload.getPayloads()).toHaveLength(0);
    });

    test('comprime y envia la imagen como data URL JSON al proxy de avatar', async ({
      profilePage,
      page,
    }) => {
      const upload = await mockJsonRoute(page, AVATAR_UPLOAD_ROUTE, {
        delayMs: 1_000,
        body: {
          avatarUrl:
            'https://example.supabase.co/storage/v1/object/public/avatars/test-user/avatar.png',
        },
      });

      await profilePage.chooseValidPng();
      await profilePage.submitAvatarButton.click();

      await expect(page.getByRole('button', { name: /procesando/i })).toBeVisible();
      await expect.poll(() => upload.getPayloads().length, { timeout: 30_000 }).toBe(1);

      const payload = upload.getPayloads()[0] as { dataUrl?: string };
      expect(payload.dataUrl).toMatch(/^data:image\/png;base64,/);
      expect(payload.dataUrl?.length).toBeLessThan(3_100_000);
      await expect(page.getByText(/foto actualizada/i)).toBeVisible();
    });

    test('rechaza formatos no permitidos antes de llamar al backend', async ({
      profilePage,
      page,
    }) => {
      const upload = await mockJsonRoute(page, AVATAR_UPLOAD_ROUTE);

      await profilePage.chooseFile({
        name: 'avatar.gif',
        mimeType: 'image/gif',
        buffer: Buffer.from('not-an-allowed-image'),
      });

      await expect(page.getByRole('alert')).toContainText(/formato no permitido/i);
      await expect(profilePage.submitAvatarButton).toBeDisabled();
      await expect(page.getByAltText(/vista previa/i)).toHaveCount(0);
      expect(upload.getPayloads()).toHaveLength(0);
    });

    test('rechaza archivos demasiado grandes en el cliente sin hacer upload', async ({
      profilePage,
      page,
    }) => {
      const upload = await mockJsonRoute(page, AVATAR_UPLOAD_ROUTE);

      await profilePage.chooseFile({
        name: 'avatar-grande.png',
        mimeType: 'image/png',
        buffer: Buffer.alloc(6 * 1024 * 1024 + 1, 1),
      });

      await expect(page.getByRole('alert')).toContainText(/archivo es demasiado grande/i);
      await expect(profilePage.submitAvatarButton).toBeDisabled();
      expect(upload.getPayloads()).toHaveLength(0);
    });

    test('muestra el error autoritativo de tamano maximo 2MB devuelto por el backend', async ({
      profilePage,
      page,
    }) => {
      await mockJsonRoute(page, AVATAR_UPLOAD_ROUTE, {
        status: 400,
        body: {
          error: 'La imagen supera el limite de 2MB. Reducí el tamaño e intentá de nuevo.',
        },
      });

      await profilePage.chooseValidPng();
      await profilePage.submitAvatarButton.click();

      await expect(page.getByRole('alert')).toContainText(/limite de 2MB/i);
      await expect(profilePage.submitAvatarButton).toBeEnabled();
    });

    test('muestra error si el bucket avatars no esta disponible', async ({
      profilePage,
      page,
    }) => {
      await mockJsonRoute(page, AVATAR_UPLOAD_ROUTE, {
        status: 500,
        body: {
          error: 'El bucket de almacenamiento no esta disponible. Contacta al administrador.',
        },
      });

      await profilePage.chooseValidPng();
      await profilePage.submitAvatarButton.click();

      await expect(page.getByRole('alert')).toContainText(/bucket de almacenamiento/i);
      await expect(profilePage.submitAvatarButton).toBeEnabled();
    });

    test('permite cerrar el modal sin subir imagen', async ({ profilePage }) => {
      // Decision Context: sólo verificamos el cierre. La selección de archivo +
      // preview ya está cubierta exhaustivamente arriba — re-correrlo acá era
      // setup puro (canvas compression para el data-URL preview) sobre un test
      // que no asserta nada del preview. Asertamos `toBeHidden()` contra
      // `#avatar-upload-modal` (id estable); la visibility-aware assertion es
      // la verdad de comportamiento — chequear class-name era detalle interno.
      await profilePage.closeAvatarButton.click();
      await expect(profilePage.avatarModal).toBeHidden();
    });
  });
});

