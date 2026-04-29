import { expect, test, type Page, type Route } from '@playwright/test';

/**
 * Tests E2E de la vista de partidos en mapa (/partidos).
 *
 * Decision Context:
 * - Mockeamos /api/graphql para desacoplar los tests del seed de Supabase y poder
 *   cubrir bordes: lista vacia, partidos sin coordenadas, FULL devuelto por error
 *   del backend y errores GraphQL.
 * - Mockeamos tiles/iconos externos de Leaflet con un PNG minimo. Estos tests no
 *   validan OpenStreetMap/CDN, solo que nuestra UI monte Leaflet, cree marcadores y
 *   popups con el contrato correcto.
 * - No hacemos login: /partidos es publico y la historia de mapa no depende de
 *   autenticacion. Esto evita acoplar los tests a credenciales reales.
 * - Capturamos las queries GraphQL para comprobar que GetMatchesWithCoords no se
 *   dispara hasta elegir la vista Mapa, cubriendo el lazy-load esperado.
 */

const FRONTEND_URL = 'http://localhost:4321';
const MATCHES_URL = `${FRONTEND_URL}/partidos`;
// Cubre tanto el proxy del frontend (/api/graphql) como PUBLIC_GRAPHQL_URL directo
// al backend (/graphql), sin interceptar imports de Vite como /src/graphql/...
const GRAPHQL_ROUTE = /https?:\/\/[^/]+\/(?:api\/)?graphql(?:\?.*)?$/;
const TRANSPARENT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
  'base64',
);

type MockMatch = {
  __typename?: 'Match';
  id: string;
  title: string;
  startTime: string;
  format: 'FIVE_VS_FIVE' | 'SEVEN_VS_SEVEN' | 'TEN_VS_TEN' | 'ELEVEN_VS_ELEVEN';
  totalSlots: number;
  availableSlots: number;
  status: 'OPEN' | 'FULL' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  club: {
    __typename?: 'Club';
    name: string;
    zone: string | null;
    address?: string | null;
    lat?: number | null;
    lng?: number | null;
  } | null;
};

type GraphQLRequest = {
  operationName?: string | null;
  query?: string | null;
  variables?: unknown;
};

function buildMatch(overrides: Partial<MockMatch> = {}): MockMatch {
  return {
    __typename: 'Match',
    id: 'match-default',
    title: 'F5 en Montevideo',
    startTime: '2026-05-02T20:00:00Z',
    format: 'FIVE_VS_FIVE',
    totalSlots: 10,
    availableSlots: 4,
    status: 'OPEN',
    club: {
      __typename: 'Club',
      name: 'Club Centro',
      zone: 'Centro',
      address: '18 de Julio 1234',
      lat: -34.905,
      lng: -56.191,
    },
    ...overrides,
  };
}

function readGraphQLRequest(route: Route): GraphQLRequest {
  const request = route.request();
  const postData = request.postData();

  if (postData) {
    try {
      return JSON.parse(postData) as GraphQLRequest;
    } catch {
      return { query: postData };
    }
  }

  const url = new URL(request.url());
  const variables = url.searchParams.get('variables');

  return {
    operationName: url.searchParams.get('operationName'),
    query: url.searchParams.get('query'),
    variables: variables ? JSON.parse(variables) : undefined,
  };
}

async function mockLeafletAssets(page: Page): Promise<void> {
  const fulfillImage = async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: TRANSPARENT_PNG,
    });
  };

  await page.route(/https:\/\/[abc]\.tile\.openstreetmap\.org\/.*/, fulfillImage);
  await page.route(
    /https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/leaflet\/1\.9\.4\/images\/.*/,
    fulfillImage,
  );
}

async function mockMatchesQuery(
  page: Page,
  matches: MockMatch[],
  requests: GraphQLRequest[] = [],
): Promise<GraphQLRequest[]> {
  await page.unroute(GRAPHQL_ROUTE).catch(() => undefined);
  await page.route(GRAPHQL_ROUTE, async (route: Route) => {
    requests.push(readGraphQLRequest(route));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { matches } }),
    });
  });

  return requests;
}

async function mockMatchesError(page: Page, message = 'Error al cargar partidos'): Promise<void> {
  await page.unroute(GRAPHQL_ROUTE).catch(() => undefined);
  await page.route(GRAPHQL_ROUTE, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ errors: [{ message }] }),
    });
  });
}

