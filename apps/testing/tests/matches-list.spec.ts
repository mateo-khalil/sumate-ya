import {
  buildMatch,
  expect,
  GRAPHQL_PROXY_ROUTE,
  mockGraphQLAll,
  test,
  TEST_USERS,
} from './support';

/**
 * Tests E2E del listado de partidos (/partidos).
 *
 * Decision Context:
 * - Mockeamos `/api/graphql` para no depender del seed de Supabase y mantener
 *   los tests deterministas — interceptamos toda la query `matches`.
 * - Usamos storage state pre-autenticado (player Mateo) producido por
 *   `auth.setup.ts` en lugar de hacer login real en el `beforeEach`. Eso
 *   evita el costo de un POST SSR + redirect por cada test del describe.
 * - Scope `main` en selectores: el Astro dev toolbar inyecta un `<select>` que
 *   contamina el conteo global; la PO `MatchesListPage` ya scopea por `main`.
 * - Previously fixed bugs: ver MatchesListPage decision context (strict-mode
 *   con "Ver detalle", conteos de selects).
 */

test.use({ storageState: TEST_USERS.playerMateo.storageStatePath });

test.describe('Listado de partidos (/partidos)', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    // Mock por defecto: lista vacía. Tests que necesiten data lo re-mockean antes de navegar.
    await mockGraphQLAll(page, GRAPHQL_PROXY_ROUTE, { data: { matches: [] } });
  });

  test('renderiza el header y sale del estado de loading', async ({ matchesPage }) => {
    await matchesPage.goto();

    await expect(matchesPage.heading).toBeVisible();
    await expect(matchesPage.emptyState).toBeVisible();
  });

  test('muestra los controles de filtros principales', async ({ matchesPage, page }) => {
    await matchesPage.goto();

    await expect(matchesPage.searchInput).toBeVisible();
    await expect(page.locator('main select')).toHaveCount(3);
    await expect(page.locator('main input[type="date"]')).toHaveCount(2);
    await expect(matchesPage.clearButton).toBeVisible();
  });

  test('los date pickers de rango de fecha estan visibles por defecto', async ({
    matchesPage,
    page,
  }) => {
    // Decision Context: el filtro avanzado dejó de estar oculto detrás de "Más filtros";
    // los date pickers ahora viven junto al botón "Limpiar".
    await matchesPage.goto();
    await matchesPage.expectListSettled();

    const dateInputs = page.locator('main input[type="date"]');
    await expect(dateInputs).toHaveCount(2);
    await expect(dateInputs.first()).toBeVisible();
    await expect(dateInputs.nth(1)).toBeVisible();
  });

  test('al aplicar un filtro aparece "Limpiar" y al clickearlo se resetea la búsqueda', async ({
    matchesPage,
  }) => {
    await matchesPage.goto();
    await matchesPage.expectListSettled();

    await matchesPage.searchInput.fill('river');
    await matchesPage.expectClearState('enabled');

    await matchesPage.clearButton.click();
    await expect(matchesPage.searchInput).toHaveValue('');
    await matchesPage.expectClearState('disabled');
  });

  test('renderiza cards cuando la query devuelve partidos', async ({ matchesPage, page }) => {
    await mockGraphQLAll(page, GRAPHQL_PROXY_ROUTE, {
      data: {
        matches: [
          buildMatch({ id: '1', title: 'Pickup F5 en Palermo', format: 'FIVE_VS_FIVE' }),
          buildMatch({
            id: '2',
            title: 'F7 nocturno en Núñez',
            format: 'SEVEN_VS_SEVEN',
            club: { name: 'Club Núñez', zone: 'Norte' },
          }),
        ],
      },
    });

    await matchesPage.goto();

    await expect(matchesPage.card('Pickup F5 en Palermo')).toBeVisible();
    await expect(matchesPage.card('F7 nocturno en Núñez')).toBeVisible();
    await expect(page.getByText('5v5')).toBeVisible();
    await expect(page.getByText('7v7')).toBeVisible();
    await expect(page.getByText('Club Núñez')).toBeVisible();
    await expect(page.getByRole('button', { name: /Sumarme/i }).first()).toBeEnabled();
  });

  test('partido lleno muestra badge "Completo" y CTA "Ver detalle" navega al detalle', async ({
    matchesPage,
    page,
  }) => {
    // Decision Context: para partidos llenos el card sigue siendo accionable. El CTA
    // pasa a "Ver detalle" para que el usuario pueda abrir el detalle y ver quiénes
    // están anotados antes de decidir si esperar un cupo.
    // Previously fixed bugs: el CTA anterior era un botón disabled "Completo" — los
    // usuarios no podían abrir el detalle de un partido 10/10 desde el listado.
    // Decision Context: el id DEBE ser un UUID válido. El SSR de /partidos/[id]
    // valida el formato y redirige a /partidos cuando no matchea — usar 'full-1'
    // hacía que la assertion de URL fallara.
    const FULL_MATCH_ID = '00000000-0000-0000-0000-00000000fff1';
    await mockGraphQLAll(page, GRAPHQL_PROXY_ROUTE, {
      data: {
        matches: [
          buildMatch({
            id: FULL_MATCH_ID,
            title: 'Partido lleno',
            totalSlots: 10,
            availableSlots: 0,
          }),
        ],
      },
    });

    await matchesPage.goto();

    await expect(page.getByText('Completo').first()).toBeVisible();
    await expect(page.getByText('10/10 jugadores')).toBeVisible();

    const detailBtn = matchesPage.detailButton();
    await expect(detailBtn).toBeVisible();
    await detailBtn.click();
    await expect(page).toHaveURL(new RegExp(`/partidos/${FULL_MATCH_ID}$`));
  });

  test('partido lleno: clickear el card también navega al detalle', async ({
    matchesPage,
    page,
  }) => {
    const FULL_MATCH_ID = '00000000-0000-0000-0000-00000000fff2';
    await mockGraphQLAll(page, GRAPHQL_PROXY_ROUTE, {
      data: {
        matches: [
          buildMatch({
            id: FULL_MATCH_ID,
            title: 'Otro partido lleno',
            totalSlots: 10,
            availableSlots: 0,
          }),
        ],
      },
    });

    await matchesPage.goto();
    await matchesPage.card('Otro partido lleno').click();
    await expect(page).toHaveURL(new RegExp(`/partidos/${FULL_MATCH_ID}$`));
  });

  test('empty-state muestra mensaje amigable cuando no hay partidos', async ({
    matchesPage,
    page,
  }) => {
    await matchesPage.goto();

    await expect(matchesPage.emptyState).toBeVisible();
    // Subtítulo varía con/sin filtros activos; matcheamos las dos variantes.
    await expect(
      page.getByText(/Volvé más tarde|ajustando la búsqueda|otros filtros/i),
    ).toBeVisible();
  });

  test('muestra mensaje de error cuando la query falla', async ({ matchesPage, page }) => {
    await mockGraphQLAll(page, GRAPHQL_PROXY_ROUTE, {
      errors: [{ message: 'Server on fire' }],
    });

    await matchesPage.goto();

    await expect(page.getByText('Error').first()).toBeVisible();
    // The unified /partidos also renders the Torneos tab's TournamentList, which gets
    // the same mocked error — so "Server on fire" appears twice (matches + tournaments
    // error panels). Scope to the first (matches) panel.
    await expect(page.getByText('Server on fire').first()).toBeVisible();
  });

  // Decision Context: "Mostrar cancelados" es un toggle autenticado y opt-in. Por defecto
  // los partidos cancelados quedan ocultos: la query primaria es OPEN y filterMatches del
  // cliente descarta el row CANCELLED (status !== OPEN, showCancelled=false), así que se ve
  // el empty-state. Al activarlo, MatchList dispara una segunda query con
  // {status: CANCELLED, onlyMine: true}; como mockGraphQLAll responde el mismo body a toda
  // operación `matches`, el row cancelado se mergea y filterMatches lo conserva → aparece la
  // card atenuada con badge "Cancelado". Esto valida el flujo extremo a extremo sin depender
  // del seed. Usa el storageState de playerMateo (autenticado) para que el toggle se renderice.
  test('toggle "Mostrar cancelados" revela los cancelados, ocultos por defecto', async ({
    matchesPage,
    page,
  }) => {
    await mockGraphQLAll(page, GRAPHQL_PROXY_ROUTE, {
      data: {
        matches: [
          buildMatch({
            id: '00000000-0000-0000-0000-0000000000c1',
            title: 'Partido cancelado por falta de jugadores',
            status: 'CANCELLED',
          }),
        ],
      },
    });

    await matchesPage.goto();

    // Oculto por defecto: el único partido es CANCELLED → empty-state.
    await expect(matchesPage.emptyState).toBeVisible();
    await expect(matchesPage.card('Partido cancelado por falta de jugadores')).toHaveCount(0);

    // Al activar el toggle, el cancelado aparece con su badge.
    await matchesPage.showCancelledToggle.check();
    await expect(matchesPage.card('Partido cancelado por falta de jugadores')).toBeVisible();
    await expect(page.getByText('Cancelado').first()).toBeVisible();
  });
});
