import {
  buildTournament,
  expect,
  GRAPHQL_PROXY_ROUTE,
  mockGraphQLAll,
  test,
  TORNEOS_URL,
} from './support';

/**
 * Tests E2E - Filtrar Torneos (/torneos).
 *
 * Decision Context:
 * - Mirrors match-filters.spec.ts at a tournament scope: search by name, status, format,
 *   zone, and date range.
 * - The mocked GraphQL handler intentionally returns mixed tournaments even when variables
 *   request a subset. This verifies the UI forwards filters to tournaments(filters) and
 *   also keeps its defensive client-side mirror aligned.
 */

test.describe('Filtrar Torneos (/torneos)', () => {
  test.describe.configure({ mode: 'serial' });

  test('muestra filtros y carga la query inicial con estado REGISTRATION', async ({
    tournamentsPage,
    page,
  }) => {
    const tracker = await mockGraphQLAll(page, GRAPHQL_PROXY_ROUTE, {
      data: { tournaments: [buildTournament({ name: 'Copa Inicial' })] },
    });

    await tournamentsPage.goto();
    await tournamentsPage.expectListSettled();

    await expect(tournamentsPage.searchInput).toBeVisible();
    await expect(tournamentsPage.statusSelect).toBeVisible();
    await expect(tournamentsPage.formatSelect).toBeVisible();
    await expect(tournamentsPage.zoneSelect).toBeVisible();
    await expect(tournamentsPage.dateFromInput).toBeVisible();
    await expect(tournamentsPage.dateToInput).toBeVisible();
    await expect(tournamentsPage.clearButton).toBeDisabled();

    expect(tracker.requests[0]?.variables).toMatchObject({
      filters: { status: 'REGISTRATION' },
    });
  });

  test('filtra por nombre y persiste search en la URL', async ({ tournamentsPage, page }) => {
    const tracker = await mockGraphQLAll(page, GRAPHQL_PROXY_ROUTE, {
      data: {
        tournaments: [
          buildTournament({ id: 'search-1', name: 'Copa Primavera' }),
          buildTournament({ id: 'search-2', name: 'Liga Otono' }),
          buildTournament({ id: 'search-3', name: 'Desafio Nocturno' }),
        ],
      },
    });

    await tournamentsPage.goto();
    await tournamentsPage.expectListSettled();

    await tournamentsPage.searchInput.fill('primavera');

    await expect(tournamentsPage.card('Copa Primavera')).toBeVisible();
    await expect(tournamentsPage.card('Liga Otono')).toHaveCount(0);
    await expect(tournamentsPage.card('Desafio Nocturno')).toHaveCount(0);
    await expect(page).toHaveURL(/search=primavera/);
    expect(tracker.requests.at(-1)?.variables).toMatchObject({
      filters: { status: 'REGISTRATION', search: 'primavera' },
    });
  });

  test('filtra por estado en curso y persiste el filtro en la URL', async ({
    tournamentsPage,
    page,
  }) => {
    const tracker = await mockGraphQLAll(page, GRAPHQL_PROXY_ROUTE, {
      data: {
        tournaments: [
          buildTournament({ id: 'state-1', name: 'Copa Abierta', status: 'REGISTRATION' }),
          buildTournament({ id: 'state-2', name: 'Liga En Curso', status: 'IN_PROGRESS' }),
        ],
      },
    });

    await tournamentsPage.goto();
    await tournamentsPage.expectListSettled();

    await expect(tournamentsPage.card('Copa Abierta')).toBeVisible();
    await expect(tournamentsPage.card('Liga En Curso')).toHaveCount(0);

    await tournamentsPage.statusSelect.selectOption('IN_PROGRESS');

    await expect(tournamentsPage.card('Liga En Curso')).toBeVisible({ timeout: 10_000 });
    await expect(tournamentsPage.card('Copa Abierta')).toHaveCount(0);
    await expect(page).toHaveURL(/status=IN_PROGRESS/);
    await expect(tournamentsPage.registrationClosedButton()).toBeDisabled();
    expect(tracker.requests.at(-1)?.variables).toMatchObject({
      filters: { status: 'IN_PROGRESS' },
    });
  });

  test('combina zona, formato y rango de fecha', async ({ tournamentsPage, page }) => {
    await mockGraphQLAll(page, GRAPHQL_PROXY_ROUTE, {
      data: {
        tournaments: [
          buildTournament({
            id: 'combo-1',
            name: 'Liga Sur 7',
            format: 'SEVEN_VS_SEVEN',
            startDate: '2027-06-15',
            club: { id: 'club-sur', name: 'Club Sur', zone: 'Sur', address: null, imageUrl: null },
          }),
          buildTournament({
            id: 'combo-2',
            name: 'Copa Norte 7',
            format: 'SEVEN_VS_SEVEN',
            startDate: '2027-06-16',
            club: { id: 'club-norte', name: 'Club Norte', zone: 'Norte', address: null, imageUrl: null },
          }),
          buildTournament({
            id: 'combo-3',
            name: 'Copa Sur 5',
            format: 'FIVE_VS_FIVE',
            startDate: '2027-06-17',
            club: { id: 'club-sur-5', name: 'Club Sur 5', zone: 'Sur', address: null, imageUrl: null },
          }),
          buildTournament({
            id: 'combo-4',
            name: 'Liga Sur Fuera De Fecha',
            format: 'SEVEN_VS_SEVEN',
            startDate: '2027-07-01',
            club: { id: 'club-sur-2', name: 'Club Sur 2', zone: 'Sur', address: null, imageUrl: null },
          }),
        ],
      },
    });

    await tournamentsPage.goto();
    await tournamentsPage.expectListSettled();

    await tournamentsPage.formatSelect.selectOption('SEVEN_VS_SEVEN');
    await tournamentsPage.zoneSelect.selectOption('Sur');
    await tournamentsPage.dateFromInput.fill('2027-06-10');
    await tournamentsPage.dateToInput.fill('2027-06-20');

    await expect(tournamentsPage.card('Liga Sur 7')).toBeVisible();
    await expect(tournamentsPage.card('Copa Norte 7')).toHaveCount(0);
    await expect(tournamentsPage.card('Copa Sur 5')).toHaveCount(0);
    await expect(tournamentsPage.card('Liga Sur Fuera De Fecha')).toHaveCount(0);
    await expect(page).toHaveURL(/format=SEVEN_VS_SEVEN/);
    await expect(page).toHaveURL(/zone=Sur/);
    await expect(page).toHaveURL(/dateFrom=2027-06-10/);
    await expect(page).toHaveURL(/dateTo=2027-06-20/);
  });

  test('hidrata filtros desde URL y limpiar resetea controles y params', async ({
    tournamentsPage,
    page,
  }) => {
    await mockGraphQLAll(page, GRAPHQL_PROXY_ROUTE, {
      data: {
        tournaments: [
          buildTournament({
            id: 'url-1',
            name: 'Liga URL',
            status: 'IN_PROGRESS',
            format: 'FIVE_VS_FIVE',
            startDate: '2027-08-12',
            club: { id: 'club-url', name: 'Club URL', zone: 'Norte', address: null, imageUrl: null },
          }),
        ],
      },
    });

    await tournamentsPage.goto(
      `${TORNEOS_URL}?status=IN_PROGRESS&format=FIVE_VS_FIVE&zone=Norte&dateFrom=2027-08-01&dateTo=2027-08-31&search=liga`,
    );
    await tournamentsPage.expectListSettled();

    await expect(tournamentsPage.card('Liga URL')).toBeVisible();
    await expect(tournamentsPage.statusSelect).toHaveValue('IN_PROGRESS');
    await expect(tournamentsPage.searchInput).toHaveValue('liga');
    await expect(tournamentsPage.formatSelect).toHaveValue('FIVE_VS_FIVE');
    await expect(tournamentsPage.zoneSelect).toHaveValue('Norte');
    await expect(tournamentsPage.dateFromInput).toHaveValue('2027-08-01');
    await expect(tournamentsPage.dateToInput).toHaveValue('2027-08-31');

    await tournamentsPage.clearButton.click();

    await expect(tournamentsPage.statusSelect).toHaveValue('REGISTRATION');
    await expect(tournamentsPage.searchInput).toHaveValue('');
    await expect(tournamentsPage.formatSelect).toHaveValue('');
    await expect(tournamentsPage.zoneSelect).toHaveValue('');
    await expect(tournamentsPage.dateFromInput).toHaveValue('');
    await expect(tournamentsPage.dateToInput).toHaveValue('');
    await expect(tournamentsPage.clearButton).toBeDisabled();
    await expect(page).toHaveURL(TORNEOS_URL);
  });
});
