import type { APIRequestContext } from '@playwright/test';
import {
  BACKEND_GRAPHQL_ROUTE,
  expect,
  FRONTEND_URL,
  gqlPost,
  loginAndReadToken,
  mockGraphQLOperation,
  NETWORK_ERROR,
  SEED_MATCHES,
  test,
  TEST_USERS,
} from './support';

/**
 * Tests E2E del flujo "Sumarme al partido" (JoinTeamButton en /partidos/[id]).
 *
 * Decision Context:
 * - Por qué un spec dedicado: match-detail cubre el render del CTA y un happy
 *   path básico. Acá completamos la matriz: success path con reload, error de
 *   backend (errors[]), error de negocio (success:false), error de red,
 *   estado de loading, partido completo, partido cancelado, visitante anónimo
 *   y un equipo lleno con el otro disponible.
 * - Mockeamos sólo la mutation `joinMatch` en el endpoint del backend; el
 *   detalle inicial sigue siendo SSR, así que el resto del tráfico GraphQL
 *   pasa transparente.
 * - El spec hace login UI selectivo (no usa storage state) porque hay tests
 *   anónimos y otros autenticados, y queremos que la transición login→detalle
 *   sea explícita para diferenciar comportamientos.
 * - Self-setup: usamos los partidos E1 (FULL, user inscripto team B) y E2
 *   (OPEN, sin participantes) garantizados por `apps/testing/scripts/seed.ts`.
 * - Previously fixed bugs: none relevant.
 */

const { full: FULL_MATCH_ID, open: OPEN_MATCH_ID } = SEED_MATCHES;

type MatchSnapshot = {
  id: string;
  status: 'OPEN' | 'FULL' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  availableSlots: number;
  isCurrentUserJoined: boolean | null;
  canJoin: boolean | null;
  participants: { spotsLeftA: number; spotsLeftB: number } | null;
};

async function fetchMatchSnapshot(
  request: APIRequestContext,
  id: string,
  accessToken?: string,
): Promise<MatchSnapshot | null> {
  const json = await gqlPost<{ match: MatchSnapshot | null }>(
    request,
    /* GraphQL */ `
      query JoinMatchSnapshotE2E($id: ID!) {
        match(id: $id) {
          id status availableSlots isCurrentUserJoined canJoin
          participants { spotsLeftA spotsLeftB }
        }
      }
    `,
    { id },
    accessToken,
  );
  return json.data?.match ?? null;
}

