import { expect, test, type Page, type Route } from '@playwright/test';

/**
 * Tests E2E de Filtrar Partidos (/partidos).
 *
 * Decision Context:
 * - MatchFilters hidrata client-side dentro de MatchesView (client:visible). Por eso
 *   los tests esperan a que el listado deje de cargar antes de interactuar con selects.
 * - Mockeamos /api/graphql para controlar un dataset amplio y validar que zona,
 *   formato, horario, rango de fecha y busqueda se aplican localmente sobre datos ya
 *   cargados, sin depender del seed de Supabase.
 * - Capturamos el payload GraphQL para confirmar que la carga inicial usa matches con
 *   filtros server-side minimos (status OPEN); los demas filtros son instantaneos en UI
 *   y se persisten en URL para compartir.
 */

const FRONTEND_URL = 'http://localhost:4321';
const MATCHES_URL = `${FRONTEND_URL}/partidos`;
// Cubre tanto el proxy del frontend (/api/graphql) como PUBLIC_GRAPHQL_URL directo
// al backend (/graphql), segun como este configurado el ambiente local.
const GRAPHQL_ROUTE = /https?:\/\/[^/]+\/(?:api\/)?graphql(?:\?.*)?$/;

type MatchFormat = 'FIVE_VS_FIVE' | 'SEVEN_VS_SEVEN' | 'TEN_VS_TEN' | 'ELEVEN_VS_ELEVEN';
type MatchStatus = 'OPEN' | 'FULL' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

type MockMatch = {
  __typename?: string;
  id: string;
  title: string;
  startTime: string;
  format: MatchFormat;
  totalSlots: number;
  availableSlots: number;
  status: MatchStatus;
  club: {
    __typename?: string;
    name: string;
    zone: string | null;
    address?: string | null;
  } | null;
};

type GraphQLRequest = {
  query?: string;
  variables?: Record<string, unknown>;
};

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

function buildMatch(overrides: Partial<MockMatch> = {}): MockMatch {
  return {
    __typename: 'Match',
    id: 'match-default',
    title: 'Partido de prueba',
    startTime: '2026-05-10T20:00:00-03:00',
    format: 'FIVE_VS_FIVE',
    totalSlots: 10,
    availableSlots: 5,
    status: 'OPEN',
    club: { __typename: 'Club', name: 'Club Test', zone: 'Norte', address: 'Test 123' },
    ...overrides,
  };
}

async function mockMatchesQuery(
  page: Page,
  matches: MockMatch[] = MATCHES,
): Promise<{ requests: GraphQLRequest[] }> {
  const requests: GraphQLRequest[] = [];

  await page.unroute(GRAPHQL_ROUTE).catch(() => undefined);
  await page.route(GRAPHQL_ROUTE, async (route: Route) => {
    const rawBody = route.request().postData() ?? '{}';
    const body = JSON.parse(rawBody) as GraphQLRequest;
    const url = new URL(route.request().url());
    const variablesParam = url.searchParams.get('variables');
    const queryParam = url.searchParams.get('query');

    requests.push({
      query: body.query ?? queryParam ?? undefined,
      variables:
        body.variables ??
        (variablesParam ? (JSON.parse(variablesParam) as Record<string, unknown>) : undefined),
    });

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { matches } }),
    });
  });

  return { requests };
}

async function gotoMatchesPage(
  page: Page,
  path = '/partidos',
  waitForTitle = 'F5 temprano en Norte',
): Promise<void> {
  await page.goto(`${FRONTEND_URL}${path}`);
  await page.locator('.matches-section').scrollIntoViewIfNeeded();
  await expect(page.getByRole('heading', { name: /partidos disponibles/i })).toBeVisible();
  await expect(page.getByText(waitForTitle)).toBeVisible();
}

async function expectVisibleMatches(page: Page, titles: string[]): Promise<void> {
  for (const title of titles) {
    await expect(page.getByText(title)).toBeVisible();
  }

  const hiddenTitles = MATCHES.map((match) => match.title).filter(
    (title) => !titles.includes(title),
  );
  for (const title of hiddenTitles) {
    await expect(page.getByText(title)).toHaveCount(0);
  }
}

