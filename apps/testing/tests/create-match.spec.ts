import { expect, test, type Page, type Route } from '@playwright/test';

/**
 * Tests E2E de Crear Partido (/partidos/crear).
 *
 * Decision Context:
 * - La lista de clubes se pre-carga en SSR, asi que page.route() no puede mockear ese
 *   fetch del servidor. Usamos el login y clubes reales del ambiente para llegar al
 *   wizard, y mockeamos solo las llamadas browser-side: clubSlots via /api/graphql y
 *   createMatch via /api/matches/create.
 * - No creamos partidos reales: la mutation queda interceptada en el proxy de Astro.
 *   Esto permite validar payload, errores de servicio, slot bloqueado/formato invalido
 *   y redirect sin modificar Supabase.
 * - Los bordes de slot bloqueado y formato incompatible se validan en dos capas:
 *   la UI no ofrece formatos por encima de courts.maxFormat, y los errores devueltos
 *   por createMatch se muestran inline cuando el backend rechaza el write.
 */

const FRONTEND_URL = 'http://localhost:4321';
const CREATE_MATCH_URL = `${FRONTEND_URL}/partidos/crear`;
const GRAPHQL_ROUTE = '**/api/graphql**';
const CREATE_MATCH_ROUTE = '**/api/matches/create';

const TEST_USER = {
  email: 'mateoduran2010@gmail.com',
  password: 'Hola1234',
};

type MatchFormat = 'FIVE_VS_FIVE' | 'SEVEN_VS_SEVEN' | 'TEN_VS_TEN' | 'ELEVEN_VS_ELEVEN';

type MockSlot = {
  id: string;
  clubId: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  priceArs: number | null;
  court: {
    id: string;
    name: string;
    maxFormat: MatchFormat;
    surface: 'GRASS' | 'SYNTHETIC' | 'CONCRETE' | 'INDOOR';
    isIndoor: boolean;
  };
};

const DEFAULT_SLOT: MockSlot = {
  id: 'slot-e2e-1900',
  clubId: 'club-from-ui',
  dayOfWeek: 'monday',
  startTime: '19:00:00',
  endTime: '20:00:00',
  priceArs: 4200,
  court: {
    id: 'court-e2e-1',
    name: 'Cancha E2E',
    maxFormat: 'SEVEN_VS_SEVEN',
    surface: 'SYNTHETIC',
    isIndoor: false,
  },
};

async function login(page: Page): Promise<void> {
  await page.goto(`${FRONTEND_URL}/login`);
  await page.getByRole('textbox', { name: 'Email' }).fill(TEST_USER.email);
  await page.getByRole('textbox', { name: /contrase/i }).fill(TEST_USER.password);
  await page.getByRole('button', { name: /ingresar/i }).click();
  await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 10_000 });
}

