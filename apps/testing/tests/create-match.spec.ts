import type { Page, Route } from '@playwright/test';
import {
  buildMockSlot,
  DEFAULT_MOCK_SLOT,
  expect,
  FRONTEND_URL,
  GRAPHQL_PROXY_ROUTE,
  test,
  TEST_USERS,
  type MatchFormat,
  type MockSlot,
} from './support';

/**
 * Tests E2E de Crear Partido (/partidos/crear).
 *
 * Decision Context:
 * - La lista de clubes se pre-carga en SSR; `page.route()` no puede mockear
 *   ese fetch del servidor. Usamos login real (storage state pre-autenticado)
 *   para llegar al wizard, y mockeamos sólo las llamadas browser-side: clubSlots
 *   via /api/graphql y createMatch via /api/matches/create.
 * - No creamos partidos reales: la mutation queda interceptada en el proxy de
 *   Astro. Esto valida payload, errores de servicio y formato/slot inválido sin
 *   modificar Supabase.
 * - Los bordes "slot bloqueado" y "formato incompatible" se validan en dos
 *   capas: la UI no ofrece formatos > courts.maxFormat, y los errores
 *   devueltos por createMatch se muestran inline.
 */

const CREATE_MATCH_URL = `${FRONTEND_URL}/partidos/crear`;
const CREATE_MATCH_ROUTE = '**/api/matches/create';

test.use({ storageState: TEST_USERS.playerMateo.storageStatePath });

async function mockSlots(page: Page, slots: MockSlot[], error?: string): Promise<void> {
  await page.unroute(GRAPHQL_PROXY_ROUTE).catch(() => undefined);
  await page.route(GRAPHQL_PROXY_ROUTE, async (route: Route) => {
    if (error) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ errors: [{ message: error }] }),
      });
      return;
    }

    const requestBody = JSON.parse(route.request().postData() ?? '{}') as {
      variables?: { clubId?: string };
    };
    const clubId = requestBody.variables?.clubId ?? 'club-from-ui';
    const normalizedSlots = slots.map((slot) => ({ ...slot, clubId }));

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { clubSlots: normalizedSlots } }),
    });
  });
}

type CreateMatchResponse =
  | { ok: true; matchId?: string }
  | { ok: false; message: string; graphQLError?: boolean };

async function mockCreateMatch(
  page: Page,
  response: CreateMatchResponse,
): Promise<{ payloads: unknown[] }> {
  const payloads: unknown[] = [];

  await page.unroute(CREATE_MATCH_ROUTE).catch(() => undefined);
  await page.route(CREATE_MATCH_ROUTE, async (route: Route) => {
    payloads.push(JSON.parse(route.request().postData() ?? '{}') as unknown);

    if (response.ok) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            createMatch: {
              success: true,
              matchId: response.matchId ?? 'match-e2e-creado',
              message: null,
            },
          },
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        response.graphQLError
          ? { errors: [{ message: response.message }] }
          : {
              data: {
                createMatch: {
                  success: false,
                  matchId: null,
                  message: response.message,
                },
              },
            },
      ),
    });
  });

  return { payloads };
}

