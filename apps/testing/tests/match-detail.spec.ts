import type { APIRequestContext } from '@playwright/test';
import {
  BACKEND_GRAPHQL_ROUTE,
  expect,
  FRONTEND_URL,
  gqlPostOrThrow,
  loginAndReadToken,
  mockGraphQLOperation,
  test,
} from './support';

/**
 * Tests E2E de Detalle de Partido (/partidos/[id]).
 *
 * Decision Context:
 * - Esta página es SSR: Astro consulta `match(id)` en el servidor antes de
 *   enviar HTML. Por eso `page.route()` no puede mockear el detalle inicial
 *   como si fuera un fetch del browser. Los tests buscan fixtures reales via
 *   GraphQL y validan la UI contra ese contrato.
 * - Los casos que dependen del estado del seed (full, ya inscripto, abierto
 *   con cupos) usan `test.skip` cuando no existe un partido compatible. Así
 *   la suite no inventa datos falsos ni modifica Supabase para forzar bordes.
 * - Las acciones client-side de sumarse/salirse SI se mockean: esos botones
 *   hacen fetch desde el browser al backend GraphQL → `page.route()` aplica.
 * - Este spec hace login UI (no usa storage state) porque algunos tests son
 *   anónimos y otros requieren un token explícito para hacer queries directas
 *   contra el backend; mantener un solo flujo de login es más legible.
 */

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

async function fetchMatchIds(request: APIRequestContext): Promise<string[]> {
  const data = await gqlPostOrThrow<{ matches: Array<{ id: string }> }>(
    request,
    /* GraphQL */ `
      query GetMatchesForDetailE2E {
        matches { id }
      }
    `,
  );
  return data.matches.map((m) => m.id);
}

