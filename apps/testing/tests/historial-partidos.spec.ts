import { expect, test, type Page, type Route } from '@playwright/test';

/**
 * Tests E2E del Historial de partidos jugados (sección de /perfil).
 *
 * Decision Context:
 * - La página /perfil es SSR: Astro pide en paralelo `myProfile` y la primera página de
 *   `myMatches` al backend, y le pasa esa data a la React island MatchHistoryList como
 *   `initialData`. NO podemos mockear la primera carga desde el browser (page.route()
 *   sólo intercepta requests que salen del navegador).
 * - El botón "Cargar más", en cambio, dispara `fetch` desde la island al endpoint
 *   /graphql del backend → SÍ es mockeable. Aprovechamos eso para los tests de
 *   loading/error/append.
 * - Adaptive design: ricardo (player de prueba) probablemente tenga 0 partidos
 *   completados → para los tests del empty state alcanza con eso. Para los tests que
 *   requieren cards renderizadas, miramos lo que la DB devuelva en el SSR y skipeamos
 *   con mensaje claro si no hay data.
 * - El test de "Cargar más" requiere que initialData.hasMore=true (si no, el botón ni
 *   aparece). Eso depende de tener > pageSize partidos completados en la cuenta.
 * - Assumptions:
 *   * Frontend en :4321 y backend en :4000.
 *   * Player de prueba: ricardo@gmail.com / bbbb1234.
 *   * El middleware redirige /perfil a /login si no hay cookie de auth.
 * - Previously fixed bugs: none relevant.
 */

const FRONTEND_URL = 'http://localhost:4321';
const BACKEND_GRAPHQL_ROUTE = '**/graphql';
const PERFIL_URL = `${FRONTEND_URL}/perfil`;

const TEST_PLAYER = {
  email: 'ricardo@gmail.com',
  password: 'bbbb1234',
};

async function login(page: Page): Promise<void> {
  await page.goto(`${FRONTEND_URL}/login`);
  await page.getByRole('textbox', { name: 'Email' }).fill(TEST_PLAYER.email);
  await page.getByRole('textbox', { name: /contrase/i }).fill(TEST_PLAYER.password);
  await page.getByRole('button', { name: /ingresar/i }).click();
  await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 10_000 });
}

/**
 * Mockea SOLO la query `myMatches` (la usa "Cargar más"). Deja pasar el resto del
 * tráfico GraphQL — incluyendo la primera carga del SSR, que va por el server de
 * Astro y no por el browser.
 */
