import { expect, test, type APIRequestContext, type Page, type Route } from '@playwright/test';

/**
 * Tests E2E de Detalle de Partido (/partidos/[id]).
 *
 * Decision Context:
 * - Esta pagina es SSR: Astro consulta match(id) en el servidor antes de enviar HTML.
 *   Por eso page.route() no puede mockear el detalle inicial como si fuera un fetch del
 *   browser. Los tests buscan fixtures reales via GraphQL y validan la UI contra ese
 *   contrato.
 * - Los casos que dependen del estado del seed (partido full, usuario ya anotado,
 *   partido abierto con cupos) usan test.skip cuando no existe un partido compatible.
 *   Asi la suite no inventa datos falsos ni modifica Supabase para forzar bordes.
 * - Las acciones client-side de sumarse/salirse si se mockean, porque esos botones
 *   hacen fetch desde el browser al backend GraphQL y ahi page.route() si aplica.
 */

const FRONTEND_URL = 'http://localhost:4321';
const BACKEND_GRAPHQL_URL = 'http://localhost:4000/graphql';
const BACKEND_GRAPHQL_ROUTE = '**/graphql';
const ACCESS_TOKEN_COOKIE = 'sumateya-access-token';

const TEST_USER = {
  email: 'mateoduran2010@gmail.com',
  password: 'Hola1234',
};

type MatchFormat = 'FIVE_VS_FIVE' | 'SEVEN_VS_SEVEN' | 'TEN_VS_TEN' | 'ELEVEN_VS_ELEVEN';
type MatchStatus = 'OPEN' | 'FULL' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
type MatchTeam = 'A' | 'B';

type TeamMember = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  preferredPosition: string | null;
};

type MatchDetail = {
  id: string;
  title: string;
  startTime: string;
  format: MatchFormat;
  totalSlots: number;
  availableSlots: number;
  status: MatchStatus;
  description: string | null;
  organizerId: string | null;
  currentUserTeam: MatchTeam | null;
  club: {
    id: string;
    name: string;
    zone: string | null;
    address: string | null;
    lat: number | null;
    lng: number | null;
    phone: string | null;
  } | null;
  participants: {
    teamA: TeamMember[];
    teamB: TeamMember[];
    teamACount: number;
    teamBCount: number;
    totalCount: number;
    spotsLeftA: number;
    spotsLeftB: number;
  } | null;
  isCurrentUserJoined: boolean | null;
  canJoin: boolean | null;
};

const FORMAT_LABEL: Record<MatchFormat, string> = {
  FIVE_VS_FIVE: '5v5',
  SEVEN_VS_SEVEN: '7v7',
  TEN_VS_TEN: '10v10',
  ELEVEN_VS_ELEVEN: '11v11',
};

async function login(page: Page): Promise<void> {
  await page.goto(`${FRONTEND_URL}/login`);
  await page.getByRole('textbox', { name: 'Email' }).fill(TEST_USER.email);
  await page.getByRole('textbox', { name: /contrase/i }).fill(TEST_USER.password);
  await page.getByRole('button', { name: /ingresar/i }).click();
  await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 10_000 });
}

async function readAccessToken(page: Page): Promise<string> {
  const cookies = await page.context().cookies(FRONTEND_URL);
  const token = cookies.find((cookie) => cookie.name === ACCESS_TOKEN_COOKIE)?.value;
  expect(token, 'el login debe dejar cookie de access token').toBeTruthy();
  return token as string;
}

async function graphql<T>(
  request: APIRequestContext,
  query: string,
  variables?: Record<string, unknown>,
  accessToken?: string,
): Promise<T> {
  const response = await request.post(BACKEND_GRAPHQL_URL, {
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    data: { query, variables },
  });
  expect(response.ok()).toBe(true);

  const payload = (await response.json()) as { data?: T; errors?: Array<{ message: string }> };
  expect(payload.errors ?? []).toHaveLength(0);
  expect(payload.data).toBeTruthy();
  return payload.data as T;
}

