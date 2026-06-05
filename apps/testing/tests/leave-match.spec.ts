import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import type { APIRequestContext } from '@playwright/test';
import dotenv from 'dotenv';
import {
  BACKEND_GRAPHQL_ROUTE,
  expect,
  gqlPost,
  gqlPostOrThrow,
  loginAndReadToken,
  mockGraphQLOperation,
  SEED_MATCHES,
  test,
} from './support';

const BACKEND_ENV_PATH = path.resolve(__dirname, '..', '..', 'backend', '.env');
dotenv.config({ path: BACKEND_ENV_PATH });

/**
 * Tests E2E del flujo "Salirme del partido" (LeaveMatchButton).
 *
 * Decision Context:
 * - Spec dedicado para cubrir los huecos que match-detail.spec.ts no toca:
 *   diálogo de confirmación, cancelar, success con matchDeleted=false (reload),
 *   success con matchDeleted=true (redirect a /partidos), y estado de loading.
 * - Pattern de mocking: el detalle es SSR; mockeamos sólo `leaveMatch` que sí
 *   sale del browser. Eso permite forzar las dos respuestas exitosas y el
 *   error sin tocar la DB.
 * - Self-setup: para tener un partido donde el player figure como inscripto,
 *   intentamos joinMatch contra cualquier partido OPEN del listado. Si el
 *   backend dice "ya estás inscripto", también nos sirve. Sin candidato,
 *   `test.skip` con mensaje claro.
 * - El modal urgente (<60min) no se testea porque no podemos crear partidos
 *   con start <60min sin acceso de admin a la DB; queda cubierto por testing
 *   manual / inspección visual.
 * - Previously fixed bugs: none relevant.
 */

type MatchSummary = {
  id: string;
  status: 'OPEN' | 'FULL' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  availableSlots: number;
  isCurrentUserJoined: boolean | null;
};

async function fetchMatchesForPlayer(
  request: APIRequestContext,
  accessToken: string,
): Promise<MatchSummary[]> {
  const json = await gqlPost<{ matches: MatchSummary[] }>(
    request,
    /* GraphQL */ `
      query GetMatchesForLeaveE2E {
        matches { id status availableSlots isCurrentUserJoined }
      }
    `,
    undefined,
    accessToken,
  );
  return json.data?.matches ?? [];
}

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
        joinMatch(input: $input) { success message }
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

/**
 * Garantiza que el player de test esté inscripto en algún partido OPEN.
 * Devuelve el `matchId` listo para navegar al detalle. Si no hay candidato,
 * devuelve `null` y el test debe skipearse.
 */
async function ensureJoinedMatch(
  request: APIRequestContext,
  accessToken: string,
): Promise<string | null> {
  const matches = await fetchMatchesForPlayer(request, accessToken);

  // El listado matches NO popula isCurrentUserJoined (sólo el detalle lo hace), así
  // que intentamos joinMatch directo: el backend nos dice si ya estábamos inscriptos.
  for (const match of matches) {
    if (match.status !== 'OPEN' || match.availableSlots <= 0) continue;
    if ((await tryJoinTeam(request, accessToken, match.id, 'A')).ok) return match.id;
    if ((await tryJoinTeam(request, accessToken, match.id, 'B')).ok) return match.id;
  }
  return null;
}

