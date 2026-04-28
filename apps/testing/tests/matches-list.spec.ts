import { test, expect, type Page, type Route } from '@playwright/test';


const FRONTEND_URL = 'http://localhost:4321';
// Regex path-only: matchea `/graphql` con cualquier host/puerto y opcionalmente
// una querystring (urql arma queries con `?query=...&operationName=...`).
// Usamos regex en lugar de glob porque Playwright ignora la querystring al matchear
// globs, pero aún así queremos ser explícitos y robustos ante cambios de host.
const GRAPHQL_ROUTE = /\/graphql(?:\?|$)/;

const TEST_USER = {
  email: 'mateoduran2010@gmail.com',
  password: 'Hola1234',
};

type MockMatch = {
  __typename?: string;
  id: string;
  title: string;
  startTime: string;
  format: 'FIVE_VS_FIVE' | 'SEVEN_VS_SEVEN' | 'TEN_VS_TEN' | 'ELEVEN_VS_ELEVEN';
  totalSlots: number;
  availableSlots: number;
  status: 'OPEN' | 'FULL' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  club: { __typename?: string; name: string; zone: string | null } | null;
};

function buildMatch(overrides: Partial<MockMatch> = {}): MockMatch {
  return {
    __typename: 'Match',
    id: 'match-default',
    title: 'Partido de prueba',
    startTime: '2026-05-01T20:00:00Z',
    format: 'FIVE_VS_FIVE',
    totalSlots: 10,
    availableSlots: 5,
    status: 'OPEN',
    club: { __typename: 'Club', name: 'Club Test', zone: 'Norte' },
    ...overrides,
  };
}

/**
 * Intercepta el endpoint GraphQL y responde `GetMatches` con la lista provista.
 * Deja pasar cualquier otra operación (si el front dispara más queries en el futuro).
 */
/**
 * Detecta si un request al endpoint `/graphql` corresponde a la operación `GetMatches`.
 * urql envía queries como GET con los parámetros `query`, `operationName` y `variables`
 * en la querystring (ver `@urql/core` fetchExchange) — NO como POST JSON. Por eso
 * necesitamos inspeccionar tanto la URL como el body.
 */
function isGetMatchesRequest(route: Route): boolean {
  const request = route.request();
  const url = new URL(request.url());
  const opName = url.searchParams.get('operationName');
  const query = url.searchParams.get('query');
  if (opName === 'GetMatches') return true;
  if (typeof query === 'string' && query.includes('GetMatches')) return true;

  if (request.method() === 'POST') {
    const body = request.postDataJSON() as
      | { query?: string; operationName?: string }
      | null;
    if (body?.operationName === 'GetMatches') return true;
    if (typeof body?.query === 'string' && body.query.includes('GetMatches')) return true;
  }
  return false;
}

async function mockMatchesQuery(page: Page, matches: MockMatch[]): Promise<void> {
  await page.unroute(GRAPHQL_ROUTE).catch(() => undefined);
  await page.route(GRAPHQL_ROUTE, async (route: Route) => {
    if (!isGetMatchesRequest(route)) {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { matches } }),
    });
  });
}

/** Mockea un error de servidor para el listado. */
async function mockMatchesError(page: Page, message = 'Backend caído'): Promise<void> {
  await page.unroute(GRAPHQL_ROUTE).catch(() => undefined);
  await page.route(GRAPHQL_ROUTE, async (route: Route) => {
    if (!isGetMatchesRequest(route)) {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ errors: [{ message }] }),
    });
  });
}

/**
 * Helper de login — completa el form y espera a que el SSR redirija fuera de /login.
 * Replica el flujo validado por login.spec.ts.
 */
async function login(page: Page): Promise<void> {
  await page.goto(`${FRONTEND_URL}/login`);
  await page.getByRole('textbox', { name: 'Email' }).fill(TEST_USER.email);
  await page.getByRole('textbox', { name: 'Contraseña' }).fill(TEST_USER.password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 10_000 });
}

