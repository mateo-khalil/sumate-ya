import { expect, test, type APIRequestContext, type Page, type Route } from '@playwright/test';

/**
 * Tests E2E del flujo "Salirme del partido" (LeaveMatchButton en /partidos/[id]).
 *
 * Decision Context:
 * - Por qué un spec dedicado en vez de extender match-detail.spec.ts: ese spec ya cubre
 *   el render del botón y el caso de error. Acá agregamos los huecos: diálogo de
 *   confirmación, cancelar, success con matchDeleted=false (reload), success con
 *   matchDeleted=true (redirect a /partidos), y el estado de loading.
 * - Pattern de mocking: el detalle del partido es SSR (no se puede interceptar desde el
 *   browser), pero la mutation `leaveMatch` la dispara la React island desde el browser
 *   con `fetch`, así que SÍ la mockeamos con `page.route('**\/graphql')`. Eso nos
 *   permite forzar las dos respuestas exitosas y el error sin depender del estado real
 *   de la DB.
 * - Self-setup: para tener un partido donde el usuario figure como inscripto, en el
 *   beforeEach buscamos uno donde ya esté joined; si no, hacemos `joinMatch` via GraphQL
 *   contra un partido OPEN cualquiera. Esto evita pedirle al dev que primero se inscriba
 *   manualmente desde la UI antes de correr la suite.
 * - Por qué NO testeamos el modal urgente (<60min): no podemos crear partidos que
 *   arranquen en <60min sin acceso de admin a la DB. La rama urgente queda cubierta por
 *   inspección visual / testing manual; el test de "diálogo normal" valida la rama
 *   ≥60min que es la habitual.
 * - Assumptions:
 *   * Frontend en :4321 y backend en :4000.
 *   * Existe al menos 1 partido OPEN con cupo en la cloud DB (de lo contrario, no
 *     podemos joined ni leave — los tests skipean con mensaje claro).
 *   * El usuario `ricardo@gmail.com` (player) puede unirse a partidos del listado.
 * - Previously fixed bugs: none relevant.
 */

const FRONTEND_URL = 'http://localhost:4321';
const BACKEND_GRAPHQL_URL = 'http://localhost:4000/graphql';
const BACKEND_GRAPHQL_ROUTE = '**/graphql';
const ACCESS_TOKEN_COOKIE = 'sumateya-access-token';

const TEST_PLAYER = {
  email: 'ricardo@gmail.com',
  password: 'bbbb1234',
};

type MatchSummary = {
  id: string;
  status: 'OPEN' | 'FULL' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  availableSlots: number;
  isCurrentUserJoined: boolean | null;
};

// ─────────────────────────── Helpers ───────────────────────────

async function login(page: Page): Promise<void> {
  await page.goto(`${FRONTEND_URL}/login`);
  await page.getByRole('textbox', { name: 'Email' }).fill(TEST_PLAYER.email);
  await page.getByRole('textbox', { name: /contrase/i }).fill(TEST_PLAYER.password);
  await page.getByRole('button', { name: /ingresar/i }).click();
  await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 10_000 });
}

async function readAccessToken(page: Page): Promise<string> {
  const cookies = await page.context().cookies(FRONTEND_URL);
  const token = cookies.find((c) => c.name === ACCESS_TOKEN_COOKIE)?.value;
  expect(token, 'el login debe dejar cookie de access token').toBeTruthy();
  return token as string;
}

async function gqlPost<T>(
  request: APIRequestContext,
  query: string,
  variables: Record<string, unknown> | undefined,
  accessToken: string,
): Promise<{ data?: T; errors?: Array<{ message: string }> }> {
  const response = await request.post(BACKEND_GRAPHQL_URL, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    data: { query, variables },
  });
  return (await response.json()) as { data?: T; errors?: Array<{ message: string }> };
}

async function fetchMatchesForPlayer(
  request: APIRequestContext,
  accessToken: string,
): Promise<MatchSummary[]> {
  const json = await gqlPost<{ matches: MatchSummary[] }>(
    request,
    /* GraphQL */ `
      query GetMatchesForLeaveE2E {
        matches {
          id
          status
          availableSlots
          isCurrentUserJoined
        }
      }
    `,
    undefined,
    accessToken,
  );
  return json.data?.matches ?? [];
}

/**
 * Garantiza que el player de test esté inscripto en algún partido OPEN.
 * Devuelve el `matchId` listo para navegar a `/partidos/<id>`. Si no hay partidos
 * candidatos, devuelve `null` y los tests deben skipearse.
 */
/**
 * Intenta unirse a un partido al equipo `team`. Devuelve true si el join fue exitoso o
 * si el backend indica que ya estaba inscripto (ambos casos sirven para nuestra setup).
 */
