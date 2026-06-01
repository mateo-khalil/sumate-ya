import {
  buildMatch,
  expect,
  FRONTEND_URL,
  GRAPHQL_ANY_ROUTE,
  mockGraphQLAll,
  test,
  type MockMatch,
} from './support';

/**
 * Tests E2E de Filtrar Partidos (/partidos).
 *
 * Decision Context:
 * - MatchFilters hidrata client-side dentro de MatchesView (`client:visible`).
 *   Por eso esperamos a que el listado deje de cargar (`expectListSettled`)
 *   antes de interactuar con selects.
 * - Mockeamos `/api/graphql` (proxy o backend directo) para validar que zona,
 *   formato, horario, rango de fecha y búsqueda se aplican localmente sobre
 *   datos ya cargados, sin depender del seed.
 * - Verificamos que la carga inicial use el filtro server-side mínimo
 *   (`status=OPEN`); los demás se aplican client-side y se persisten en URL.
 */

const MATCHES_URL = `${FRONTEND_URL}/partidos`;

const MATCHES: MockMatch[] = [
  buildMatch({
    id: 'norte-f5-manana',
    title: 'F5 temprano en Norte',
    startTime: '2026-05-10T09:00:00-03:00',
    format: 'FIVE_VS_FIVE',
    club: { name: 'Club Norte Uno', zone: 'Norte', address: 'Av Norte 123' },
  }),
  buildMatch({
    id: 'sur-f7-noche',
    title: 'F7 noche en Sur',
    startTime: '2026-05-11T20:30:00-03:00',
    format: 'SEVEN_VS_SEVEN',
    totalSlots: 14,
    availableSlots: 6,
    club: { name: 'Club Sur Bravo', zone: 'Sur', address: 'Calle Sur 456' },
  }),
  buildMatch({
    id: 'centro-f10-tarde',
    title: 'F10 tarde centro',
    startTime: '2026-05-12T15:00:00-03:00',
    format: 'TEN_VS_TEN',
    totalSlots: 20,
    availableSlots: 12,
    club: { name: 'Club Centro', zone: 'Centro', address: 'Centro 789' },
  }),
  buildMatch({
    id: 'oeste-f11-nocturno',
    title: 'F11 nocturno oeste',
    startTime: '2026-05-13T23:15:00-03:00',
    format: 'ELEVEN_VS_ELEVEN',
    totalSlots: 22,
    availableSlots: 8,
    club: { name: 'Club Oeste', zone: 'Oeste', address: 'Oeste 321' },
  }),
  buildMatch({
    id: 'este-f7-madrugada',
    title: 'F7 madrugada este',
    startTime: '2026-05-14T01:30:00-03:00',
    format: 'SEVEN_VS_SEVEN',
    totalSlots: 14,
    availableSlots: 4,
    club: { name: 'Club Este', zone: 'Este', address: 'Este 654' },
  }),
  buildMatch({
    id: 'cancelado-no-visible',
    title: 'Partido cancelado oculto',
    startTime: '2026-05-15T20:00:00-03:00',
    status: 'CANCELLED',
    club: { name: 'Club Norte Uno', zone: 'Norte', address: 'Av Norte 123' },
  }),
];

async function expectVisibleMatches(matchesPage: { card(t: string): import('@playwright/test').Locator }, titles: string[]): Promise<void> {
  for (const title of titles) {
    await expect(matchesPage.card(title)).toBeVisible();
  }
  for (const title of MATCHES.map((m) => m.title).filter((t) => !titles.includes(t))) {
    await expect(matchesPage.card(title)).toHaveCount(0);
  }
}