test.describe('Salirme del partido (LeaveMatchButton)', () => {
  // Serial: tests comparten el mismo player y el setup de "estar inscripto".
  test.describe.configure({ mode: 'serial' });

  test('al hacer click en "Salirme del partido" aparece el diálogo de confirmación', async ({
    matchDetailPage,
    page,
    request,
  }) => {
    const token = await loginAndReadToken(page, 'playerRicardo');
    const matchId = await ensureJoinedMatch(request, token);
    test.skip(!matchId, 'No hay partidos OPEN con cupo en la DB para inscribir al player.');
    if (!matchId) return;

    await matchDetailPage.goto(matchId);
    await matchDetailPage.openLeaveDialog();

    await expect(matchDetailPage.confirmDialog.getByText(/¿(querés|estás seguro)/i)).toBeVisible();
    await expect(matchDetailPage.confirmLeaveButton).toBeVisible();
    await expect(matchDetailPage.cancelLeaveButton).toBeVisible();
  });

  test('click en "Cancelar" cierra el diálogo y vuelve al estado inicial', async ({
    matchDetailPage,
    page,
    request,
  }) => {
    const token = await loginAndReadToken(page, 'playerRicardo');
    const matchId = await ensureJoinedMatch(request, token);
    test.skip(!matchId, 'No hay partidos OPEN con cupo en la DB para inscribir al player.');
    if (!matchId) return;

    await matchDetailPage.goto(matchId);
    await matchDetailPage.openLeaveDialog();
    await matchDetailPage.cancelLeaveButton.click();

    await expect(matchDetailPage.confirmDialog).toHaveCount(0);
    await expect(matchDetailPage.leaveButton).toBeVisible();
  });

  test('confirmar exitoso con matchDeleted=false → la página recarga y queda en /partidos/[id]', async ({
    matchDetailPage,
    page,
    request,
  }) => {
    const token = await loginAndReadToken(page, 'playerRicardo');
    const matchId = await ensureJoinedMatch(request, token);
    test.skip(!matchId, 'No hay partidos OPEN con cupo en la DB para inscribir al player.');
    if (!matchId) return;

    // Mockeamos el éxito SIN borrar el partido para no romper el seed.
    const leave = await mockGraphQLOperation(page, BACKEND_GRAPHQL_ROUTE, 'leaveMatch', {
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

    await matchDetailPage.goto(matchId);
    await matchDetailPage.openLeaveDialog();
    await matchDetailPage.confirmLeaveButton.click();

    await expect.poll(() => leave.payloads.length, { timeout: 10_000 }).toBe(1);
    await expect(page).toHaveURL(new RegExp(`/partidos/${matchId}`));
  });

  test('confirmar exitoso con matchDeleted=true → redirige a /partidos', async ({
    matchDetailPage,
    page,
    request,
  }) => {
    const token = await loginAndReadToken(page, 'playerRicardo');
    const matchId = await ensureJoinedMatch(request, token);
    test.skip(!matchId, 'No hay partidos OPEN con cupo en la DB para inscribir al player.');
    if (!matchId) return;

    const leave = await mockGraphQLOperation(page, BACKEND_GRAPHQL_ROUTE, 'leaveMatch', {
      data: { leaveMatch: { matchDeleted: true, match: null } },
    });

    await matchDetailPage.goto(matchId);
    await matchDetailPage.openLeaveDialog();
    await matchDetailPage.confirmLeaveButton.click();

    await expect.poll(() => leave.payloads.length, { timeout: 10_000 }).toBe(1);
    await expect(page).toHaveURL(/\/partidos$/);
  });

  test('si el backend devuelve un error, se muestra el mensaje y el botón vuelve a estar disponible', async ({
    matchDetailPage,
    page,
    request,
  }) => {
    const token = await loginAndReadToken(page, 'playerRicardo');
    const matchId = await ensureJoinedMatch(request, token);
    test.skip(!matchId, 'No hay partidos OPEN con cupo en la DB para inscribir al player.');
    if (!matchId) return;

    await mockGraphQLOperation(page, BACKEND_GRAPHQL_ROUTE, 'leaveMatch', {
      errors: [{ message: 'No se pudo procesar la solicitud.' }],
    });

    await matchDetailPage.goto(matchId);
    await matchDetailPage.openLeaveDialog();
    await matchDetailPage.confirmLeaveButton.click();

    await expect(page.getByRole('alert')).toContainText(/no se pudo procesar/i);
    await expect(page).toHaveURL(new RegExp(`/partidos/${matchId}`));
    await expect(matchDetailPage.leaveButton).toBeVisible();
  });

  test('mientras la request está en vuelo, el botón muestra "Procesando…" y queda deshabilitado', async ({
    matchDetailPage,
    page,
    request,
  }) => {
    const token = await loginAndReadToken(page, 'playerRicardo');
    const matchId = await ensureJoinedMatch(request, token);
    test.skip(!matchId, 'No hay partidos OPEN con cupo en la DB para inscribir al player.');
    if (!matchId) return;

    await mockGraphQLOperation(
      page,
      BACKEND_GRAPHQL_ROUTE,
      'leaveMatch',
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

    await matchDetailPage.goto(matchId);
    await matchDetailPage.openLeaveDialog();
    await matchDetailPage.confirmLeaveButton.click();

    const loading = page.getByRole('button', { name: /procesando/i });
    await expect(loading).toBeVisible();
    await expect(loading).toBeDisabled();
    await expect(loading).toHaveAttribute('aria-busy', 'true');
  });
});

test.describe('Auto-cancel cuando leaveMatch deja 0 jugadores', () => {
  test('conserva el partido como CANCELLED, limpia participantes, notifica e invalida caches', async ({
    page,
    request,
  }) => {
    const token = await loginAndReadToken(page, 'playerRicardo');

    const before = await fetchMatchAutoCancelDetail(request, token);
    expect(before).toMatchObject({
      id: SEED_MATCHES.emptyAutoCancel,
      status: 'OPEN',
      isCurrentUserJoined: true,
      participants: { totalCount: 1 },
    });

    const result = await gqlPostOrThrow<{
      leaveMatch: {
        matchDeleted: boolean;
        match: MatchAutoCancelDetail | null;
      };
    }>(
      request,
      /* GraphQL */ `
        mutation LeaveLastParticipantAutoCancelE2E($input: LeaveMatchInput!) {
          leaveMatch(input: $input) {
            matchDeleted
            match {
              id
              status
              availableSlots
              isCurrentUserJoined
              participants {
                teamACount
                teamBCount
                totalCount
              }
            }
          }
        }
      `,
      { input: { matchId: SEED_MATCHES.emptyAutoCancel } },
      token,
    ).then((data) => data.leaveMatch);

    expect(result.matchDeleted).toBe(false);
    expect(result.match).toMatchObject({
      id: SEED_MATCHES.emptyAutoCancel,
      status: 'CANCELLED',
      isCurrentUserJoined: false,
      participants: {
        teamACount: 0,
        teamBCount: 0,
        totalCount: 0,
      },
    });

    const dbMatch = await readAutoCancelMatchState(SEED_MATCHES.emptyAutoCancel);
    expect(dbMatch.status).toBe('cancelled');
    expect(dbMatch.cancellationReason).toMatch(/no quedan jugadores/i);
    await expect.poll(() => countParticipants(SEED_MATCHES.emptyAutoCancel)).toBe(0);

    const notifications = await readOrganizerAutoCancelNotifications(
      SEED_MATCHES.emptyAutoCancel,
      dbMatch.organizerId,
    );
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({
      userId: dbMatch.organizerId,
      type: 'match_auto_cancelled',
      referenceId: SEED_MATCHES.emptyAutoCancel,
      isRead: false,
    });
    expect(notifications[0].body).toMatch(/no quedan jugadores/i);

    const fresh = await fetchMatchAutoCancelDetail(request, token);
    expect(fresh).toMatchObject({
      id: SEED_MATCHES.emptyAutoCancel,
      status: 'CANCELLED',
      isCurrentUserJoined: false,
      participants: { totalCount: 0 },
    });
  });
});

type MatchAutoCancelDetail = {
  id: string;
  status: 'OPEN' | 'FULL' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  availableSlots: number;
  isCurrentUserJoined: boolean | null;
  participants: {
    teamACount: number;
    teamBCount: number;
    totalCount: number;
  } | null;
};

type AutoCancelMatchRow = {
  id: string;
  status: string;
  cancellationReason: string | null;
  organizerId: string;
};

type AutoCancelNotificationRow = {
  id: string;
  userId: string;
  type: string;
  title: string | null;
  body: string | null;
  referenceId: string;
  isRead: boolean;
};

async function fetchMatchAutoCancelDetail(
  request: APIRequestContext,
  accessToken: string,
): Promise<MatchAutoCancelDetail | null> {
  return gqlPostOrThrow<{ match: MatchAutoCancelDetail | null }>(
    request,
    /* GraphQL */ `
      query GetAutoCancelMatchE2E($id: ID!) {
        match(id: $id) {
          id
          status
          availableSlots
          isCurrentUserJoined
          participants {
            teamACount
            teamBCount
            totalCount
          }
        }
      }
    `,
    { id: SEED_MATCHES.emptyAutoCancel },
    accessToken,
  ).then((data) => data.match);
}

function requiredBackendEnv(name: string): string {
  const value = process.env[name];
  expect(value, `${name} debe existir en ${BACKEND_ENV_PATH}`).toBeTruthy();
  return value as string;
}

function adminClient() {
  return createClient(
    requiredBackendEnv('SUPABASE_URL'),
    requiredBackendEnv('PRIVATE_SUPABASE_SECRET_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

async function readAutoCancelMatchState(matchId: string): Promise<AutoCancelMatchRow> {
  const { data, error } = await adminClient()
    .from('matches')
    .select('id, status, "cancellationReason", "organizerId"')
    .eq('id', matchId)
    .single();

  expect(error, 'No debe fallar la lectura DB del partido auto-cancelado').toBeNull();
  expect(data, 'El fixture E4 debe seguir existiendo despues del leaveMatch').toBeTruthy();
  return data as AutoCancelMatchRow;
}

async function countParticipants(matchId: string): Promise<number> {
  const { count, error } = await adminClient()
    .from('matchParticipants')
    .select('id', { count: 'exact', head: true })
    .eq('matchId', matchId);

  expect(error, 'No debe fallar el conteo DB de participantes').toBeNull();
  return count ?? 0;
}

async function readOrganizerAutoCancelNotifications(
  matchId: string,
  organizerId: string,
): Promise<AutoCancelNotificationRow[]> {
  const { data, error } = await adminClient()
    .from('notifications')
    .select('id, "userId", type, title, body, "referenceId", "isRead"')
    .eq('referenceId', matchId)
    .eq('userId', organizerId)
    .eq('type', 'match_auto_cancelled');

  expect(error, 'No debe fallar la lectura DB de notificaciones').toBeNull();
  return (data ?? []) as AutoCancelNotificationRow[];
}