test.describe('Crear Partido (/partidos/crear)', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    await mockSlots(page, [DEFAULT_MOCK_SLOT]);
  });

  test('redirige a login cuando el jugador no esta autenticado', async ({ browser }) => {
    // Explicitly pass empty storage state: with channel:'chrome', browser.newContext()
    // without arguments can inherit cookies from the browser-level profile store.
    const anonContext = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const anonPage = await anonContext.newPage();
    try {
      await anonPage.goto(CREATE_MATCH_URL);
      await expect(anonPage).toHaveURL(/\/login$/);
      await expect(anonPage.getByRole('textbox', { name: 'Email' })).toBeVisible();
    } finally {
      await anonContext.close();
    }
  });

  test('no permite avanzar de paso sin seleccionar club, horario y formato', async ({
    createMatchPage,
    page,
  }) => {
    await createMatchPage.goto();

    await expect(createMatchPage.continueButton).toBeDisabled();

    await createMatchPage.selectFirstClubAndContinue();
    await expect(createMatchPage.continueButton).toBeDisabled();

    await page.locator('.slot-card').filter({ hasText: '19:00' }).click();
    await expect(createMatchPage.continueButton).toBeEnabled();
    await createMatchPage.continueButton.click();

    await expect(createMatchPage.viewSummaryButton).toBeDisabled();
  });

  test('muestra mensaje amigable cuando el club no tiene horarios disponibles', async ({
    createMatchPage,
    page,
  }) => {
    await mockSlots(page, []);
    await createMatchPage.goto();
    await createMatchPage.selectFirstClubAndContinue();

    await expect(page.getByText(/no hay horarios disponibles/i)).toBeVisible();
    await expect(createMatchPage.continueButton).toBeDisabled();
  });

  test('muestra errores de carga de horarios sin romper el wizard', async ({
    createMatchPage,
    page,
  }) => {
    await mockSlots(page, [], 'No pudimos cargar horarios del club');
    await createMatchPage.goto();
    await createMatchPage.selectFirstClubAndContinue();

    await expect(page.getByRole('alert')).toContainText(/no pudimos cargar horarios/i);
    await expect(createMatchPage.continueButton).toBeDisabled();
  });

  test('deshabilita formatos que superan el maxFormat de la cancha', async ({
    createMatchPage,
    page,
  }) => {
    await mockSlots(page, [buildMockSlot({ court: { maxFormat: 'FIVE_VS_FIVE' } })]);
    await createMatchPage.goto();
    await createMatchPage.selectFirstClubAndContinue();
    await createMatchPage.selectSlotAndContinue();

    await expect(createMatchPage.formatButton('5v5')).toBeEnabled();
    await expect(createMatchPage.formatButton('7v7')).toBeDisabled();
    await expect(createMatchPage.formatButton('10v10')).toBeDisabled();
    await expect(createMatchPage.formatButton('11v11')).toBeDisabled();
    await expect(page.getByText(/no compatible/i)).toHaveCount(3);
  });

  test('limita la capacidad entre el minimo y el maximo del formato elegido', async ({
    createMatchPage,
  }) => {
    await createMatchPage.goto();
    await createMatchPage.selectFirstClubAndContinue();
    await createMatchPage.selectSlotAndContinue();
    await createMatchPage.formatButton('7v7').click();

    await createMatchPage.capacityInput.fill('99');
    await expect(createMatchPage.capacityInput).toHaveValue('14');

    await createMatchPage.capacityInput.fill('1');
    await expect(createMatchPage.capacityInput).toHaveValue('4');
  });

  test('crea el partido con descripcion opcional, envia el payload esperado y redirige al detalle', async ({
    createMatchPage,
    page,
  }) => {
    const create = await mockCreateMatch(page, { ok: true, matchId: 'match-e2e-ok' });
    await page.route('**/partidos/match-e2e-ok', async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<!doctype html><html><body><h1>Detalle mockeado</h1></body></html>',
      });
    });

    await createMatchPage.goto();
    await createMatchPage.selectFirstClubAndContinue();
    const date = await createMatchPage.readDate();
    await createMatchPage.selectSlotAndContinue();
    await createMatchPage.selectFormatAndOpenSummary();

    await createMatchPage.descriptionInput.fill('Partido amistoso de prueba E2E, nivel intermedio.');
    await createMatchPage.createButton.click();

    await expect.poll(() => create.payloads.length, { timeout: 10_000 }).toBe(1);
    const payload = create.payloads[0] as {
      variables?: {
        input?: {
          slotId?: string;
          courtId?: string;
          date?: string;
          format?: MatchFormat;
          capacity?: number;
          description?: string;
        };
      };
    };

    expect(payload.variables?.input).toMatchObject({
      slotId: DEFAULT_MOCK_SLOT.id,
      courtId: DEFAULT_MOCK_SLOT.court.id,
      date,
      format: 'SEVEN_VS_SEVEN',
      capacity: 10,
      description: 'Partido amistoso de prueba E2E, nivel intermedio.',
    });
    await expect(page).toHaveURL(/\/partidos\/match-e2e-ok$/);
  });

  test('no envia la mutation cuando la descripcion supera 500 caracteres', async ({
    createMatchPage,
    page,
  }) => {
    const create = await mockCreateMatch(page, { ok: true });

    await createMatchPage.goto();
    await createMatchPage.selectFirstClubAndContinue();
    await createMatchPage.selectSlotAndContinue();
    await createMatchPage.selectFormatAndOpenSummary();

    await createMatchPage.descriptionInput.fill('x'.repeat(501));

    await expect(page.getByText('501/500')).toBeVisible();
    await expect(createMatchPage.createButton).toBeDisabled();
    expect(create.payloads).toHaveLength(0);
  });

  test('muestra error cuando el backend rechaza un slot bloqueado', async ({
    createMatchPage,
    page,
  }) => {
    await mockCreateMatch(page, {
      ok: false,
      message: 'El horario ya esta bloqueado. Elegi otro horario.',
      graphQLError: true,
    });

    await createMatchPage.goto();
    await createMatchPage.selectFirstClubAndContinue();
    await createMatchPage.selectSlotAndContinue();
    await createMatchPage.selectFormatAndOpenSummary();
    await createMatchPage.createButton.click();

    await expect(page.getByRole('alert')).toContainText(/horario ya esta bloqueado/i);
    await expect(page).toHaveURL(/\/partidos\/crear$/);
  });

  test('muestra error cuando el backend rechaza un formato incompatible con la cancha', async ({
    createMatchPage,
    page,
  }) => {
    await mockCreateMatch(page, {
      ok: false,
      message: 'La cancha seleccionada no soporta el formato elegido.',
    });

    await createMatchPage.goto();
    await createMatchPage.selectFirstClubAndContinue();
    await createMatchPage.selectSlotAndContinue();
    await createMatchPage.selectFormatAndOpenSummary();
    await createMatchPage.createButton.click();

    await expect(page.getByRole('alert')).toContainText(/no soporta el formato/i);
    await expect(page).toHaveURL(/\/partidos\/crear$/);
  });
});
