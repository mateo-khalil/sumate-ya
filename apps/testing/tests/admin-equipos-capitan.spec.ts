import type { Page, Route } from '@playwright/test';
import {
  BACKEND_GRAPHQL_URL,
  expect,
  FRONTEND_URL,
  GRAPHQL_AUTH_ROUTE,
  GRAPHQL_PROXY_ROUTE,
  gqlPost,
  readAccessToken,
  SEED_TEAMS,
  SEED_TOURNAMENTS,
  test,
  TEST_USERS,
} from './support';

/**
 * E2E - administrador/capitan de equipos permanentes.
 *
 * Decision Context:
 * - /equipos y /equipos/[id] hacen fetch SSR contra el backend real, asi que el
 *   globalSetup seed crea equipos permanentes deterministas para Mateo/Ricardo.
 * - Las acciones client-side se mockean en /api/graphql-auth o /api/graphql para
 *   no mutar la DB durante el spec: invitar, cancelar invitacion, disponibilidad,
 *   inscripcion/retiro de torneos y configuracion.
 * - Los checks de seguridad usan GraphQL directo sin token para verificar que el
 *   backend rechaza mutations sensibles fuera de un contexto autenticado.
 */

const CAPTAIN_TEAM_ID = SEED_TEAMS.captainTeam;
const CLAIMABLE_TEAM_ID = SEED_TEAMS.claimableTeam;

const TEAM_URL = `${FRONTEND_URL}/equipos/${CAPTAIN_TEAM_ID}`;

const mockPlayer = {
  id: 'f3000000-0000-0000-0000-000000000010',
  displayName: 'Jugador Invitado E2E',
  avatarUrl: null,
  preferredPosition: 'MIDFIELDER',
};

function readBody(route: Route): { query?: string; variables?: Record<string, unknown> } {
  return JSON.parse(route.request().postData() ?? '{}') as {
    query?: string;
    variables?: Record<string, unknown>;
  };
}