async function fetchMatchIds(request: APIRequestContext): Promise<string[]> {
  const data = await graphql<{ matches: Array<{ id: string }> }>(
    request,
    /* GraphQL */ `
      query GetMatchesForDetailE2E {
        matches {
          id
        }
      }
    `,
  );
  return data.matches.map((match) => match.id);
}

async function fetchMatchDetail(
  request: APIRequestContext,
  id: string,
  accessToken?: string,
): Promise<MatchDetail | null> {
  const data = await graphql<{ match: MatchDetail | null }>(
    request,
    /* GraphQL */ `
      query GetMatchDetailForE2E($id: ID!) {
        match(id: $id) {
          id
          title
          startTime
          format
          totalSlots
          availableSlots
          status
          description
          organizerId
          currentUserTeam
          club {
            id
            name
            zone
            address
            lat
            lng
            phone
          }
          participants {
            teamA { id displayName avatarUrl preferredPosition }
            teamB { id displayName avatarUrl preferredPosition }
            teamACount
            teamBCount
            totalCount
            spotsLeftA
            spotsLeftB
          }
          isCurrentUserJoined
          canJoin
        }
      }
    `,
    { id },
    accessToken,
  );
  return data.match;
}

async function findMatch(
  request: APIRequestContext,
  predicate: (match: MatchDetail) => boolean,
  accessToken?: string,
): Promise<MatchDetail | null> {
  for (const id of await fetchMatchIds(request)) {
    const detail = await fetchMatchDetail(request, id, accessToken);
    if (detail && predicate(detail)) return detail;
  }
  return null;
}

async function gotoMatchDetail(page: Page, matchId: string): Promise<void> {
  await page.goto(`${FRONTEND_URL}/partidos/${matchId}`);
  await expect(page.locator('.match-detail')).toBeVisible();
  await waitForIslandsHydrated(page);
}

// Decision Context: las React islands del detalle (JoinTeamButton, LeaveMatchButton)
// usan client:load. Astro renderiza el HTML del boton en el SSR pero el handler
// onClick recien se attachea cuando la island termina de hidratar. Si Playwright
// hace click antes de la hidratacion, el evento se dispatchea sobre un boton sin
// listener y la mutation no se ejecuta nunca, fallando el `expect.poll(payloads.length)`
// con timeout. El web component <astro-island> trackea su estado: mientras hidrata
// expone el atributo `ssr` y/o `await-children`; al completar la hidratacion los
// remueve.
// IMPORTANTE: filtramos SOLO las islands con `client="load"`. Las que usan
// `client:visible` (ej: MatchResultsSection en el bottom de la pagina) nunca pierden
// el atributo `ssr` hasta que el usuario las scrollea a la vista — esperar por ellas
// hace timeoutear el helper. Para nuestros tests solo importan los CTAs above the
// fold (JoinTeamButton, LeaveMatchButton).
// Previously fixed bugs:
//   1. Tests "Sumarme por equipo" y "error inline al salir" fallaban con
//      `expected 1, received 0` porque el click se hacia antes de la hidratacion.
//   2. Despues de agregarse MatchResultsSection con client:visible, el helper
//      timeouteaba a los 10s porque esa island nunca hidrata sin scroll —
//      filtrado por client="load" lo arregla.
async function waitForIslandsHydrated(page: Page): Promise<void> {
  // Astro 6 marca cada island hidratada agregando el atributo `client-render-time`
  // (que registra cuántos ms tardó React en montar). En cambio `await-children`
  // queda pegado al elemento incluso después de hidratar — por eso NO sirve como
  // señal negativa. Usamos la presencia de `client-render-time` como indicador
  // positivo: si está, el handler onClick ya está enganchado.
  await page.waitForFunction(() => {
    const islands = Array.from(document.querySelectorAll('astro-island[client="load"]'));
    if (islands.length === 0) return true;
    return islands.every((island) => island.hasAttribute('client-render-time'));
  }, { timeout: 10_000 });
}