test.describe('Listado de partidos (/partidos)', () => {
  test.beforeEach(async ({ page }) => {
    // Mock por defecto: lista vacía. Los tests que necesiten data la re-mockean antes de navegar.
    await mockMatchesQuery(page, []);
    await login(page);
  });

  test('renderiza el header y sale del estado de loading', async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/partidos`);

    await expect(page.getByRole('heading', { name: /Partidos Disponibles/i })).toBeVisible();
    // Con la lista mockeada vacía, debe aparecer el empty-state (no quedarse en skeleton).
    await expect(page.getByText('No hay partidos disponibles')).toBeVisible();
  });

  test('muestra los controles de filtros principales', async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/partidos`);

    await expect(page.getByPlaceholder(/Buscar por partido o club/i)).toBeVisible();
    // 3 selects: formato, zona, estado.
    // Scope a `main` para ignorar el Astro dev toolbar (que puede inyectar un <select>).
    await expect(page.locator('main select')).toHaveCount(3);
    await expect(page.getByRole('button', { name: /Más filtros/i })).toBeVisible();
  });

  test('"Más filtros" expande los date pickers y cambia el label del botón', async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/partidos`);

    // Esperar a que MatchList termine el fetch y hidrate antes de clickear — de lo
    // contrario el click llega antes que React enganche el handler y setShowAdvanced
    // nunca se dispara.
    await expect(page.getByText('No hay partidos disponibles')).toBeVisible();

    await page.getByRole('button', { name: /Más filtros/i }).click();

    await expect(page.getByText('Desde:')).toBeVisible();
    await expect(page.getByText('Hasta:')).toBeVisible();
    await expect(page.locator('input[type="date"]')).toHaveCount(2);
    await expect(page.getByRole('button', { name: /Menos filtros/i })).toBeVisible();
  });

  test('al aplicar un filtro aparece "Limpiar" y al clickearlo se resetea la búsqueda', async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/partidos`);

    // Esperamos a que el empty-state (lista vacía mockeada) se renderice — garantiza
    // que MatchList hidrató y los handlers onChange ya están enganchados. Sin esto,
    // el fill() dispara antes de la hidratación y React no actualiza el estado.
    await expect(page.getByText('No hay partidos disponibles')).toBeVisible();

    const search = page.getByPlaceholder(/Buscar por partido o club/i);
    await search.fill('river');

    const clearBtn = page.getByRole('button', { name: /Limpiar/i });
    await expect(clearBtn).toBeVisible();

    await clearBtn.click();
    await expect(search).toHaveValue('');
    await expect(clearBtn).not.toBeVisible();
  });

  test('renderiza cards cuando la query devuelve partidos', async ({ page }) => {
    await mockMatchesQuery(page, [
      buildMatch({ id: '1', title: 'Pickup F5 en Palermo', format: 'FIVE_VS_FIVE' }),
      buildMatch({
        id: '2',
        title: 'F7 nocturno en Núñez',
        format: 'SEVEN_VS_SEVEN',
        club: { name: 'Club Núñez', zone: 'Norte' },
      }),
    ]);

    await page.goto(`${FRONTEND_URL}/partidos`);

    await expect(page.getByText('Pickup F5 en Palermo')).toBeVisible();
    await expect(page.getByText('F7 nocturno en Núñez')).toBeVisible();
    await expect(page.getByText('5v5')).toBeVisible();
    await expect(page.getByText('7v7')).toBeVisible();
    await expect(page.getByText('Club Núñez')).toBeVisible();
    // Hay al menos un botón "Sumarme" habilitado
    await expect(page.getByRole('button', { name: /Sumarme/i }).first()).toBeEnabled();
  });

  test('partido lleno muestra "Completo" con el botón deshabilitado', async ({ page }) => {
    await mockMatchesQuery(page, [
      buildMatch({
        id: 'full-1',
        title: 'Partido lleno',
        totalSlots: 10,
        availableSlots: 0,
      }),
    ]);

    await page.goto(`${FRONTEND_URL}/partidos`);

    const fullBtn = page.getByRole('button', { name: /Completo/i });
    await expect(fullBtn).toBeVisible();
    await expect(fullBtn).toBeDisabled();
    await expect(page.getByText('10/10 jugadores')).toBeVisible();
  });

  test('empty-state muestra mensaje amigable cuando no hay partidos', async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/partidos`);

    await expect(page.getByText('No hay partidos disponibles')).toBeVisible();
    await expect(page.getByText(/Probá con otros filtros/i)).toBeVisible();
  });

  test('muestra mensaje de error cuando la query falla', async ({ page }) => {
    await mockMatchesError(page, 'Server on fire');

    await page.goto(`${FRONTEND_URL}/partidos`);

    await expect(page.getByText('Error').first()).toBeVisible();
    await expect(page.getByText('Server on fire')).toBeVisible();
  });
});
