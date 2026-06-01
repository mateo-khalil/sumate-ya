import {
  buildMatch,
  expect,
  FRONTEND_URL,
  GRAPHQL_ANY_ROUTE,
  mockGraphQLAll,
  mockLeafletAssets,
  test,
} from './support';

/**
 * Tests E2E de la vista de partidos en mapa (/partidos).
 *
 * Decision Context:
 * - Mockeamos `/api/graphql` (proxy y backend directo) para desacoplar los tests
 *   del seed de Supabase y cubrir bordes (lista vacía, sin coordenadas, FULL,
 *   errores GraphQL).
 * - Mockeamos tiles/iconos externos de Leaflet con un PNG mínimo. Estos tests no
 *   validan OpenStreetMap/CDN, sólo que la UI monte Leaflet, cree marcadores y
 *   popups con el contrato correcto.
 * - No hacemos login: /partidos es público y la historia de mapa no depende de
 *   autenticación. Esto evita acoplar los tests a credenciales.
 * - Capturamos las queries GraphQL para comprobar que `GetMatchesWithCoords`
 *   no se dispara hasta elegir la vista Mapa (lazy-load esperado).
 */

test.describe('Vista mapa de partidos (/partidos)', () => {
  test.beforeEach(async ({ page }) => {
    await mockLeafletAssets(page);
  });

  test('arranca en lista y carga la query con coordenadas recien al elegir Mapa', async ({
    matchesMapPage,
    page,
  }) => {
    const tracker = await mockGraphQLAll(page, GRAPHQL_ANY_ROUTE, {
      // MatchMap only renders a marker for clubs WITH coordinates (clubs without
      // lat/lng are filtered out), so the default buildMatch() club must carry coords.
      data: { matches: [buildMatch({ club: { name: 'Club Test', zone: 'Centro', address: 'Test 123', lat: -34.9011, lng: -56.1645 } })] },
    });

    await matchesMapPage.goto();
    await matchesMapPage.waitForListHydration();

    await expect(matchesMapPage.listToggle).toHaveAttribute('aria-pressed', 'true');
    await expect(matchesMapPage.mapContainer).toHaveCount(0);
    expect(tracker.requests.some((r) => r.query?.includes('GetMatchesWithCoords'))).toBe(false);

    await matchesMapPage.switchToMap();

    await expect(matchesMapPage.mapContainer).toBeVisible();
    await expect(matchesMapPage.markers).toHaveCount(1);
    await expect
      .poll(() => tracker.requests.some((r) => r.query?.includes('GetMatchesWithCoords')))
      .toBe(true);
    expect(
      tracker.requests.some((r) => JSON.stringify(r.variables ?? {}).includes('"status":"OPEN"')),
    ).toBe(true);
  });

  test('muestra un marcador por partido abierto con coordenadas y popup de detalle', async ({
    matchesMapPage,
    page,
  }) => {
    await mockGraphQLAll(page, GRAPHQL_ANY_ROUTE, {
      data: {
        matches: [
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
        ],
      },
    });

    await matchesMapPage.goto();
    await matchesMapPage.waitForListHydration();
    await matchesMapPage.switchToMap();

    await expect(matchesMapPage.markers).toHaveCount(2);

    await matchesMapPage.markers.first().click();
    await expect(matchesMapPage.popup).toContainText('Club Parque Rodo');
    await expect(matchesMapPage.popup).toContainText('Bulevar Artigas 1000');
    await expect(matchesMapPage.popup).toContainText('7v7');
    await expect(matchesMapPage.popup).toContainText('8/14 jugadores');
    await expect(matchesMapPage.popup.getByRole('link', { name: /ver detalle/i })).toHaveAttribute(
      'href',
      '/partidos/open-parque-rodo',
    );
  });

  test('muestra empty-state cuando no hay partidos abiertos', async ({ matchesMapPage, page }) => {
    await mockGraphQLAll(page, GRAPHQL_ANY_ROUTE, { data: { matches: [] } });

    await matchesMapPage.goto();
    await matchesMapPage.waitForListHydration();
    await matchesMapPage.switchToMap();

    await expect(matchesMapPage.mapContainer).toBeVisible();
    await expect(matchesMapPage.markers).toHaveCount(0);
    await expect(matchesMapPage.emptyMessage).toHaveText(/No hay partidos disponibles/i);
  });

  test('si hay partidos pero ninguno tiene coordenadas, no crea marcadores', async ({
    matchesMapPage,
    page,
  }) => {
    const warnings: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'warning') warnings.push(message.text());
    });

    await mockGraphQLAll(page, GRAPHQL_ANY_ROUTE, {
      data: {
        matches: [
          buildMatch({
            id: 'sin-lat',
            title: 'F5 sin latitud',
            club: { name: 'Club Sin Latitud', zone: 'Centro', lat: null, lng: -56.19 },
          }),
          buildMatch({
            id: 'sin-lng',
            title: 'F5 sin longitud',
            club: { name: 'Club Sin Longitud', zone: 'Norte', lat: -34.9, lng: null },
          }),
        ],
      },
    });

    await matchesMapPage.goto();
    await matchesMapPage.waitForListHydration();
    await matchesMapPage.switchToMap();

    await expect(matchesMapPage.mapContainer).toBeVisible();
    await expect(matchesMapPage.markers).toHaveCount(0);
    await expect(matchesMapPage.emptyMessage).toHaveText(
      /No hay partidos con ubicaci.n disponible/i,
    );
    await expect
      .poll(() => warnings.filter((w) => w.includes('Club sin coordenadas')).length)
      .toBeGreaterThanOrEqual(2);
  });

  test('aplica los filtros compartidos al mapa', async ({ matchesMapPage, page }) => {
    await mockGraphQLAll(page, GRAPHQL_ANY_ROUTE, {
      data: {
        matches: [
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
        ],
      },
    });

    await matchesMapPage.goto();
    await expect(page.getByText('F5 en Montevideo')).toBeVisible();
    await expect(page.getByText('F7 cerca de la costa')).toBeVisible();

    await matchesMapPage.searchInput.fill('Lagomar');
    await expect(page.getByText('F7 cerca de la costa')).toBeVisible();
    await expect(page.getByText('F5 en Montevideo')).not.toBeVisible();

    await matchesMapPage.switchToMap();

    await expect(matchesMapPage.markers).toHaveCount(1);
    await matchesMapPage.markers.first().click();
    await expect(matchesMapPage.popup).toContainText('Club Lagomar');
    await expect(page).toHaveURL(/search=Lagomar/);
  });

  test('muestra el error GraphQL dentro de la vista mapa', async ({ matchesMapPage, page }) => {
    await mockGraphQLAll(page, GRAPHQL_ANY_ROUTE, {
      errors: [{ message: 'Server on fire' }],
    });

    await matchesMapPage.goto();
    await matchesMapPage.waitForListHydration();
    await matchesMapPage.switchToMap();

    await expect(page.locator('.match-map-loading')).toContainText('Server on fire');
    await expect(matchesMapPage.mapContainer).toHaveCount(0);
  });

  test('expone el control de geolocalizacion cuando el navegador lo soporta', async ({
    matchesMapPage,
    context,
    page,
  }) => {
    await context.setGeolocation({ latitude: -34.9011, longitude: -56.1645 });
    await context.grantPermissions(['geolocation'], { origin: FRONTEND_URL });
    // The geolocation control only renders on a populated map; an empty map (no
    // clubs with coords) falls back to EmptyMap which has no controls. Give the match
    // a located club so MatchMap (and its "Centrar en mi ubicación" control) renders.
    await mockGraphQLAll(page, GRAPHQL_ANY_ROUTE, {
      data: { matches: [buildMatch({ club: { name: 'Club Test', zone: 'Centro', address: 'Test 123', lat: -34.9011, lng: -56.1645 } })] },
    });

    await matchesMapPage.goto();
    await matchesMapPage.waitForListHydration();
    await matchesMapPage.switchToMap();

    const locationButton = page.getByTitle(/centrar en mi ubicaci.n/i);
    await expect(locationButton).toBeVisible();
    await locationButton.click();
    await expect(page.getByText(/No se pudo obtener tu ubicaci.n/i)).not.toBeVisible();
  });
});