function allPlayers(match: MatchDetail): TeamMember[] {
  return [...(match.participants?.teamA ?? []), ...(match.participants?.teamB ?? [])];
}

async function mockGraphQLMutation(
  page: Page,
  operationName: 'JoinMatch' | 'LeaveMatch',
  body: unknown,
): Promise<{ payloads: unknown[] }> {
  const payloads: unknown[] = [];

  await page.route(BACKEND_GRAPHQL_ROUTE, async (route: Route) => {
    const raw = route.request().postData() ?? '{}';
    const parsed = JSON.parse(raw) as { query?: string };

    if (!parsed.query?.includes(operationName === 'JoinMatch' ? 'joinMatch' : 'leaveMatch')) {
      await route.continue();
      return;
    }

    payloads.push(parsed);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });

  return { payloads };
}

test.describe('Detalle de Partido (/partidos/[id])', () => {
  test.describe.configure({ mode: 'serial' });

  test('redirige al listado cuando el id no es un UUID valido', async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/partidos/no-es-un-uuid`);

    await expect(page).toHaveURL(/\/partidos$/);
  });

  test('muestra datos completos del partido, club, ubicacion y equipos', async ({
    page,
    request,
  }) => {
    const match = await findMatch(request, () => true);
    test.skip(!match, 'No hay partidos disponibles en el backend para validar el detalle.');

    await gotoMatchDetail(page, match.id);

    await expect(page.getByRole('heading', { name: match.title })).toBeVisible();
    await expect(page.getByText(FORMAT_LABEL[match.format], { exact: true }).first()).toBeVisible();
    await expect(page.getByText(new RegExp(`${match.participants?.totalCount ?? 0} / ${match.totalSlots}`))).toBeVisible();

    if (match.description) {
      await expect(page.locator('.match-desc')).toContainText(match.description);
    }

    const organizer = match.organizerId
      ? allPlayers(match).find((player) => player.id === match.organizerId)
      : null;
    if (organizer) {
      await expect(page.getByText('Organizador').first()).toBeVisible();
      await expect(page.getByText(organizer.displayName).first()).toBeVisible();
    }

    if (match.club) {
      await expect(page.getByRole('heading', { name: match.club.name })).toBeVisible();
      if (match.club.address) {
        await expect(page.locator('.location-card').getByText(match.club.address, { exact: true })).toBeVisible();
      }
      if (match.club.zone) {
        await expect(page.locator('.location-card').getByText(match.club.zone, { exact: true })).toBeVisible();
      }

      if (match.club.lat != null && match.club.lng != null) {
        await expect(page.getByRole('link', { name: /ver .*google maps|ver en mapa/i })).toHaveAttribute(
          'href',
          `https://www.google.com/maps?q=${match.club.lat},${match.club.lng}`,
        );
      }
    }

    await expect(page.getByText(`EQUIPO A`)).toBeVisible();
    await expect(page.getByText(`EQUIPO B`)).toBeVisible();
    // Scope a cada `.team-card` para evitar strict-mode violations cuando ambos
    // equipos comparten el mismo conteo (p.ej. partido lleno con teams balanceados).
    const spotsPerTeam = Math.floor(match.totalSlots / 2);
    const teamACard = page.locator('.team-card').filter({ hasText: 'EQUIPO A' });
    const teamBCard = page.locator('.team-card').filter({ hasText: 'EQUIPO B' });
    await expect(teamACard.locator('.team-count')).toHaveText(
      `${match.participants?.teamACount ?? 0} / ${spotsPerTeam}`,
    );
    await expect(teamBCard.locator('.team-count')).toHaveText(
      `${match.participants?.teamBCount ?? 0} / ${spotsPerTeam}`,
    );

    for (const player of allPlayers(match).slice(0, 4)) {
      await expect(page.getByText(player.displayName).first()).toBeVisible();
    }
  });

  test('muestra CTA de login para sumarse cuando el visitante no esta autenticado', async ({
    page,
    request,
  }) => {
    const match = await findMatch(
      request,
      (candidate) => candidate.status === 'OPEN' && candidate.availableSlots > 0,
    );
    test.skip(!match, 'No hay partido abierto con cupos para validar CTA anonima.');

    await gotoMatchDetail(page, match.id);

    await expect(page.getByRole('link', { name: /inici/i }).first()).toHaveAttribute('href', '/login');
    await expect(page.getByText(/para sumarte a este partido/i)).toBeVisible();
  });

  test('muestra botones "Sumarme" por equipo y envia la mutation correcta', async ({
    page,
    request,
  }) => {
    await login(page);
    const token = await readAccessToken(page);
    const match = await findMatch(
      request,
      (candidate) => candidate.status === 'OPEN' && candidate.canJoin === true && candidate.isCurrentUserJoined === false,
      token,
    );
    test.skip(!match, 'No hay partido abierto con cupos para un usuario no inscripto.');

    const join = await mockGraphQLMutation(page, 'JoinMatch', {
      data: { joinMatch: { success: true, message: null } },
    });

    await gotoMatchDetail(page, match.id);

    const teamAButton = page.getByRole('button', { name: /sumarme al equipo a/i });
    const teamBButton = page.getByRole('button', { name: /sumarme al equipo b/i });

    if ((match.participants?.spotsLeftA ?? 0) > 0) {
      await expect(teamAButton).toBeVisible();
      await teamAButton.click();
      await expect.poll(() => join.payloads.length, { timeout: 10_000 }).toBe(1);
      expect(join.payloads[0]).toMatchObject({
        variables: { input: { matchId: match.id, team: 'A' } },
      });
    } else {
      await expect(page.getByRole('button', { name: /equipo completo/i }).first()).toBeDisabled();
      await expect(teamBButton).toBeVisible();
    }
  });

  test('si el partido esta completo muestra badge "Completo" y no ofrece sumarse', async ({
    page,
    request,
  }) => {
    const match = await findMatch(
      request,
      (candidate) => candidate.status === 'FULL' || candidate.availableSlots === 0,
    );
    test.skip(!match, 'No hay partido completo en el backend para validar el borde FULL.');

    await gotoMatchDetail(page, match.id);

    await expect(page.getByText(/completo/i).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /sumarme/i })).toHaveCount(0);
  });

  test('si el usuario ya esta inscripto muestra estado y opcion para salir', async ({
    page,
    request,
  }) => {
    await login(page);
    const token = await readAccessToken(page);
    const match = await findMatch(
      request,
      (candidate) => candidate.isCurrentUserJoined === true && candidate.status !== 'CANCELLED',
      token,
    );
    test.skip(!match, 'El usuario de prueba no esta inscripto en ningun partido activo.');

    await gotoMatchDetail(page, match.id);

    await expect(page.getByText(/ya est/i).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /salirme del partido/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /sumarme/i })).toHaveCount(0);
  });

  test('muestra error inline si falla la salida del partido', async ({ page, request }) => {
    await login(page);
    const token = await readAccessToken(page);
    const match = await findMatch(
      request,
      (candidate) => candidate.isCurrentUserJoined === true && candidate.status !== 'CANCELLED',
      token,
    );
    test.skip(!match, 'El usuario de prueba no esta inscripto en ningun partido activo.');

    const leave = await mockGraphQLMutation(page, 'LeaveMatch', {
      errors: [{ message: 'No se pudo salir del partido.' }],
    });

    await gotoMatchDetail(page, match.id);

    await page.getByRole('button', { name: /salirme del partido/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: /salirme/i }).click();

    await expect.poll(() => leave.payloads.length, { timeout: 10_000 }).toBe(1);
    await expect(page.getByRole('alert')).toContainText(/no se pudo salir/i);
  });
});