async function mockTeamAuthOperations(page: Page): Promise<{ payloads: Array<{ query?: string; variables?: Record<string, unknown> }> }> {
  const payloads: Array<{ query?: string; variables?: Record<string, unknown> }> = [];

  await page.unroute(GRAPHQL_AUTH_ROUTE).catch(() => undefined);
  await page.route(GRAPHQL_AUTH_ROUTE, async (route) => {
    const body = readBody(route);
    payloads.push(body);

    if (body.query?.includes('SearchPlayers')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { searchPlayers: [mockPlayer] } }),
      });
      return;
    }

    if (body.query?.includes('InvitePlayer')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            invitePlayer: {
              success: true,
              message: 'Invitacion enviada',
              invitation: {
                id: 'f3000000-0000-0000-0000-000000000020',
                status: 'PENDING',
                expiresAt: '2027-01-01T00:00:00Z',
              },
            },
          },
        }),
      });
      return;
    }

    if (body.query?.includes('TeamInvitations')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            teamInvitations: [
              {
                id: 'f3000000-0000-0000-0000-000000000021',
                status: 'PENDING',
                message: 'Sumate al equipo',
                expiresAt: '2027-01-01T00:00:00Z',
                respondedAt: null,
                createdAt: '2026-01-01T00:00:00Z',
                invitedPlayer: mockPlayer,
                invitedBy: {
                  id: 'f43d137c-9367-47f8-99e1-0e7a2130cc1d',
                  displayName: 'Mateo Duran E2E',
                  avatarUrl: null,
                  preferredPosition: null,
                },
                team: { id: CAPTAIN_TEAM_ID, name: 'Equipo Capitan Permanente E2E' },
              },
              {
                id: 'f3000000-0000-0000-0000-000000000022',
                status: 'REJECTED',
                message: null,
                expiresAt: '2027-01-01T00:00:00Z',
                respondedAt: '2026-01-02T00:00:00Z',
                createdAt: '2026-01-01T00:00:00Z',
                invitedPlayer: {
                  ...mockPlayer,
                  id: 'f3000000-0000-0000-0000-000000000011',
                  displayName: 'Jugador Rechazado E2E',
                },
                invitedBy: {
                  id: 'f43d137c-9367-47f8-99e1-0e7a2130cc1d',
                  displayName: 'Mateo Duran E2E',
                  avatarUrl: null,
                  preferredPosition: null,
                },
                team: { id: CAPTAIN_TEAM_ID, name: 'Equipo Capitan Permanente E2E' },
              },
            ],
          },
        }),
      });
      return;
    }

    if (body.query?.includes('CancelInvitation')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { cancelInvitation: { success: true, message: 'Cancelada' } } }),
      });
      return;
    }

    if (body.query?.includes('TeamAvailabilityMatrix')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            teamAvailabilityMatrix: [
              {
                dayOfWeek: 1,
                startTime: '19:00:00',
                availableCount: 2,
                availablePlayers: [
                  {
                    id: 'f43d137c-9367-47f8-99e1-0e7a2130cc1d',
                    displayName: 'Mateo Duran E2E',
                    avatarUrl: null,
                    preferredPosition: null,
                  },
                  {
                    id: 'f3000000-0000-0000-0000-000000000012',
                    displayName: 'Ricardo E2E',
                    avatarUrl: null,
                    preferredPosition: null,
                  },
                ],
              },
              {
                dayOfWeek: 3,
                startTime: '20:00:00',
                availableCount: 1,
                availablePlayers: [
                  {
                    id: 'f3000000-0000-0000-0000-000000000012',
                    displayName: 'Ricardo E2E',
                    avatarUrl: null,
                    preferredPosition: null,
                  },
                ],
              },
            ],
          },
        }),
      });
      return;
    }

    if (body.query?.includes('MyTeamAvailability')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            myTeamAvailability: [
              {
                id: 'f3000000-0000-0000-0000-000000000030',
                dayOfWeek: 1,
                startTime: '19:00:00',
                endTime: '21:00:00',
                isRecurrent: true,
              },
            ],
          },
        }),
      });
      return;
    }

    if (body.query?.includes('SetMyAvailability')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { setMyAvailability: { success: true, message: 'Ok' } } }),
      });
      return;
    }

    if (body.query?.includes('TeamEnrollments')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            teamEnrollments: [
              {
                id: 'f3000000-0000-0000-0000-000000000040',
                teamId: CAPTAIN_TEAM_ID,
                tournamentId: SEED_TOURNAMENTS.open,
                tournamentName: 'Torneo Inscripto E2E',
                tournamentStatus: 'REGISTRATION',
                format: 'SEVEN_VS_SEVEN',
                teamCount: 4,
                enrolledAt: '2026-01-01T00:00:00Z',
              },
            ],
          },
        }),
      });
      return;
    }

    if (body.query?.includes('EnrollTeamInTournament')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            enrollTeamInTournament: {
              success: true,
              message: 'Equipo inscripto. Revisa las advertencias de disponibilidad.',
              warnings: ['Ronda 1 (Lunes 19:00): solo 2 de 7 jugadores disponibles (minimo requerido: 7)'],
            },
          },
        }),
      });
      return;
    }

    if (body.query?.includes('LeaveTournament')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            leaveTournament: {
              success: true,
              message: 'Tu equipo fue retirado del torneo exitosamente',
              tournamentStatus: 'REGISTRATION',
              remainingTeams: 1,
            },
          },
        }),
      });
      return;
    }

    if (body.query?.includes('UpdateTeam')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            updateTeam: {
              success: true,
              message: 'Equipo actualizado',
              team: null,
            },
          },
        }),
      });
      return;
    }

    if (body.query?.includes('GetTeam')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            team: {
              id: CAPTAIN_TEAM_ID,
              name: 'Equipo Capitan Actualizado E2E',
              captainId: 'f43d137c-9367-47f8-99e1-0e7a2130cc1d',
              captain: null,
              logoUrl: 'https://example.com/logo.png',
              format: 'FIVE_VS_FIVE',
              description: 'Equipo actualizado desde E2E',
              isActive: true,
              memberCount: 2,
              members: [],
              createdAt: '2026-01-01T00:00:00Z',
              updatedAt: '2026-01-01T00:00:00Z',
            },
          },
        }),
      });
      return;
    }

    await route.continue();
  });

  return { payloads };
}