async function mockSlots(page: Page, slots: MockSlot[], error?: string): Promise<void> {
  await page.unroute(GRAPHQL_ROUTE).catch(() => undefined);
  await page.route(GRAPHQL_ROUTE, async (route: Route) => {
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

async function mockCreateMatch(
  page: Page,
  response:
    | { ok: true; matchId?: string }
    | { ok: false; message: string; graphQLError?: boolean },
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

async function gotoCreateMatch(page: Page): Promise<void> {
  await page.goto(CREATE_MATCH_URL);
  await expect(page.getByRole('heading', { name: /crear partido/i })).toBeVisible();
  await expect(page.locator('.wizard')).toBeVisible();
}

async function selectFirstClubAndContinue(page: Page): Promise<void> {
  const firstClub = page.locator('.club-card').first();
  await expect(firstClub).toBeVisible();
  // Esperamos a que la React island del wizard este hidratada antes de hacer clic.
  // El wizard se renderiza con `client:load`, pero la primera visita a /partidos/crear
  // puede tardar segundos en hidratar (Vite compila on-demand) y los clicks anteriores
  // a la hidratacion no disparan el onClick — por eso polleamos `aria-pressed` que la
  // React component setea cuando el club queda seleccionado.
  await firstClub.click();
  await expect(firstClub).toHaveAttribute('aria-pressed', 'true');
  const continueBtn = page.getByRole('button', { name: /continuar/i });
  await expect(continueBtn).toBeEnabled();
  await continueBtn.click();
  await expect(page.getByLabel(/fecha del partido/i)).toBeVisible();
}

async function selectDefaultSlotAndContinue(page: Page): Promise<void> {
  await expect(page.getByText('19:00')).toBeVisible();
  await page.locator('.slot-card').filter({ hasText: '19:00' }).click();
  await page.getByRole('button', { name: /continuar/i }).click();
  await expect(page.getByRole('button', { name: /^5v5/i })).toBeVisible();
}

async function selectFormatAndOpenSummary(page: Page, formatLabel = '7v7'): Promise<void> {
  await page.getByRole('button', { name: new RegExp(`^${formatLabel}`, 'i') }).click();
  await page.getByRole('button', { name: /ver resumen/i }).click();
  await expect(page.getByRole('heading', { name: /resumen del partido/i })).toBeVisible();
}

test.describe('Crear Partido (/partidos/crear)', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    await mockSlots(page, [DEFAULT_SLOT]);
  });

  test('redirige a login cuando el jugador no esta autenticado', async ({ page }) => {
    await page.goto(CREATE_MATCH_URL);

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('textbox', { name: 'Email' })).toBeVisible();
  });

  test('no permite avanzar de paso sin seleccionar club, horario y formato', async ({ page }) => {
    await login(page);
    await gotoCreateMatch(page);

    await expect(page.getByRole('button', { name: /continuar/i })).toBeDisabled();

    await selectFirstClubAndContinue(page);
    await expect(page.getByRole('button', { name: /continuar/i })).toBeDisabled();

    await page.locator('.slot-card').filter({ hasText: '19:00' }).click();
    await expect(page.getByRole('button', { name: /continuar/i })).toBeEnabled();
    await page.getByRole('button', { name: /continuar/i }).click();

    await expect(page.getByRole('button', { name: /ver resumen/i })).toBeDisabled();
  });

  test('muestra mensaje amigable cuando el club no tiene horarios disponibles', async ({
    page,
  }) => {
    await mockSlots(page, []);
    await login(page);
    await gotoCreateMatch(page);
    await selectFirstClubAndContinue(page);

    await expect(page.getByText(/no hay horarios disponibles/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /continuar/i })).toBeDisabled();
  });

  test('muestra errores de carga de horarios sin romper el wizard', async ({ page }) => {
    await mockSlots(page, [], 'No pudimos cargar horarios del club');
    await login(page);
    await gotoCreateMatch(page);
    await selectFirstClubAndContinue(page);

    await expect(page.getByRole('alert')).toContainText(/no pudimos cargar horarios/i);
    await expect(page.getByRole('button', { name: /continuar/i })).toBeDisabled();
  });

  test('deshabilita formatos que superan el maxFormat de la cancha', async ({ page }) => {
    await mockSlots(page, [
      {
        ...DEFAULT_SLOT,
        court: { ...DEFAULT_SLOT.court, maxFormat: 'FIVE_VS_FIVE' },
      },
    ]);
    await login(page);
    await gotoCreateMatch(page);
    await selectFirstClubAndContinue(page);
    await selectDefaultSlotAndContinue(page);

    await expect(page.getByRole('button', { name: /^5v5/i })).toBeEnabled();
    await expect(page.getByRole('button', { name: /^7v7/i })).toBeDisabled();
    await expect(page.getByRole('button', { name: /^10v10/i })).toBeDisabled();
    await expect(page.getByRole('button', { name: /^11v11/i })).toBeDisabled();
    await expect(page.getByText(/no compatible/i)).toHaveCount(3);
  });

  test('limita la capacidad entre el minimo y el maximo del formato elegido', async ({
    page,
  }) => {
    await login(page);
    await gotoCreateMatch(page);
    await selectFirstClubAndContinue(page);
    await selectDefaultSlotAndContinue(page);

    await page.getByRole('button', { name: /^7v7/i }).click();
    const capacity = page.getByRole('spinbutton', { name: /cantidad de jugadores/i });

    await capacity.fill('99');
    await expect(capacity).toHaveValue('14');

    await capacity.fill('1');
    await expect(capacity).toHaveValue('4');
  });

  test('crea el partido con descripcion opcional, envia el payload esperado y redirige al detalle', async ({
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

    await login(page);
    await gotoCreateMatch(page);
    await selectFirstClubAndContinue(page);
    const date = await page.getByLabel(/fecha del partido/i).inputValue();
    await selectDefaultSlotAndContinue(page);
    await selectFormatAndOpenSummary(page);

    await page
      .getByLabel(/descripci/i)
      .fill('Partido amistoso de prueba E2E, nivel intermedio.');
    await page.getByRole('button', { name: /^crear partido$/i }).click();

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
      slotId: DEFAULT_SLOT.id,
      courtId: DEFAULT_SLOT.court.id,
      date,
      format: 'SEVEN_VS_SEVEN',
      capacity: 10,
      description: 'Partido amistoso de prueba E2E, nivel intermedio.',
    });
    await expect(page).toHaveURL(/\/partidos\/match-e2e-ok$/);
  });

  test('no envia la mutation cuando la descripcion supera 500 caracteres', async ({ page }) => {
    const create = await mockCreateMatch(page, { ok: true });

    await login(page);
    await gotoCreateMatch(page);
    await selectFirstClubAndContinue(page);
    await selectDefaultSlotAndContinue(page);
    await selectFormatAndOpenSummary(page);

    await page.getByLabel(/descripci/i).fill('x'.repeat(501));

    await expect(page.getByText('501/500')).toBeVisible();
    await expect(page.getByRole('button', { name: /^crear partido$/i })).toBeDisabled();
    expect(create.payloads).toHaveLength(0);
  });

  test('muestra error cuando el backend rechaza un slot bloqueado', async ({ page }) => {
    await mockCreateMatch(page, {
      ok: false,
      message: 'El horario ya esta bloqueado. Elegi otro horario.',
      graphQLError: true,
    });

    await login(page);
    await gotoCreateMatch(page);
    await selectFirstClubAndContinue(page);
    await selectDefaultSlotAndContinue(page);
    await selectFormatAndOpenSummary(page);

    await page.getByRole('button', { name: /^crear partido$/i }).click();

    await expect(page.getByRole('alert')).toContainText(/horario ya esta bloqueado/i);
    await expect(page).toHaveURL(/\/partidos\/crear$/);
  });

  test('muestra error cuando el backend rechaza un formato incompatible con la cancha', async ({
    page,
  }) => {
    await mockCreateMatch(page, {
      ok: false,
      message: 'La cancha seleccionada no soporta el formato elegido.',
    });

    await login(page);
    await gotoCreateMatch(page);
    await selectFirstClubAndContinue(page);
    await selectDefaultSlotAndContinue(page);
    await selectFormatAndOpenSummary(page);

    await page.getByRole('button', { name: /^crear partido$/i }).click();

    await expect(page.getByRole('alert')).toContainText(/no soporta el formato/i);
    await expect(page).toHaveURL(/\/partidos\/crear$/);
  });
});