async function tryJoinTeam(
  request: APIRequestContext,
  accessToken: string,
  matchId: string,
  team: 'A' | 'B',
): Promise<{ ok: boolean; reason: string }> {
  const resp = await gqlPost<{ joinMatch: { success: boolean; message: string } }>(
    request,
    /* GraphQL */ `
      mutation JoinForLeaveE2E($input: JoinMatchInput!) {
        joinMatch(input: $input) {
          success
          message
        }
      }
    `,
    { input: { matchId, team } },
    accessToken,
  );

  if (resp.data?.joinMatch?.success) return { ok: true, reason: 'joined' };

  const msg = (resp.data?.joinMatch?.message ?? resp.errors?.[0]?.message ?? '').toLowerCase();
  // El backend usa varios wording: "ya estás inscripto", "ya formás parte", etc.
  if (msg.includes('ya') && (msg.includes('inscript') || msg.includes('parte'))) {
    return { ok: true, reason: 'already-joined' };
  }
  return { ok: false, reason: msg || 'unknown error' };
}

async function ensureJoinedMatch(
  request: APIRequestContext,
  accessToken: string,
): Promise<string | null> {
  const matches = await fetchMatchesForPlayer(request, accessToken);

  // El listado matches NO popula isCurrentUserJoined (solo el detalle lo hace), así
  // que no podemos filtrar por "ya estoy inscripto" sin hacer un fetch por partido.
  // En su lugar, intentamos joinMatch directo y dejamos que el backend nos diga
  // "ya estás inscripto" — eso también cuenta como éxito para el setup.
  for (const match of matches) {
    if (match.status !== 'OPEN' || match.availableSlots <= 0) continue;

    // joinMatch requiere `team: MatchTeam!` (A o B). Probamos A primero; si está
    // lleno o falla por team-specific, probamos B.
    const tryA = await tryJoinTeam(request, accessToken, match.id, 'A');
    if (tryA.ok) return match.id;

    const tryB = await tryJoinTeam(request, accessToken, match.id, 'B');
    if (tryB.ok) return match.id;
  }

  return null;
}

/**
 * Mockea SOLO la mutation `leaveMatch` y deja pasar el resto del tráfico GraphQL.
 * Devuelve un objeto con `payloads` para verificar que la mutation efectivamente se
 * disparó (y con qué variables).
 */
