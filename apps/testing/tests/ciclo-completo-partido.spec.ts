import type { APIRequestContext } from '@playwright/test';
import {
  expect,
  FRONTEND_URL,
  gqlPost,
  gqlPostOrThrow,
  loginApiAndGetToken,
  SEED_MATCHES,
  test,
  TEST_USERS,
} from './support';

/**
 * Ciclo completo de partido — test E2E multi-usuario.
 *
 * Decision Context:
 * - Objetivo: verificar que un partido puede llenarse con múltiples jugadores
 *   usando cuentas distintas, que la página del organizador refleja los conteos
 *   reales después de cada unión, y que el estado "Completo" se muestra
 *   correctamente cuando no quedan cupos.
 *
 * - Estrategia de datos:
 *   - E5 (SEED_MATCHES.fullCycle): partido dedicado a este spec. El seed lo
 *     garantiza en estado 'open' con 0 participantes en cada corrida.
 *     Mateo y Ricardo se unen vía API (harness multi-token: loginApiAndGetToken
 *     + gqlPostOrThrow) en beforeAll y se van con leaveMatch en afterAll.
 *     Los conteos se verifican desde el SSR (page.reload() ↔ DB real).
 *   - E1 (SEED_MATCHES.full): 10 participantes sembrados. Se usa solo para
 *     navegar y verificar el estado "Completo" sin tocar la DB.
 *
 * - Harness multi-token (loginApiAndGetToken):
 *   Llama directamente a POST /api/auth/login del backend y extrae el
 *   accessToken del cuerpo de la respuesta. Permite obtener tokens de varios
 *   usuarios en el mismo test sin abrir un segundo navegador.
 *
 * - Por qué no 10 cuentas reales:
 *   Solo existen 2 cuentas de jugador de prueba (playerMateo, playerRicardo).
 *   El estado "partido lleno con 10 jugadores" se prueba con E1, que el seed
 *   garantiza con exactamente 10 participantes y availableSlots=0.
 *
 * - SSR no mockeable:
 *   El detalle de partido se renderiza server-side. page.reload() → recarga
 *   real desde la DB. Los conteos se reflejan sin necesitar mocks de GraphQL.
 *
 * - Contextos anónimos/Ricardo:
 *   Para verificar el banner "Completo" desde la perspectiva de un usuario que
 *   no está en el partido, se crea un browser.newContext() fresco (anónimo
 *   o con el storageState de Ricardo). Esto sigue la regla de e2e-testing.md:
 *   "para casos anónimos y autenticados, usar newContext() para el anónimo y
 *   dejar el test.use({ storageState }) para los demás".
 *
 * - Previously fixed bugs: none relevant.
 */

// GraphQL mutations inline (no operacion en el barrel; estos son para setup/teardown vía API)
const JOIN_MATCH_MUTATION = /* GraphQL */ `
  mutation JoinMatchCicloCompleto($input: JoinMatchInput!) {
    joinMatch(input: $input) {
      success
      message
    }
  }
`;

const LEAVE_MATCH_MUTATION = /* GraphQL */ `
  mutation LeaveMatchCicloCompleto($input: LeaveMatchInput!) {
    leaveMatch(input: $input) {
      matchDeleted
      match {
        id
        status
        availableSlots
      }
    }
  }
`;

// Snapshot query for API-level precondition and border-case checks
const MATCH_SNAPSHOT_QUERY = /* GraphQL */ `
  query MatchSnapshotCicloCompleto($id: ID!) {
    match(id: $id) {
      id
      status
      availableSlots
      isCurrentUserJoined
      canJoin
      participants {
        totalCount
        spotsLeftA
        spotsLeftB
      }
    }
  }
`;

type MatchSnapshot = {
  id: string;
  status: string;
  availableSlots: number;
  isCurrentUserJoined: boolean | null;
  canJoin: boolean | null;
  participants: { totalCount: number; spotsLeftA: number; spotsLeftB: number } | null;
};