async function fetchMatchDetail(
  request: APIRequestContext,
  id: string,
  accessToken?: string,
): Promise<MatchDetail | null> {
  const data = await gqlPostOrThrow<{ match: MatchDetail | null }>(
    request,
    /* GraphQL */ `
      query GetMatchDetailForE2E($id: ID!) {
        match(id: $id) {
          id title startTime format totalSlots availableSlots status description organizerId
          currentUserTeam
          club { id name zone address lat lng phone }
          participants {
            teamA { id displayName avatarUrl preferredPosition }
            teamB { id displayName avatarUrl preferredPosition }
            teamACount teamBCount totalCount spotsLeftA spotsLeftB
          }
          isCurrentUserJoined canJoin
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

function allPlayers(match: MatchDetail): TeamMember[] {
  return [...(match.participants?.teamA ?? []), ...(match.participants?.teamB ?? [])];
}

test.describe('Detalle de Partido (/partidos/[id])', () => {
  test.describe.configure({ mode: 'serial' });

  test('redirige al listado cuando el id no es un UUID valido', async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/partidos/no-es-un-uuid`);

    await expect(page).toHaveURL(/\/partidos$/);
  });

  test('muestra datos completos del partido, club, ubicacion y equipos', async ({
    matchDetailPage,
    page,
    request,
  }) => {
    const match = await findMatch(request, () => true);
    test.skip(!match, 'No hay partidos disponibles en el backend para validar el detalle.');
    if (!match) return;

    await matchDetailPage.goto(match.id);

    await expect(page.getByRole('heading', { name: match.title })).toBeVisible();
    await expect(page.getByText(FORMAT_LABEL[match.format], { exact: true }).first()).toBeVisible();
    await expect(
      page.getByText(new RegExp(`${match.participants?.totalCount ?? 0} / ${match.totalSlots}`)),
    ).toBeVisible();

    if (match.description) {
      await expect(page.locator('.match-desc')).toContainText(match.description);
    }

    const organizer = match.organizerId
      ? allPlayers(match).find((p) => p.id === match.organizerId)
      : null;
    if (organizer) {
      await expect(page.getByText('Organizador').first()).toBeVisible();
      await expect(page.getByText(organizer.displayName).first()).toBeVisible();
    }

    if (match.club) {
      await expect(page.getByRole('heading', { name: match.club.name })).toBeVisible();
      if (match.club.address) {
        await expect(
          page.locator('.location-card').getByText(match.club.address, { exact: true }),
        ).toBeVisible();
      }
      if (match.club.zone) {
        await expect(
          page.locator('.location-card').getByText(match.club.zone, { exact: true }),
        ).toBeVisible();
      }
      if (match.club.lat != null && match.club.lng != null) {
        await expect(
          page.getByRole('link', { name: /ver .*google maps|ver en mapa/i }),
        ).toHaveAttribute('href', `https://www.google.com/maps?q=${match.club.lat},${match.club.lng}`);
      }
    }

    await expect(page.getByText('EQUIPO A')).toBeVisible();
    await expect(page.getByText('EQUIPO B')).toBeVisible();
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
    matchDetailPage,
    page,
    request,
  }) => {
    const match = await findMatch(request, (c) => c.status === 'OPEN' && c.availableSlots > 0);
    test.skip(!match, 'No hay partido abierto con cupos para validar CTA anónima.');
    if (!match) return;

    await matchDetailPage.goto(match.id);

    await expect(page.getByRole('link', { name: /inici/i }).first()).toHaveAttribute(
      'href',
      '/login',
    );
    await expect(page.getByText(/para sumarte a este partido/i)).toBeVisible();
  });

  test('muestra botones "Sumarme" por equipo y envia la mutation correcta', async ({
    matchDetailPage,
    page,
    request,
  }) => {
    const token = await loginAndReadToken(page, 'playerMateo');
    const match = await findMatch(
      request,
      (c) => c.status === 'OPEN' && c.canJoin === true && c.isCurrentUserJoined === false,
      token,
    );
    test.skip(!match, 'No hay partido abierto con cupos para un usuario no inscripto.');
    if (!match) return;

    const join = await mockGraphQLOperation(page, BACKEND_GRAPHQL_ROUTE, 'joinMatch', {
      data: { joinMatch: { success: true, message: null } },
    });

    await matchDetailPage.goto(match.id);

    if ((match.participants?.spotsLeftA ?? 0) > 0) {
      await expect(matchDetailPage.joinTeamA).toBeVisible();
      await matchDetailPage.joinTeamA.click();
      await expect.poll(() => join.payloads.length, { timeout: 10_000 }).toBe(1);
      expect(join.payloads[0]).toMatchObject({
        variables: { input: { matchId: match.id, team: 'A' } },
      });
    } else {
      await expect(page.getByRole('button', { name: /equipo completo/i }).first()).toBeDisabled();
      await expect(matchDetailPage.joinTeamB).toBeVisible();
    }
  });

  test('si el partido esta completo muestra badge "Completo" y no ofrece sumarse', async ({
    matchDetailPage,
    page,
    request,
  }) => {
    const match = await findMatch(
      request,
      (c) => c.status === 'FULL' || c.availableSlots === 0,
    );
    test.skip(!match, 'No hay partido completo en el backend para validar el borde FULL.');
    if (!match) return;

    await matchDetailPage.goto(match.id);

    await expect(page.getByText(/completo/i).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /sumarme/i })).toHaveCount(0);
  });

  test('si el usuario ya esta inscripto muestra estado y opcion para salir', async ({
    matchDetailPage,
    page,
    request,
  }) => {
    const token = await loginAndReadToken(page, 'playerMateo');
    const match = await findMatch(
      request,
      (c) => c.isCurrentUserJoined === true && c.status !== 'CANCELLED',
      token,
    );
    test.skip(!match, 'El usuario de prueba no está inscripto en ningún partido activo.');
    if (!match) return;

    await matchDetailPage.goto(match.id);

    await expect(page.getByText(/ya est/i).first()).toBeVisible();
    await expect(matchDetailPage.leaveButton).toBeVisible();
    await expect(page.getByRole('button', { name: /sumarme/i })).toHaveCount(0);
  });

  test('muestra error inline si falla la salida del partido', async ({
    matchDetailPage,
    page,
    request,
  }) => {
    const token = await loginAndReadToken(page, 'playerMateo');
    const match = await findMatch(
      request,
      (c) => c.isCurrentUserJoined === true && c.status !== 'CANCELLED',
      token,
    );
    test.skip(!match, 'El usuario de prueba no está inscripto en ningún partido activo.');
    if (!match) return;

    const leave = await mockGraphQLOperation(page, BACKEND_GRAPHQL_ROUTE, 'leaveMatch', {
      errors: [{ message: 'No se pudo salir del partido.' }],
    });

    await matchDetailPage.goto(match.id);
    await matchDetailPage.openLeaveDialog();
    await page.getByRole('button', { name: /salirme/i }).click();

    await expect.poll(() => leave.payloads.length, { timeout: 10_000 }).toBe(1);
    await expect(page.getByRole('alert')).toContainText(/no se pudo salir/i);
  });
});