async function mockLeaveMatch(
  page: Page,
  body: unknown,
  options: { delayMs?: number } = {},
): Promise<{ payloads: unknown[] }> {
  const payloads: unknown[] = [];

  await page.route(BACKEND_GRAPHQL_ROUTE, async (route: Route) => {
    const raw = route.request().postData() ?? '{}';
    const parsed = JSON.parse(raw) as { query?: string };

    if (!parsed.query?.includes('leaveMatch')) {
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

async function gotoMatchDetail(page: Page, matchId: string): Promise<void> {
  await page.goto(`${FRONTEND_URL}/partidos/${matchId}`);
  await expect(page.locator('.match-detail')).toBeVisible();
}

// ─────────────────────────── Tests ───────────────────────────

test.describe('Salirme del partido (LeaveMatchButton)', () => {
  // Serial: todos comparten el mismo player y la setup de "estar inscripto"; correr en
  // paralelo causaría que los tests se pisen entre sí (uno deja el partido y el otro
  // ya no lo ve).
  test.describe.configure({ mode: 'serial' });

  test('al hacer click en "Salirme del partido" aparece el diálogo de confirmación', async ({
    page,
    request,
  }) => {
    await login(page);
    const token = await readAccessToken(page);
    const matchId = await ensureJoinedMatch(request, token);
    test.skip(!matchId, 'No hay partidos OPEN con cupo en la DB para inscribir al player.');

    await gotoMatchDetail(page, matchId);

    await page.getByRole('button', { name: /salirme del partido/i }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/¿(querés|estás seguro)/i)).toBeVisible();
    await expect(dialog.getByRole('button', { name: /sí, salirme/i })).toBeVisible();
    await expect(dialog.getByRole('button', { name: /cancelar/i })).toBeVisible();
  });

  test('click en "Cancelar" cierra el diálogo y vuelve al estado inicial', async ({
    page,
    request,
  }) => {
    await login(page);
    const token = await readAccessToken(page);
    const matchId = await ensureJoinedMatch(request, token);
    test.skip(!matchId, 'No hay partidos OPEN con cupo en la DB para inscribir al player.');

    await gotoMatchDetail(page, matchId);

    await page.getByRole('button', { name: /salirme del partido/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.getByRole('button', { name: /cancelar/i }).click();

    await expect(page.getByRole('dialog')).toHaveCount(0);
    // El botón principal vuelve a estar visible (estado idle).
    await expect(page.getByRole('button', { name: /salirme del partido/i })).toBeVisible();
  });

  test('confirmar exitoso con matchDeleted=false → la página se recarga y queda en /partidos/[id]', async ({
    page,
    request,
  }) => {
    await login(page);
    const token = await readAccessToken(page);
    const matchId = await ensureJoinedMatch(request, token);
    test.skip(!matchId, 'No hay partidos OPEN con cupo en la DB para inscribir al player.');

    // El flujo real haría leave de verdad y se quedaría sin partido — para no romper
    // el seed de la DB mockeamos la respuesta exitosa SIN borrar el partido.
    const leave = await mockLeaveMatch(page, {
      data: {
        leaveMatch: {
          matchDeleted: false,
          match: {
            id: matchId,
            status: 'OPEN',
            availableSlots: 99,
            participants: { teamACount: 0, teamBCount: 0, totalCount: 0 },
          },
        },
      },
    });

    await gotoMatchDetail(page, matchId);

    await page.getByRole('button', { name: /salirme del partido/i }).click();
    await page.getByRole('button', { name: /sí, salirme/i }).click();

    // La mutation se disparó exactamente 1 vez.
    await expect.poll(() => leave.payloads.length, { timeout: 10_000 }).toBe(1);

    // Tras el reload, sigue en la misma URL (no hubo redirect a /partidos).
    await expect(page).toHaveURL(new RegExp(`/partidos/${matchId}`));
  });

  test('confirmar exitoso con matchDeleted=true → redirige a /partidos', async ({
    page,
    request,
  }) => {
    await login(page);
    const token = await readAccessToken(page);
    const matchId = await ensureJoinedMatch(request, token);
    test.skip(!matchId, 'No hay partidos OPEN con cupo en la DB para inscribir al player.');

    const leave = await mockLeaveMatch(page, {
      data: {
        leaveMatch: {
          matchDeleted: true,
          match: null,
        },
      },
    });

    await gotoMatchDetail(page, matchId);

    await page.getByRole('button', { name: /salirme del partido/i }).click();
    await page.getByRole('button', { name: /sí, salirme/i }).click();

    await expect.poll(() => leave.payloads.length, { timeout: 10_000 }).toBe(1);

    // La página redirige al listado cuando el partido se autodestruyó (último jugador).
    await expect(page).toHaveURL(/\/partidos$/);
  });

  test('si el backend devuelve un error, se muestra el mensaje y el botón vuelve a estar disponible', async ({
    page,
    request,
  }) => {
    await login(page);
    const token = await readAccessToken(page);
    const matchId = await ensureJoinedMatch(request, token);
    test.skip(!matchId, 'No hay partidos OPEN con cupo en la DB para inscribir al player.');

    await mockLeaveMatch(page, {
      errors: [{ message: 'No se pudo procesar la solicitud.' }],
    });

    await gotoMatchDetail(page, matchId);

    await page.getByRole('button', { name: /salirme del partido/i }).click();
    await page.getByRole('button', { name: /sí, salirme/i }).click();

    // El error aparece en un role=alert. Sigue en la misma página.
    await expect(page.getByRole('alert')).toContainText(/no se pudo procesar/i);
    await expect(page).toHaveURL(new RegExp(`/partidos/${matchId}`));
    // El botón de salirme vuelve a estar visible para que el user pueda reintentar.
    await expect(page.getByRole('button', { name: /salirme del partido/i })).toBeVisible();
  });

  test('mientras la request está en vuelo, el botón muestra "Procesando…" y queda deshabilitado', async ({
    page,
    request,
  }) => {
    await login(page);
    const token = await readAccessToken(page);
    const matchId = await ensureJoinedMatch(request, token);
    test.skip(!matchId, 'No hay partidos OPEN con cupo en la DB para inscribir al player.');

    // Demoramos la respuesta 1.5s para poder ver el estado "loading".
    await mockLeaveMatch(
      page,
      {
        data: {
          leaveMatch: {
            matchDeleted: false,
            match: {
              id: matchId,
              status: 'OPEN',
              availableSlots: 99,
              participants: { teamACount: 0, teamBCount: 0, totalCount: 0 },
            },
          },
        },
      },
      { delayMs: 1500 },
    );

    await gotoMatchDetail(page, matchId);

    await page.getByRole('button', { name: /salirme del partido/i }).click();
    await page.getByRole('button', { name: /sí, salirme/i }).click();

    // Estado loading: aparece el botón con "Procesando…" deshabilitado y aria-busy.
    const loading = page.getByRole('button', { name: /procesando/i });
    await expect(loading).toBeVisible();
    await expect(loading).toBeDisabled();
    await expect(loading).toHaveAttribute('aria-busy', 'true');
  });
});