async function fetchSnapshot(
  request: APIRequestContext,
  matchId: string,
  token?: string,
): Promise<MatchSnapshot | null> {
  const result = await gqlPost<{ match: MatchSnapshot | null }>(
    request,
    MATCH_SNAPSHOT_QUERY,
    { id: matchId },
    token,
  );
  return result.data?.match ?? null;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe('Ciclo completo de partido (multi-usuario)', () => {
  test.describe.configure({ mode: 'serial' });

  // Default authenticated context: Mateo.
  // Tests that need Ricardo or an anonymous view create a fresh browser.newContext().
  test.use({ storageState: TEST_USERS.playerMateo.storageStatePath });

  let mateoToken: string;
  let ricardoToken: string;

  test.beforeAll(async ({ request }) => {
    // ── Multi-token harness: REST login for both players ──────────────────────
    mateoToken = await loginApiAndGetToken(
      request,
      TEST_USERS.playerMateo.email,
      TEST_USERS.playerMateo.password,
    );
    ricardoToken = await loginApiAndGetToken(
      request,
      TEST_USERS.playerRicardo.email,
      TEST_USERS.playerRicardo.password,
    );

    // ── Idempotent cleanup: leave E5 in case of leftover state ────────────────
    // gqlPost (not OrThrow) so failures here don't abort setup
    await gqlPost(
      request,
      LEAVE_MATCH_MUTATION,
      { input: { matchId: SEED_MATCHES.fullCycle } },
      mateoToken,
    );
    await gqlPost(
      request,
      LEAVE_MATCH_MUTATION,
      { input: { matchId: SEED_MATCHES.fullCycle } },
      ricardoToken,
    );

    // ── Real API joins ────────────────────────────────────────────────────────
    const joinMateo = await gqlPostOrThrow<{ joinMatch: { success: boolean; message: string | null } }>(
      request,
      JOIN_MATCH_MUTATION,
      { input: { matchId: SEED_MATCHES.fullCycle, team: 'A' } },
      mateoToken,
    );
    expect(joinMateo.joinMatch.success, 'Mateo debe poder unirse al partido E5').toBe(true);

    const joinRicardo = await gqlPostOrThrow<{ joinMatch: { success: boolean; message: string | null } }>(
      request,
      JOIN_MATCH_MUTATION,
      { input: { matchId: SEED_MATCHES.fullCycle, team: 'B' } },
      ricardoToken,
    );
    expect(joinRicardo.joinMatch.success, 'Ricardo debe poder unirse al partido E5').toBe(true);
  });

  test.afterAll(async ({ request }) => {
    if (!mateoToken || !ricardoToken) return;
    await gqlPost(
      request,
      LEAVE_MATCH_MUTATION,
      { input: { matchId: SEED_MATCHES.fullCycle } },
      mateoToken,
    );
    await gqlPost(
      request,
      LEAVE_MATCH_MUTATION,
      { input: { matchId: SEED_MATCHES.fullCycle } },
      ricardoToken,
    );
  });

  // ── Test 1: Precondiciones via API ─────────────────────────────────────────

  test('precondiciones: E5 tiene 2 participantes reales y E1 está lleno (10/0)', async ({
    request,
  }) => {
    const e5 = await fetchSnapshot(request, SEED_MATCHES.fullCycle, mateoToken);
    expect(e5, 'E5 debe existir en la DB').not.toBeNull();
    expect(e5?.participants?.totalCount).toBe(2);
    expect(e5?.availableSlots).toBe(8);
    expect(e5?.isCurrentUserJoined).toBe(true); // Mateo está inscripto

    const e1 = await fetchSnapshot(request, SEED_MATCHES.full, mateoToken);
    expect(e1, 'E1 debe existir en la DB').not.toBeNull();
    expect(e1?.availableSlots).toBe(0);
    expect(e1?.isCurrentUserJoined).toBe(true); // Mateo también está en E1 (desde el seed)
  });

  // ── Test 2: Vista SSR refleja los participantes reales ─────────────────────

  test('la página (SSR) refleja 1 jugador en equipo A y 1 en equipo B', async ({
    matchDetailPage,
  }) => {
    await matchDetailPage.goto(SEED_MATCHES.fullCycle);

    // SSR recarga desde la DB real → debe ver a Mateo en A y Ricardo en B
    await matchDetailPage.expectTeamCounts(1, 1, 5);

    // Los player-cards muestran los nombres sembrados por el seed
    await expect(matchDetailPage.playerCard('Mateo Duran E2E')).toBeVisible();
    await expect(matchDetailPage.playerCard('Ricardo E2E')).toBeVisible();

    // El partido sigue abierto con 8 cupos — no debe mostrar el banner "completo"
    await expect(matchDetailPage.fullBanner).not.toBeVisible();
  });

  // ── Test 3: Mateo ya está inscripto — UI lo indica correctamente ───────────

  test('jugador ya inscripto ve "Estás en este equipo" y no ve botones de unirse', async ({
    matchDetailPage,
    page,
  }) => {
    await matchDetailPage.goto(SEED_MATCHES.fullCycle);
    // Mateo está en equipo A → la sección del equipo A debe indicarlo
    await expect(page.locator('.cta-in-team').first()).toBeVisible();
    await expect(matchDetailPage.joinTeamA).not.toBeVisible();
  });

  // ── Test 4: Partido completo (E1) — visitante anónimo ve banner completo ───

  test('partido completo: visitante anónimo ve banner "Este partido está completo"', async ({
    page,
  }) => {
    // Open a fresh unauthenticated context to test the non-joined view
    const guestCtx = await page.context().browser()!.newContext();
    const guestPage = await guestCtx.newPage();
    try {
      await guestPage.goto(`${FRONTEND_URL}/partidos/${SEED_MATCHES.full}`);
      await expect(guestPage.locator('.match-detail')).toBeVisible();
      await expect(guestPage.locator('.banner--full')).toBeVisible();
      await expect(guestPage.locator('.banner--full')).toContainText('Este partido está completo');
      // No active join buttons for anonymous users on a full match
      await expect(guestPage.getByRole('button', { name: /sumarme/i })).toHaveCount(0);
    } finally {
      await guestCtx.close();
    }
  });

  // ── Test 5: Aserción de borde — UI impide que un jugador válido se una ─────

  test('aserción de borde: jugador inscribible ve "Completo" en lugar de botones en partido lleno', async ({
    page,
  }) => {
    // Navigate as Ricardo (not in E1) so we get the "not joined" perspective
    const ricardoCtx = await page.context().browser()!.newContext({
      storageState: TEST_USERS.playerRicardo.storageStatePath,
    });
    const ricardoPage = await ricardoCtx.newPage();
    try {
      await ricardoPage.goto(`${FRONTEND_URL}/partidos/${SEED_MATCHES.full}`);
      await expect(ricardoPage.locator('.match-detail')).toBeVisible();

      // Full banner must be visible (Ricardo is not joined)
      await expect(ricardoPage.locator('.banner--full')).toBeVisible();

      // The team CTAs show "Completo" text instead of active join buttons
      const completoTexts = ricardoPage.locator('.cta-disabled', { hasText: /^Completo$/ });
      await expect(completoTexts.first()).toBeVisible();

      // No active JoinTeamButton rendered
      await expect(ricardoPage.getByRole('button', { name: /sumarme/i })).toHaveCount(0);
    } finally {
      await ricardoCtx.close();
    }
  });

  // ── Test 6: Aserción de borde — API también rechaza unión a partido lleno ──

  test('aserción de borde: API rechaza unión de Ricardo a partido E1 lleno', async ({
    request,
  }) => {
    // Ricardo is NOT in E1 but E1 has 0 available slots → backend must reject
    const result = await gqlPost<{ joinMatch: { success: boolean; message: string | null } }>(
      request,
      JOIN_MATCH_MUTATION,
      { input: { matchId: SEED_MATCHES.full, team: 'B' } },
      ricardoToken,
    );

    // The backend returns success:false (not a GraphQL error) when the match is full
    const joinResult = result.data?.joinMatch;
    expect(
      joinResult?.success === false || (result.errors?.length ?? 0) > 0,
      'La API debe rechazar la unión a un partido lleno',
    ).toBe(true);
  });
});