test.describe('Filtrar Partidos (/partidos)', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    await mockMatchesQuery(page);
  });

  test('carga partidos abiertos y muestra controles de filtros principales', async ({ page }) => {
    const graphQL = await mockMatchesQuery(page);

    await gotoMatchesPage(page);

    await expect(page.getByLabel(/buscar partidos/i)).toBeVisible();
    await expect(page.getByLabel('Formato')).toBeVisible();
    await expect(page.getByLabel('Zona')).toBeVisible();
    await expect(page.getByLabel('Horario')).toBeVisible();
    await expect(page.getByLabel(/fecha desde/i)).toBeVisible();
    await expect(page.getByLabel(/fecha hasta/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /limpiar/i })).toBeDisabled();

    expect(graphQL.requests[0]?.variables).toMatchObject({
      filters: { status: 'OPEN' },
    });
    await expect(page.getByText('Partido cancelado oculto')).toHaveCount(0);
  });

  test('filtra por formato y persiste el filtro en la URL', async ({ page }) => {
    await gotoMatchesPage(page);

    await page.getByLabel('Formato').selectOption('SEVEN_VS_SEVEN');

    await expectVisibleMatches(page, ['F7 noche en Sur', 'F7 madrugada este']);
    await expect(page).toHaveURL(/format=SEVEN_VS_SEVEN/);
  });

  test('filtra por zona y permite compartir el estado desde URL params', async ({ page }) => {
    await gotoMatchesPage(page);

    await page.getByLabel('Zona').selectOption('Sur');

    await expectVisibleMatches(page, ['F7 noche en Sur']);
    await expect(page).toHaveURL(/zone=Sur/);

    await page.reload();
    await expectVisibleMatches(page, ['F7 noche en Sur']);
    await expect(page.getByLabel('Zona')).toHaveValue('Sur');
  });

  test('combina zona, formato y busqueda sin volver a pedir datos al backend', async ({
    page,
  }) => {
    const graphQL = await mockMatchesQuery(page);
    await gotoMatchesPage(page);

    await page.getByLabel('Formato').selectOption('SEVEN_VS_SEVEN');
    await page.getByLabel('Zona').selectOption('Sur');
    await page.getByLabel(/buscar partidos/i).fill('bravo');

    await expectVisibleMatches(page, ['F7 noche en Sur']);
    await expect(page).toHaveURL(/format=SEVEN_VS_SEVEN/);
    await expect(page).toHaveURL(/zone=Sur/);
    await expect(page).toHaveURL(/search=bravo/);
    expect(graphQL.requests).toHaveLength(1);
  });

  test('filtra por horario de noche y por rango nocturno cruzando medianoche', async ({
    page,
  }) => {
    await gotoMatchesPage(page);

    await page.getByLabel('Horario').selectOption('18:00|23:59');
    await expectVisibleMatches(page, ['F7 noche en Sur', 'F11 nocturno oeste']);
    await expect(page).toHaveURL(/timeFrom=18%3A00/);
    await expect(page).toHaveURL(/timeTo=23%3A59/);

    await page.getByLabel('Horario').selectOption('20:00|02:00');
    await expectVisibleMatches(page, [
      'F7 noche en Sur',
      'F11 nocturno oeste',
      'F7 madrugada este',
    ]);
  });

  test('filtra por rango de fecha inclusivo', async ({ page }) => {
    await gotoMatchesPage(page);

    await page.getByLabel(/fecha desde/i).fill('2026-05-11');
    await page.getByLabel(/fecha hasta/i).fill('2026-05-12');

    await expectVisibleMatches(page, ['F7 noche en Sur', 'F10 tarde centro']);
    await expect(page).toHaveURL(/dateFrom=2026-05-11/);
    await expect(page).toHaveURL(/dateTo=2026-05-12/);
  });

  test('muestra empty-state cuando ningun partido coincide con los filtros', async ({
    page,
  }) => {
    await gotoMatchesPage(page);

    await page.getByLabel('Zona').selectOption('Norte');
    await page.getByLabel('Formato').selectOption('ELEVEN_VS_ELEVEN');

    await expect(page.getByText('No hay partidos disponibles')).toBeVisible();
    await expect(page.getByText(/ningun partido coincide|ningún partido coincide/i)).toBeVisible();
  });

  test('limpiar resetea filtros, controles y URL params', async ({ page }) => {
    await gotoMatchesPage(page);

    await page.getByLabel('Formato').selectOption('SEVEN_VS_SEVEN');
    await page.getByLabel('Zona').selectOption('Sur');
    await page.getByLabel('Horario').selectOption('18:00|23:59');
    await page.getByLabel(/fecha desde/i).fill('2026-05-11');
    await page.getByLabel(/buscar partidos/i).fill('bravo');

    const clearButton = page.getByRole('button', { name: /limpiar/i });
    await expect(clearButton).toBeEnabled();
    await clearButton.click();

    await expect(page.getByLabel('Formato')).toHaveValue('');
    await expect(page.getByLabel('Zona')).toHaveValue('');
    await expect(page.getByLabel('Horario')).toHaveValue('');
    await expect(page.getByLabel(/fecha desde/i)).toHaveValue('');
    await expect(page.getByLabel(/buscar partidos/i)).toHaveValue('');
    await expect(clearButton).toBeDisabled();
    await expect(page).toHaveURL(MATCHES_URL);
    await expectVisibleMatches(page, [
      'F5 temprano en Norte',
      'F7 noche en Sur',
      'F10 tarde centro',
      'F11 nocturno oeste',
      'F7 madrugada este',
    ]);
  });

  test('ignora formato invalido en URL y conserva resultados abiertos', async ({ page }) => {
    await gotoMatchesPage(page, '/partidos?format=INVALIDO&zone=Sur', 'F7 noche en Sur');

    await expect(page.getByLabel('Formato')).toHaveValue('');
    await expect(page.getByLabel('Zona')).toHaveValue('Sur');
    await expectVisibleMatches(page, ['F7 noche en Sur']);
  });
});