async function mockTournamentsProxy(page: Page): Promise<void> {
  await page.unroute(GRAPHQL_PROXY_ROUTE).catch(() => undefined);
  await page.route(GRAPHQL_PROXY_ROUTE, async (route) => {
    if (route.request().url().includes('graphql-auth')) {
      await route.fallback();
      return;
    }

    const body = readBody(route);
    if (body.query?.includes('GetTournaments')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            tournaments: [
              {
                id: 'f3000000-0000-0000-0000-000000000050',
                name: 'Copa Disponibilidad E2E',
                format: 'SEVEN_VS_SEVEN',
                teamCount: 4,
                playersPerTeam: 7,
                registeredTeamsCount: 1,
                status: 'REGISTRATION',
                description: null,
                startDate: '2027-01-01',
                endDate: '2027-02-01',
                club: {
                  id: 'f3000000-0000-0000-0000-000000000060',
                  name: 'Club Fixture E2E',
                  zone: null,
                  address: null,
                  lat: null,
                  lng: null,
                  imageUrl: null,
                },
              },
            ],
          },
        }),
      });
      return;
    }
    await route.continue();
  });
}

test.describe('Administrador/capitan de equipo permanente', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ storageState: TEST_USERS.playerMateo.storageStatePath });

  test('capitan ve su equipo, badge en navbar y acceso a crear torneo', async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/equipos`);

    await expect(page.getByRole('heading', { name: /mis equipos/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /equipo capitan permanente e2e/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /crear torneo/i })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.captain-badge-nav')).toContainText(/equipo capitan permanente/i, {
      timeout: 15_000,
    });
  });

  test('capitan puede invitar jugadores y ver/cancelar invitaciones enviadas', async ({ page }) => {
    const { payloads } = await mockTeamAuthOperations(page);

    await page.goto(TEAM_URL);
    await page.getByRole('button', { name: /invitar jugador/i }).first().click();
    await page.getByPlaceholder(/buscar por nombre/i).fill('Invitado');
    await page.getByRole('button', { name: /jugador invitado e2e/i }).click();
    await page.getByLabel(/mensaje/i).fill('Sumate al equipo');
    await page.getByRole('button', { name: /enviar invitaci/i }).click();

    await expect(page.getByText(/invitaci/i).filter({ hasText: /enviada/i })).toBeVisible({
      timeout: 10_000,
    });
    const invitePayload = payloads.find((payload) => payload.query?.includes('InvitePlayer'));
    expect(invitePayload?.variables?.input).toMatchObject({
      teamId: CAPTAIN_TEAM_ID,
      playerId: mockPlayer.id,
      message: 'Sumate al equipo',
    });

    await page.getByRole('tab', { name: /invitaciones/i }).click();
    await expect(page.getByText('Jugador Invitado E2E')).toBeVisible();
    await expect(page.getByText('Jugador Rechazado E2E')).toBeVisible();

    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: /cancelar invitaci/i }).click();
    await expect
      .poll(() => payloads.some((payload) => payload.query?.includes('CancelInvitation')))
      .toBe(true);
  });

  test('capitan ve disponibilidad agregada y guarda sus horarios', async ({ page }) => {
    const { payloads } = await mockTeamAuthOperations(page);

    await page.goto(TEAM_URL);
    await page.getByRole('tab', { name: /disponibilidad/i }).click();

    const mondayCell = page.getByRole('button', { name: /lun 19:00:00: 2 jugadores disponibles/i });
    await expect(mondayCell).toBeVisible();
    await mondayCell.click();
    await expect(page.getByRole('tooltip')).toContainText(/mateo duran e2e/i);
    await expect(page.getByRole('tooltip')).toContainText(/ricardo e2e/i);

    await page.getByRole('button', { name: /agregar horario/i }).click();
    await page.getByRole('button', { name: /guardar disponibilidad/i }).click();
    await expect(page.getByRole('alert')).toContainText(/disponibilidad guardada/i);

    const availabilityPayload = payloads.find((payload) => payload.query?.includes('SetMyAvailability'));
    expect(availabilityPayload?.variables?.input).toMatchObject({ teamId: CAPTAIN_TEAM_ID });
    expect((availabilityPayload?.variables?.input as { slots?: unknown[] }).slots?.length).toBeGreaterThan(0);
  });

  test('capitan inscribe y retira el equipo de torneos con warnings de disponibilidad', async ({
    page,
  }) => {
    const { payloads } = await mockTeamAuthOperations(page);
    await mockTournamentsProxy(page);

    await page.goto(TEAM_URL);
    await page.getByRole('tab', { name: /torneos/i }).click();
    await expect(page.getByText('Torneo Inscripto E2E')).toBeVisible();

    await page.getByRole('button', { name: /inscribir a torneo/i }).click();
    await expect(page.getByText('Copa Disponibilidad E2E')).toBeVisible();
    await page.getByRole('button', { name: /^inscribir$/i }).click();
    await expect(page.getByText(/advertencias de disponibilidad/i)).toBeVisible();
    await expect(page.getByText(/solo 2 de 7 jugadores disponibles/i)).toBeVisible();

    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: /retirar de torneo inscripto e2e/i }).click();
    await expect
      .poll(() => payloads.some((payload) => payload.query?.includes('LeaveTournament')))
      .toBe(true);
  });

  test('capitan configura nombre, logo y formato del equipo', async ({ page }) => {
    const { payloads } = await mockTeamAuthOperations(page);

    await page.goto(TEAM_URL);
    await page.getByRole('tab', { name: /configuraci/i }).click();
    await page.getByLabel(/nombre del equipo/i).fill('Equipo Capitan Actualizado E2E');
    await page.getByLabel(/^formato$/i).selectOption('FIVE_VS_FIVE');
    await page.getByLabel(/url del logo/i).fill('https://example.com/logo.png');
    await page.getByLabel(/descripci/i).fill('Equipo actualizado desde E2E');
    await page.getByRole('button', { name: /guardar cambios/i }).click();

    await expect(page.getByRole('alert')).toContainText(/cambios guardados/i);
    const updatePayload = payloads.find((payload) => payload.query?.includes('UpdateTeam'));
    expect(updatePayload?.variables?.input).toMatchObject({
      teamId: CAPTAIN_TEAM_ID,
      name: 'Equipo Capitan Actualizado E2E',
      format: 'FIVE_VS_FIVE',
      logoUrl: 'https://example.com/logo.png',
    });
  });

  test('miembro no capitan ve lista de jugadores y no ve tabs administrativos', async ({ browser }) => {
    const context = await browser.newContext({ storageState: TEST_USERS.playerRicardo.storageStatePath });
    const page = await context.newPage();
    try {
      await page.goto(TEAM_URL);
      await expect(page.getByRole('heading', { name: /equipo capitan permanente e2e/i })).toBeVisible();
      await expect(page.getByText(/miembro/i).first()).toBeVisible();
      await expect(page.getByRole('tab', { name: /miembros/i })).toBeVisible();
      await expect(page.getByRole('tab', { name: /disponibilidad/i })).toBeVisible();
      await expect(page.getByRole('tab', { name: /torneos/i })).not.toBeVisible();
      await expect(page.getByRole('tab', { name: /configuraci/i })).not.toBeVisible();
      await expect(page.getByRole('button', { name: /invitar jugador/i })).not.toBeVisible();
    } finally {
      await context.close();
    }
  });

  test('jugador comun no puede crear torneo desde la UI', async ({ browser }) => {
    const context = await browser.newContext({ storageState: TEST_USERS.playerRicardo.storageStatePath });
    const page = await context.newPage();
    try {
      await page.goto(`${FRONTEND_URL}/torneos/crear`);
      await expect(page.getByRole('heading', { name: /solo capitanes pueden crear torneos/i })).toBeVisible();
      await expect(page.getByRole('link', { name: /ir a mis equipos/i })).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test('miembro puede reclamar capitania cuando el equipo no tiene capitan', async ({ page, request }) => {
    await page.goto(`${FRONTEND_URL}/equipos`);
    const token = await readAccessToken(page);

    const response = await gqlPost<{
      claimCaptain: { success: boolean; message: string; team: { id: string; captainId: string } | null };
    }>(
      request,
      `mutation ClaimCaptainE2E($teamId: ID!) {
        claimCaptain(teamId: $teamId) { success message team { id captainId } }
      }`,
      { teamId: CLAIMABLE_TEAM_ID },
      token,
    );

    expect(response.errors ?? []).toHaveLength(0);
    expect(response.data?.claimCaptain.success).toBe(true);
    expect(response.data?.claimCaptain.team?.id).toBe(CLAIMABLE_TEAM_ID);
  });
});

test.describe('Invitaciones recibidas de equipo', () => {
  test.use({ storageState: TEST_USERS.playerRicardo.storageStatePath });

  async function mockReceivedInvitation(page: Page, payloads: Array<{ query?: string; variables?: Record<string, unknown> }>) {
    await page.route(GRAPHQL_AUTH_ROUTE, async (route) => {
      const body = readBody(route);
      payloads.push(body);
      if (body.query?.includes('MyPendingInvitations')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              myPendingInvitations: [
                {
                  id: SEED_TEAMS.pendingInvitation,
                  status: 'PENDING',
                  message: 'Te esperamos para el proximo torneo',
                  expiresAt: '2027-01-01T00:00:00Z',
                  createdAt: '2026-01-01T00:00:00Z',
                  team: {
                    id: CAPTAIN_TEAM_ID,
                    name: 'Equipo Invitador E2E',
                    format: 'SEVEN_VS_SEVEN',
                    memberCount: 6,
                  },
                  invitedPlayer: mockPlayer,
                  invitedBy: {
                    id: 'f43d137c-9367-47f8-99e1-0e7a2130cc1d',
                    displayName: 'Mateo Duran E2E',
                    avatarUrl: null,
                    preferredPosition: null,
                  },
                },
              ],
            },
          }),
        });
        return;
      }
      if (body.query?.includes('RespondInvitation')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { respondInvitation: { success: true, message: 'Ok' } } }),
        });
        return;
      }
      await route.continue();
    });
  }

  test('jugador rechaza invitaciones desde Mis Equipos', async ({ page }) => {
    const payloads: Array<{ query?: string; variables?: Record<string, unknown> }> = [];

    await mockReceivedInvitation(page, payloads);

    await page.goto(`${FRONTEND_URL}/equipos`);
    await expect(page.getByText('Equipo Invitador E2E')).toBeVisible();
    await page.getByRole('button', { name: /rechazar/i }).click();
    await expect(page.getByText('Equipo Invitador E2E')).not.toBeVisible();

    const rejectPayload = payloads.find((payload) => payload.query?.includes('RespondInvitation'));
    expect(rejectPayload?.variables?.input).toMatchObject({
      invitationId: SEED_TEAMS.pendingInvitation,
      accept: false,
    });
  });

  test('jugador acepta invitaciones desde Mis Equipos', async ({ page }) => {
    const payloads: Array<{ query?: string; variables?: Record<string, unknown> }> = [];
    await mockReceivedInvitation(page, payloads);

    await page.goto(`${FRONTEND_URL}/equipos`);
    await expect(page.getByText('Equipo Invitador E2E')).toBeVisible();
    await page.getByRole('button', { name: /unirme al equipo/i }).click();

    await expect
      .poll(() => payloads.find((payload) => payload.query?.includes('RespondInvitation'))?.variables)
      .toMatchObject({
        input: {
          invitationId: SEED_TEAMS.pendingInvitation,
          accept: true,
        },
      });
  });
});

test.describe('Seguridad backend de equipos', () => {
  test('mutations sensibles sin token retornan error de autenticacion', async ({ request }) => {
    const invite = await gqlPost(
      request,
      `mutation InvitePlayerUnauth($input: InvitePlayerInput!) {
        invitePlayer(input: $input) { success message }
      }`,
      {
        input: {
          teamId: CAPTAIN_TEAM_ID,
          playerId: mockPlayer.id,
          message: null,
        },
      },
    );
    expect(invite.errors?.[0]?.message).toMatch(/auth|unauth|required|token/i);

    const enroll = await gqlPost(
      request,
      `mutation EnrollTeamUnauth($teamId: ID!, $tournamentId: ID!) {
        enrollTeamInTournament(teamId: $teamId, tournamentId: $tournamentId) { success message warnings }
      }`,
      { teamId: CAPTAIN_TEAM_ID, tournamentId: SEED_TOURNAMENTS.open },
    );
    expect(enroll.errors?.[0]?.message).toMatch(/auth|unauth|required|token/i);

    const claim = await gqlPost(
      request,
      `mutation ClaimCaptainUnauth($teamId: ID!) {
        claimCaptain(teamId: $teamId) { success message team { id } }
      }`,
      { teamId: CLAIMABLE_TEAM_ID },
    );
    expect(claim.errors?.[0]?.message).toMatch(/auth|unauth|required|token/i);
  });

  test('backend graphQL esta disponible para los tests de autorizacion', async ({ request }) => {
    const response = await request.post(BACKEND_GRAPHQL_URL, {
      data: { query: '{ __typename }' },
    });
    expect(response.ok()).toBe(true);
  });
});