test.describe('Filtrar Partidos (/partidos)', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    await mockGraphQLAll(page, GRAPHQL_ANY_ROUTE, { data: { matches: MATCHES } });
  });

  test('carga partidos abiertos y muestra controles de filtros principales', async ({
    matchesPage,
    page,
  }) => {
    const tracker = await mockGraphQLAll(page, GRAPHQL_ANY_ROUTE, { data: { matches: MATCHES } });

    await matchesPage.goto();
    await matchesPage.expectListSettled('F5 temprano en Norte');

    await expect(page.getByLabel(/buscar partidos/i)).toBeVisible();
    await expect(matchesPage.formatSelect).toBeVisible();
    await expect(matchesPage.zoneSelect).toBeVisible();
    await expect(matchesPage.scheduleSelect).toBeVisible();
    await expect(matchesPage.dateFromInput).toBeVisible();
    await expect(matchesPage.dateToInput).toBeVisible();
    await expect(matchesPage.clearButton).toBeDisabled();

    // /partidos is now a unified hub: the hidden Torneos tab's TournamentList also
    // fires a GetTournaments query (filters.status=REGISTRATION). Pick the matches
    // request specifically instead of assuming requests[0] is the matches query.
    const matchesRequests = tracker.requests.filter((r) => r.query?.includes('matches('));
    expect(matchesRequests[0]?.variables).toMatchObject({ filters: { status: 'OPEN' } });
    await expect(matchesPage.card('Partido cancelado oculto')).toHaveCount(0);
  });

  test('filtra por formato y persiste el filtro en la URL', async ({ matchesPage, page }) => {
    await matchesPage.goto();
    await matchesPage.expectListSettled('F5 temprano en Norte');

    await matchesPage.formatSelect.selectOption('SEVEN_VS_SEVEN');

    await expectVisibleMatches(matchesPage, ['F7 noche en Sur', 'F7 madrugada este']);
    await expect(page).toHaveURL(/format=SEVEN_VS_SEVEN/);
  });

  test('filtra por zona y permite compartir el estado desde URL params', async ({
    matchesPage,
    page,
  }) => {
    await matchesPage.goto();
    await matchesPage.expectListSettled('F5 temprano en Norte');

    await matchesPage.zoneSelect.selectOption('Sur');

    await expectVisibleMatches(matchesPage, ['F7 noche en Sur']);
    await expect(page).toHaveURL(/zone=Sur/);

    await page.reload();
    await expectVisibleMatches(matchesPage, ['F7 noche en Sur']);
    await expect(matchesPage.zoneSelect).toHaveValue('Sur');
  });

  test('combina zona, formato y busqueda sin volver a pedir datos al backend', async ({
    matchesPage,
    page,
  }) => {
    const tracker = await mockGraphQLAll(page, GRAPHQL_ANY_ROUTE, { data: { matches: MATCHES } });

    await matchesPage.goto();
    await matchesPage.expectListSettled('F5 temprano en Norte');

    await matchesPage.formatSelect.selectOption('SEVEN_VS_SEVEN');
    await matchesPage.zoneSelect.selectOption('Sur');
    await matchesPage.searchInput.fill('bravo');

    await expectVisibleMatches(matchesPage, ['F7 noche en Sur']);
    await expect(page).toHaveURL(/format=SEVEN_VS_SEVEN/);
    await expect(page).toHaveURL(/zone=Sur/);
    await expect(page).toHaveURL(/search=bravo/);
    // Only the initial matches() fetch should hit the backend — client-side filters
    // must not refetch. Count matches requests only; the unified /partidos hub also
    // fires a GetTournaments query from the hidden Torneos tab.
    expect(tracker.requests.filter((r) => r.query?.includes('matches('))).toHaveLength(1);
  });

  test('filtra por horario de noche y por rango nocturno cruzando medianoche', async ({
    matchesPage,
    page,
  }) => {
    await matchesPage.goto();
    await matchesPage.expectListSettled('F5 temprano en Norte');

    await matchesPage.scheduleSelect.selectOption('18:00|23:59');
    await expectVisibleMatches(matchesPage, ['F7 noche en Sur', 'F11 nocturno oeste']);
    await expect(page).toHaveURL(/timeFrom=18%3A00/);
    await expect(page).toHaveURL(/timeTo=23%3A59/);

    await matchesPage.scheduleSelect.selectOption('20:00|02:00');
    await expectVisibleMatches(matchesPage, [
      'F7 noche en Sur',
      'F11 nocturno oeste',
      'F7 madrugada este',
    ]);
  });

  test('filtra por rango de fecha inclusivo', async ({ matchesPage, page }) => {
    await matchesPage.goto();
    await matchesPage.expectListSettled('F5 temprano en Norte');

    await matchesPage.dateFromInput.fill('2026-05-11');
    await matchesPage.dateToInput.fill('2026-05-12');

    await expectVisibleMatches(matchesPage, ['F7 noche en Sur', 'F10 tarde centro']);
    await expect(page).toHaveURL(/dateFrom=2026-05-11/);
    await expect(page).toHaveURL(/dateTo=2026-05-12/);
  });

  test('muestra empty-state cuando ningun partido coincide con los filtros', async ({
    matchesPage,
    page,
  }) => {
    await matchesPage.goto();
    await matchesPage.expectListSettled('F5 temprano en Norte');

    await matchesPage.zoneSelect.selectOption('Norte');
    await matchesPage.formatSelect.selectOption('ELEVEN_VS_ELEVEN');

    await expect(matchesPage.emptyState).toBeVisible();
    await expect(page.getByText(/ningun partido coincide|ningún partido coincide/i)).toBeVisible();
  });

  test('limpiar resetea filtros, controles y URL params', async ({ matchesPage, page }) => {
    await matchesPage.goto();
    await matchesPage.expectListSettled('F5 temprano en Norte');

    await matchesPage.formatSelect.selectOption('SEVEN_VS_SEVEN');
    await matchesPage.zoneSelect.selectOption('Sur');
    await matchesPage.scheduleSelect.selectOption('18:00|23:59');
    await matchesPage.dateFromInput.fill('2026-05-11');
    await matchesPage.searchInput.fill('bravo');

    await expect(matchesPage.clearButton).toBeEnabled();
    await matchesPage.clearButton.click();

    await expect(matchesPage.formatSelect).toHaveValue('');
    await expect(matchesPage.zoneSelect).toHaveValue('');
    await expect(matchesPage.scheduleSelect).toHaveValue('');
    await expect(matchesPage.dateFromInput).toHaveValue('');
    await expect(matchesPage.searchInput).toHaveValue('');
    await expect(matchesPage.clearButton).toBeDisabled();
    await expect(page).toHaveURL(MATCHES_URL);
    await expectVisibleMatches(matchesPage, [
      'F5 temprano en Norte',
      'F7 noche en Sur',
      'F10 tarde centro',
      'F11 nocturno oeste',
      'F7 madrugada este',
    ]);
  });

  test('ignora formato invalido en URL y conserva resultados abiertos', async ({
    matchesPage,
  }) => {
    await matchesPage.goto('/partidos?format=INVALIDO&zone=Sur');
    await matchesPage.expectListSettled('F7 noche en Sur');

    await expect(matchesPage.formatSelect).toHaveValue('');
    await expect(matchesPage.zoneSelect).toHaveValue('Sur');
    await expectVisibleMatches(matchesPage, ['F7 noche en Sur']);
  });
});