async function gotoMatchesPage(page: Page): Promise<void> {
  await page.goto(MATCHES_URL);
  await page.locator('.matches-section').scrollIntoViewIfNeeded();
  await expect(page.getByRole('button', { name: /lista/i })).toBeVisible();
}

async function waitForListToHydrate(page: Page): Promise<void> {
  await expect
    .poll(async () => {
      const text = await page.locator('main').innerText();
      return /No hay partidos disponibles|Error|jugadores/i.test(text);
    })
    .toBe(true);
}

async function switchToMap(page: Page): Promise<void> {
  await page.getByRole('button', { name: /mapa/i }).click();
  await expect(page.getByRole('button', { name: /mapa/i })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
}

test.describe('Vista mapa de partidos (/partidos)', () => {
  test.beforeEach(async ({ page }) => {
    await mockLeafletAssets(page);
  });

  test('arranca en lista y carga la query con coordenadas recien al elegir Mapa', async ({
    page,
  }) => {
    const requests: GraphQLRequest[] = [];
    await mockMatchesQuery(page, [buildMatch()], requests);

    await gotoMatchesPage(page);
    await waitForListToHydrate(page);

    await expect(page.getByRole('button', { name: /lista/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.locator('.leaflet-container')).toHaveCount(0);
    expect(requests.some((request) => request.query?.includes('GetMatchesWithCoords'))).toBe(
      false,
    );

    await switchToMap(page);

    await expect(page.locator('.leaflet-container')).toBeVisible();
    await expect(page.locator('.leaflet-marker-icon')).toHaveCount(1);
    await expect
      .poll(() => requests.some((request) => request.query?.includes('GetMatchesWithCoords')))
      .toBe(true);
    expect(
      requests.some((request) =>
        JSON.stringify(request.variables ?? {}).includes('"status":"OPEN"'),
      ),
    ).toBe(true);
  });

  test('muestra un marcador por partido abierto con coordenadas y popup de detalle', async ({
    page,
  }) => {
    await mockMatchesQuery(page, [
      buildMatch({
        id: 'open-parque-rodo',
        title: 'F7 en Parque Rodo',
        format: 'SEVEN_VS_SEVEN',
        totalSlots: 14,
        availableSlots: 6,
        club: {
          name: 'Club Parque Rodo',
          zone: 'Centro',
          address: 'Bulevar Artigas 1000',
          lat: -34.913,
          lng: -56.164,
        },
      }),
      buildMatch({
        id: 'open-prado',
        title: 'F5 en Prado',
        club: {
          name: 'Club Prado',
          zone: 'Norte',
          address: 'Agraciada 3000',
          lat: -34.865,
          lng: -56.215,
        },
      }),
      buildMatch({
        id: 'full-con-coords',
        title: 'Partido lleno con coordenadas',
        status: 'FULL',
        availableSlots: 0,
        club: {
          name: 'Club Completo',
          zone: 'Sur',
          address: 'Rambla 1',
          lat: -34.92,
          lng: -56.17,
        },
      }),
      buildMatch({
        id: 'open-sin-coords',
        title: 'F5 sin mapa',
        club: {
          name: 'Club Sin Coordenadas',
          zone: 'Este',
          address: 'Camino sin numero',
          lat: null,
          lng: null,
        },
      }),
    ]);

    await gotoMatchesPage(page);
    await waitForListToHydrate(page);
    await switchToMap(page);

    const markers = page.locator('.leaflet-marker-icon');
    await expect(markers).toHaveCount(2);

    await markers.first().click();
    const popup = page.locator('.leaflet-popup');

    await expect(popup).toContainText('Club Parque Rodo');
    await expect(popup).toContainText('Bulevar Artigas 1000');
    await expect(popup).toContainText('7v7');
    await expect(popup).toContainText('8/14 jugadores');
    await expect(popup.getByRole('link', { name: /ver detalle/i })).toHaveAttribute(
      'href',
      '/partidos/open-parque-rodo',
    );
  });

  test('muestra empty-state cuando no hay partidos abiertos', async ({ page }) => {
    await mockMatchesQuery(page, []);

    await gotoMatchesPage(page);
    await waitForListToHydrate(page);
    await switchToMap(page);

    await expect(page.locator('.leaflet-container')).toBeVisible();
    await expect(page.locator('.leaflet-marker-icon')).toHaveCount(0);
    await expect(page.locator('.match-map-empty-msg')).toHaveText(/No hay partidos disponibles/i);
  });

  test('si hay partidos pero ninguno tiene coordenadas, no crea marcadores', async ({ page }) => {
    const warnings: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'warning') warnings.push(message.text());
    });

    await mockMatchesQuery(page, [
      buildMatch({
        id: 'sin-lat',
        title: 'F5 sin latitud',
        club: {
          name: 'Club Sin Latitud',
          zone: 'Centro',
          address: 'Direccion 1',
          lat: null,
          lng: -56.19,
        },
      }),
      buildMatch({
        id: 'sin-lng',
        title: 'F5 sin longitud',
        club: {
          name: 'Club Sin Longitud',
          zone: 'Norte',
          address: 'Direccion 2',
          lat: -34.9,
          lng: null,
        },
      }),
    ]);

    await gotoMatchesPage(page);
    await waitForListToHydrate(page);
    await switchToMap(page);

    await expect(page.locator('.leaflet-container')).toBeVisible();
    await expect(page.locator('.leaflet-marker-icon')).toHaveCount(0);
    await expect(page.locator('.match-map-empty-msg')).toHaveText(
      /No hay partidos con ubicaci.n disponible/i,
    );
    await expect
      .poll(() => warnings.filter((warning) => warning.includes('Club sin coordenadas')).length)
      .toBeGreaterThanOrEqual(2);
  });

  test('aplica los filtros compartidos al mapa', async ({ page }) => {
    await mockMatchesQuery(page, [
      buildMatch({
        id: 'centro',
        title: 'F5 en Montevideo',
        club: {
          name: 'Club Centro',
          zone: 'Centro',
          address: '18 de Julio 1234',
          lat: -34.905,
          lng: -56.191,
        },
      }),
      buildMatch({
        id: 'lagomar',
        title: 'F7 cerca de la costa',
        format: 'SEVEN_VS_SEVEN',
        club: {
          name: 'Club Lagomar',
          zone: 'Este',
          address: 'Av. Giannattasio km 21',
          lat: -34.839,
          lng: -55.978,
        },
      }),
    ]);

    await gotoMatchesPage(page);
    await expect(page.getByText('F5 en Montevideo')).toBeVisible();
    await expect(page.getByText('F7 cerca de la costa')).toBeVisible();

    await page.getByPlaceholder(/buscar partido o club/i).fill('Lagomar');
    await expect(page.getByText('F7 cerca de la costa')).toBeVisible();
    await expect(page.getByText('F5 en Montevideo')).not.toBeVisible();

    await switchToMap(page);

    const markers = page.locator('.leaflet-marker-icon');
    await expect(markers).toHaveCount(1);
    await markers.first().click();
    await expect(page.locator('.leaflet-popup')).toContainText('Club Lagomar');
    await expect(page).toHaveURL(/search=Lagomar/);
  });

  test('muestra el error GraphQL dentro de la vista mapa', async ({ page }) => {
    await mockMatchesError(page, 'Server on fire');

    await gotoMatchesPage(page);
    await waitForListToHydrate(page);
    await switchToMap(page);

    await expect(page.locator('.match-map-loading')).toContainText('Server on fire');
    await expect(page.locator('.leaflet-container')).toHaveCount(0);
  });

  test('expone el control de geolocalizacion cuando el navegador lo soporta', async ({
    page,
    context,
  }) => {
    await context.setGeolocation({ latitude: -34.9011, longitude: -56.1645 });
    await context.grantPermissions(['geolocation'], { origin: FRONTEND_URL });
    await mockMatchesQuery(page, [buildMatch()]);

    await gotoMatchesPage(page);
    await waitForListToHydrate(page);
    await switchToMap(page);

    const locationButton = page.getByTitle(/centrar en mi ubicaci.n/i);
    await expect(locationButton).toBeVisible();
    await locationButton.click();
    await expect(page.getByText(/No se pudo obtener tu ubicaci.n/i)).not.toBeVisible();
  });
});