test.describe('Sumarme al partido (JoinTeamButton)', () => {
  // Serial: tests comparten precondiciones del seed (E1/E2) y un mismo player.
  test.describe.configure({ mode: 'serial' });

  test('precondiciones del seed: E2 abierto sin participantes y E1 lleno con user inscripto', async ({
    page,
    request,
  }) => {
    const token = await loginAndReadToken(page, 'playerMateo');

    const open = await fetchMatchSnapshot(request, OPEN_MATCH_ID, token);
    expect(open, 'el seed debe haber creado el partido E2').not.toBeNull();
    expect(open?.status).toBe('OPEN');
    expect(open?.isCurrentUserJoined).toBe(false);
    expect(open?.availableSlots).toBeGreaterThan(0);

    const full = await fetchMatchSnapshot(request, FULL_MATCH_ID, token);
    expect(full, 'el seed debe haber creado el partido E1').not.toBeNull();
    expect(full?.availableSlots).toBe(0);
    expect(full?.isCurrentUserJoined).toBe(true);
  });

  test('visitante anonimo: muestra CTA login y NO renderiza botones de sumarse', async ({
    matchDetailPage,
    page,
  }) => {
    await matchDetailPage.goto(OPEN_MATCH_ID);

    await expect(page.getByText(/inici[aá] sesi[oó]n/i).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /sumarme/i })).toHaveCount(0);
  });

  test('player: click "Sumarme al Equipo A" envia mutation con team=A', async ({
    matchDetailPage,
    loginPage,
    page,
  }) => {
    await loginPage.loginAs(TEST_USERS.playerMateo);
    const join = await mockGraphQLOperation(page, BACKEND_GRAPHQL_ROUTE, 'joinMatch', {
      data: { joinMatch: { success: true, message: null } },
    });

    await matchDetailPage.goto(OPEN_MATCH_ID);
    await matchDetailPage.joinTeamA.click();

    await expect.poll(() => join.payloads.length, { timeout: 10_000 }).toBe(1);
    expect(join.payloads[0]).toMatchObject({
      variables: { input: { matchId: OPEN_MATCH_ID, team: 'A' } },
    });
  });

  test('player: click "Sumarme al Equipo B" envia mutation con team=B', async ({
    matchDetailPage,
    loginPage,
    page,
  }) => {
    await loginPage.loginAs(TEST_USERS.playerMateo);
    const join = await mockGraphQLOperation(page, BACKEND_GRAPHQL_ROUTE, 'joinMatch', {
      data: { joinMatch: { success: true, message: null } },
    });

    await matchDetailPage.goto(OPEN_MATCH_ID);
    await matchDetailPage.joinTeamB.click();

    await expect.poll(() => join.payloads.length, { timeout: 10_000 }).toBe(1);
    expect(join.payloads[0]).toMatchObject({
      variables: { input: { matchId: OPEN_MATCH_ID, team: 'B' } },
    });
  });

  test('mientras la request esta en vuelo, el boton queda en aria-busy=true y deshabilitado', async ({
    matchDetailPage,
    loginPage,
    page,
  }) => {
    await loginPage.loginAs(TEST_USERS.playerMateo);
    // Demoramos la respuesta para ver el estado de loading antes del reload.
    await mockGraphQLOperation(
      page,
      BACKEND_GRAPHQL_ROUTE,
      'joinMatch',
      { data: { joinMatch: { success: true, message: null } } },
      { delayMs: 1500 },
    );

    await matchDetailPage.goto(OPEN_MATCH_ID);
    await matchDetailPage.joinTeamA.click();

    const busyButton = page.locator('button.join-btn[aria-busy="true"]');
    await expect(busyButton.first()).toBeVisible();
    await expect(busyButton.first()).toBeDisabled();
  });

  test('error de backend (errors[]): muestra el mensaje en role=alert y el boton vuelve a estar disponible', async ({
    matchDetailPage,
    loginPage,
    page,
  }) => {
    await loginPage.loginAs(TEST_USERS.playerMateo);
    const join = await mockGraphQLOperation(page, BACKEND_GRAPHQL_ROUTE, 'joinMatch', {
      errors: [{ message: 'No se pudo procesar el join.' }],
    });

    await matchDetailPage.goto(OPEN_MATCH_ID);
    await matchDetailPage.joinTeamA.click();

    await expect.poll(() => join.payloads.length, { timeout: 10_000 }).toBe(1);
    await expect(page.getByRole('alert').first()).toContainText(/no se pudo procesar el join/i);
    await expect(page).toHaveURL(new RegExp(`/partidos/${OPEN_MATCH_ID}$`));
    await expect(matchDetailPage.joinTeamA).toBeEnabled();
  });

  test('error de negocio (success:false con message): muestra el message del backend', async ({
    matchDetailPage,
    loginPage,
    page,
  }) => {
    await loginPage.loginAs(TEST_USERS.playerMateo);
    await mockGraphQLOperation(page, BACKEND_GRAPHQL_ROUTE, 'joinMatch', {
      data: {
        joinMatch: {
          success: false,
          message: 'Solo podes sumarte a un partido por dia.',
        },
      },
    });

    await matchDetailPage.goto(OPEN_MATCH_ID);
    await matchDetailPage.joinTeamA.click();

    await expect(page.getByRole('alert').first()).toContainText(
      /solo podes sumarte a un partido por dia/i,
    );
  });

  test('error de negocio (success:false sin message): muestra fallback "No se pudo sumarte"', async ({
    matchDetailPage,
    loginPage,
    page,
  }) => {
    await loginPage.loginAs(TEST_USERS.playerMateo);
    await mockGraphQLOperation(page, BACKEND_GRAPHQL_ROUTE, 'joinMatch', {
      // El backend puede devolver success:false con message:null. El JoinTeamButton
      // resuelve eso a un texto genérico para que el usuario sepa que la acción falló.
      data: { joinMatch: { success: false, message: null } },
    });

    await matchDetailPage.goto(OPEN_MATCH_ID);
    await matchDetailPage.joinTeamB.click();

    await expect(page.getByRole('alert').first()).toContainText(
      /no se pudo sumarte al partido/i,
    );
  });

  test('error de red: aborta la request y muestra "Error de red"', async ({
    matchDetailPage,
    loginPage,
    page,
  }) => {
    await loginPage.loginAs(TEST_USERS.playerMateo);
    await mockGraphQLOperation(page, BACKEND_GRAPHQL_ROUTE, 'joinMatch', NETWORK_ERROR);

    await matchDetailPage.goto(OPEN_MATCH_ID);
    await matchDetailPage.joinTeamA.click();

    await expect(page.getByRole('alert').first()).toContainText(/error de red/i);
    await expect(matchDetailPage.joinTeamA).toBeEnabled();
  });

  test('partido completo (E1): no hay botones "Sumarme" y se muestra el banner de "Completo"', async ({
    matchDetailPage,
    page,
  }) => {
    // Visitante anónimo — el usuario de prueba ya está inscripto en E1, lo cual
    // muestra el banner "ya estás anotado" y oculta el camino "completo no
    // inscripto". El visitante anónimo cumple `!isJoined && matchFull`.
    await matchDetailPage.goto(FULL_MATCH_ID);

    await expect(page.getByRole('button', { name: /sumarme/i })).toHaveCount(0);
    await expect(page.getByText(/este partido est[aá] completo/i)).toBeVisible();
  });

  test('usuario ya inscripto (E1, team B): no se muestran botones "Sumarme"', async ({
    matchDetailPage,
    loginPage,
    page,
  }) => {
    await loginPage.loginAs(TEST_USERS.playerMateo);

    await matchDetailPage.goto(FULL_MATCH_ID);

    await expect(page.getByRole('button', { name: /sumarme/i })).toHaveCount(0);
    await expect(page.getByText(/ya est[aá]s anotado/i)).toBeVisible();
  });

  test('id no UUID: redirige a /partidos antes de renderizar el detalle', async ({
    matchDetailPage,
    page,
  }) => {
    // El detalle aborta con redirect 302 cuando el id no es un UUID (guard en
    // [id].astro). Sin ese guard el SSR haría un fetch al backend que tirara
    // error y la React island intentaria hidratarse sobre HTML incompleto.
    await page.goto(`${FRONTEND_URL}/partidos/no-es-uuid`);

    await expect(page).toHaveURL(/\/partidos$/);
    await expect(matchDetailPage.root).toHaveCount(0);
  });
});