async function mockMyMatchesQuery(
  page: Page,
  body: unknown,
  options: { delayMs?: number } = {},
): Promise<{ payloads: unknown[] }> {
  const payloads: unknown[] = [];

  await page.route(BACKEND_GRAPHQL_ROUTE, async (route: Route) => {
    const raw = route.request().postData() ?? '{}';
    const parsed = JSON.parse(raw) as { query?: string };

    if (!parsed.query?.includes('myMatches')) {
      await route.continue();
      return;
    }

    payloads.push(parsed);
    if (options.delayMs) {
      await new Promise((resolve) => setTimeout(resolve, options.delayMs));
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });

  return { payloads };
}

/**
 * Devuelve la cantidad de cards visibles en el historial. Se usa para detectar si
 * la cuenta tiene partidos jugados o no antes de correr tests adaptativos.
 */
async function countHistoryCards(page: Page): Promise<number> {
  return await page.locator('.history-section article').count();
}

test.describe('Historial de partidos (/perfil → sección Historial)', () => {
  test.describe.configure({ mode: 'serial' });

  test('sin login redirige a /login antes de mostrar el perfil', async ({ page }) => {
    await page.goto(PERFIL_URL);

    // El middleware (PROTECTED_ROUTES incluye '/perfil') debe rebotar a /login.
    await expect(page).toHaveURL(/\/login/);
  });

  test('renderiza el header de la sección "Historial de partidos"', async ({ page }) => {
    await login(page);
    await page.goto(PERFIL_URL);

    // Wait for hidratación de la island (client:visible) — scrolleamos para que entre.
    await page.locator('.history-section').scrollIntoViewIfNeeded();

    await expect(page.getByText('ACTIVIDAD', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /Historial de partidos/i, level: 2 }),
    ).toBeVisible();
  });

  test('el subtítulo refleja la cantidad: "X en total" o "sin partidos aún"', async ({ page }) => {
    await login(page);
    await page.goto(PERFIL_URL);

    const sub = page.locator('.history-section .history-sub');
    await expect(sub).toBeVisible();
    // Una de las dos formas: o cuenta total, o el placeholder.
    await expect(sub).toHaveText(/(\d+ en total|sin partidos aún)/i);
  });

  test('si el player no tiene historial, muestra el empty state con el icono y el mensaje', async ({
    page,
  }) => {
    await login(page);
    await page.goto(PERFIL_URL);
    await page.locator('.history-section').scrollIntoViewIfNeeded();

    const cardsCount = await countHistoryCards(page);
    test.skip(
      cardsCount > 0,
      `El player ${TEST_PLAYER.email} tiene ${cardsCount} partidos en su historial — el empty state no aplica.`,
    );

    await expect(page.getByText(/Aún no tenés partidos jugados/i)).toBeVisible();
    await expect(page.getByText(/aparecerán aquí con el resultado/i)).toBeVisible();
    // Y NO debe haber botón "Cargar más".
    await expect(page.getByRole('button', { name: /cargar más/i })).toHaveCount(0);
  });

  test('si el player tiene partidos, las cards renderizan estructura básica (fecha + formato + resultado)', async ({
    page,
  }) => {
    await login(page);
    await page.goto(PERFIL_URL);
    await page.locator('.history-section').scrollIntoViewIfNeeded();

    const cardsCount = await countHistoryCards(page);
    test.skip(
      cardsCount === 0,
      `El player ${TEST_PLAYER.email} no tiene partidos jugados — no hay cards que validar.`,
    );

    const firstCard = page.locator('.history-section article').first();
    // Cada card tiene un badge de formato (5v5/7v7/10v10/11v11) en el top-right.
    await expect(firstCard.getByText(/^(5v5|7v7|10v10|11v11)$/)).toBeVisible();
    // Y un badge de equipo A o B.
    await expect(firstCard.getByText(/Equipo (A|B)/i)).toBeVisible();
    // Y un badge de resultado (Ganado/Perdido/Empate/Sin resultado).
    await expect(
      firstCard.getByText(/^(Ganado|Perdido|Empate|Sin resultado)$/i),
    ).toBeVisible();
  });

  test('al clickear "Cargar más" la mutation se dispara y aparece el estado loading', async ({
    page,
  }) => {
    await login(page);
    await page.goto(PERFIL_URL);
    await page.locator('.history-section').scrollIntoViewIfNeeded();

    const loadMore = page.getByRole('button', { name: /^cargar más$/i });
    const loadMoreVisible = await loadMore.isVisible().catch(() => false);
    test.skip(
      !loadMoreVisible,
      `El player ${TEST_PLAYER.email} no tiene suficientes partidos para que aparezca "Cargar más" (necesita > pageSize=10).`,
    );

    // Mockeamos la respuesta de la página 2 con 1 item nuevo, para detectar el append.
    const tracker = await mockMyMatchesQuery(
      page,
      {
        data: {
          myMatches: {
            items: [
              {
                id: 'mock-page-2-item',
                title: 'Partido mock pag2',
                startTime: '2026-01-10T20:00:00Z',
                format: 'FIVE_VS_FIVE',
                userTeam: 'A',
                userResult: 'WON',
                scoreA: null,
                scoreB: null,
                isOrganizer: false,
                club: null,
              },
            ],
            total: 11,
            page: 2,
            pageSize: 10,
            hasMore: false,
          },
        },
      },
      { delayMs: 500 },
    );

    const cardsBefore = await countHistoryCards(page);
    await loadMore.click();

    // Estado loading: el botón cambia el texto y queda deshabilitado.
    await expect(page.getByRole('button', { name: /cargando/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /cargando/i })).toBeDisabled();

    // Eventualmente la mutation se ejecuta y appendea el item nuevo.
    await expect.poll(() => tracker.payloads.length, { timeout: 10_000 }).toBe(1);
    await expect.poll(() => countHistoryCards(page), { timeout: 5_000 }).toBe(cardsBefore + 1);

    // hasMore=false en el mock → ya no debe estar el botón "Cargar más", aparece el end label.
    await expect(page.getByText(/Mostrando todos tus partidos/i)).toBeVisible();
  });

  test('si "Cargar más" devuelve error, se muestra el mensaje role=alert y el botón vuelve disponible', async ({
    page,
  }) => {
    await login(page);
    await page.goto(PERFIL_URL);
    await page.locator('.history-section').scrollIntoViewIfNeeded();

    const loadMore = page.getByRole('button', { name: /^cargar más$/i });
    const loadMoreVisible = await loadMore.isVisible().catch(() => false);
    test.skip(
      !loadMoreVisible,
      `El player ${TEST_PLAYER.email} no tiene suficientes partidos para que aparezca "Cargar más".`,
    );

    await mockMyMatchesQuery(page, {
      errors: [{ message: 'Falla simulada del backend' }],
    });

    await loadMore.click();

    await expect(page.getByRole('alert')).toContainText(/falla simulada del backend/i);
    // El botón vuelve a su estado inicial (no se queda en loading).
    await expect(page.getByRole('button', { name: /^cargar más$/i })).toBeEnabled();
  });
});
