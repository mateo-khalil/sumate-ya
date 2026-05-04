import type { Page } from '@playwright/test';
import {
  BACKEND_GRAPHQL_ROUTE,
  expect,
  FRONTEND_URL,
  mockGraphQLOperation,
  test,
  TEST_USERS,
} from './support';

/**
 * Tests E2E del Historial de partidos jugados (sección de /perfil).
 *
 * Decision Context:
 * - La página /perfil es SSR: Astro pide `myProfile` y la primera página de
 *   `myMatches` en el servidor y se las pasa a la React island como
 *   `initialData`. NO podemos mockear esa primera carga desde el browser.
 * - El botón "Cargar más" SI dispara fetch desde el browser → mockeable. Lo
 *   aprovechamos para los tests de loading/error/append.
 * - Adaptive design: Ricardo (player de prueba) probablemente tenga 0
 *   partidos completados → para empty state alcanza con eso. Los tests que
 *   requieren cards renderizadas miran lo que la DB devuelva en SSR y skipean
 *   con mensaje claro si no hay data.
 * - El test de "Cargar más" requiere `initialData.hasMore=true`; eso depende
 *   de tener > pageSize partidos completados.
 * - Previously fixed bugs:
 *   - "sin login redirige a /login" fallaba porque el `test.use({ storageState })`
 *     a nivel de archivo se propaga a `browser.newContext()` sin argumentos en
 *     Playwright 1.59 — el contexto "anónimo" arrancaba con la cookie de
 *     Ricardo y el middleware lo dejaba pasar a /perfil. Fix: pasar
 *     `storageState: { cookies: [], origins: [] }` explícitamente para forzar
 *     un contexto realmente vacío.
 */

test.use({ storageState: TEST_USERS.playerRicardo.storageStatePath });

async function countHistoryCards(page: Page): Promise<number> {
  return page.locator('.history-section article').count();
}

test.describe('Historial de partidos (/perfil → sección Historial)', () => {
  test.describe.configure({ mode: 'serial' });

  test('sin login redirige a /login antes de mostrar el perfil', async ({ browser }) => {
    // Override the file-level storageState so this context starts truly anonymous.
    // Playwright 1.59 propagates `test.use({ storageState })` into bare
    // `browser.newContext()` calls; pasar un estado vacío explícito lo bloquea.
    const anonContext = await browser.newContext({
      storageState: { cookies: [], origins: [] },
    });
    const anonPage = await anonContext.newPage();
    try {
      await anonPage.goto(`${FRONTEND_URL}/perfil`);
      await expect(anonPage).toHaveURL(/\/login/);
    } finally {
      await anonContext.close();
    }
  });

  test('renderiza el header de la sección "Historial de partidos"', async ({
    profilePage,
    page,
  }) => {
    await profilePage.goto();
    await profilePage.historySection.scrollIntoViewIfNeeded();

    await expect(page.getByText('ACTIVIDAD', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /Historial de partidos/i, level: 2 }),
    ).toBeVisible();
  });

  test('el subtítulo refleja la cantidad: "X en total" o "sin partidos aún"', async ({
    profilePage,
  }) => {
    await profilePage.goto();

    const sub = profilePage.historySection.locator('.history-sub');
    await expect(sub).toBeVisible();
    await expect(sub).toHaveText(/(\d+ en total|sin partidos aún)/i);
  });

  test('si el player no tiene historial, muestra el empty state', async ({
    profilePage,
    page,
  }) => {
    await profilePage.goto();
    await profilePage.historySection.scrollIntoViewIfNeeded();

    const cards = await countHistoryCards(page);
    test.skip(
      cards > 0,
      `El player Ricardo tiene ${cards} partidos en su historial — el empty state no aplica.`,
    );

    await expect(page.getByText(/Aún no tenés partidos jugados/i)).toBeVisible();
    await expect(page.getByText(/aparecerán aquí con el resultado/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /cargar más/i })).toHaveCount(0);
  });

  test('si el player tiene partidos, las cards renderizan estructura básica', async ({
    profilePage,
    page,
  }) => {
    await profilePage.goto();
    await profilePage.historySection.scrollIntoViewIfNeeded();

    const cards = await countHistoryCards(page);
    test.skip(cards === 0, 'El player Ricardo no tiene partidos jugados — no hay cards que validar.');

    const firstCard = profilePage.historySection.locator('article').first();
    await expect(firstCard.getByText(/^(5v5|7v7|10v10|11v11)$/)).toBeVisible();
    await expect(firstCard.getByText(/Equipo (A|B)/i)).toBeVisible();
    await expect(firstCard.getByText(/^(Ganado|Perdido|Empate|Sin resultado)$/i)).toBeVisible();
  });

  test('al clickear "Cargar más" la mutation se dispara y aparece el estado loading', async ({
    profilePage,
    page,
  }) => {
    await profilePage.goto();
    await profilePage.historySection.scrollIntoViewIfNeeded();

    const loadMore = page.getByRole('button', { name: /^cargar más$/i });
    const loadMoreVisible = await loadMore.isVisible().catch(() => false);
    test.skip(
      !loadMoreVisible,
      'Ricardo no tiene suficientes partidos para que aparezca "Cargar más" (necesita > pageSize=10).',
    );

    const tracker = await mockGraphQLOperation(
      page,
      BACKEND_GRAPHQL_ROUTE,
      'myMatches',
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

    await expect(page.getByRole('button', { name: /cargando/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /cargando/i })).toBeDisabled();

    await expect.poll(() => tracker.payloads.length, { timeout: 10_000 }).toBe(1);
    await expect.poll(() => countHistoryCards(page), { timeout: 5_000 }).toBe(cardsBefore + 1);

    await expect(page.getByText(/Mostrando todos tus partidos/i)).toBeVisible();
  });

  test('si "Cargar más" devuelve error, se muestra el mensaje y el botón vuelve disponible', async ({
    profilePage,
    page,
  }) => {
    await profilePage.goto();
    await profilePage.historySection.scrollIntoViewIfNeeded();

    const loadMore = page.getByRole('button', { name: /^cargar más$/i });
    const loadMoreVisible = await loadMore.isVisible().catch(() => false);
    test.skip(
      !loadMoreVisible,
      'Ricardo no tiene suficientes partidos para que aparezca "Cargar más".',
    );

    await mockGraphQLOperation(page, BACKEND_GRAPHQL_ROUTE, 'myMatches', {
      errors: [{ message: 'Falla simulada del backend' }],
    });

    await loadMore.click();

    await expect(page.getByRole('alert')).toContainText(/falla simulada del backend/i);
    await expect(page.getByRole('button', { name: /^cargar más$/i })).toBeEnabled();
  });
});
