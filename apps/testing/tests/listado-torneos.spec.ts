import {
  buildTournament,
  expect,
  GRAPHQL_AUTH_ROUTE,
  GRAPHQL_PROXY_ROUTE,
  mockGraphQLAll,
  mockGraphQLOperation,
  test,
  TEST_USERS,
} from './support';

/**
 * Tests E2E — US #33 Listado de torneos (/torneos).
 *
 * Decision Context:
 * - La página tiene SSR shell (prerender = false) pero TournamentList hidrata
 *   cliente con client:visible. La query tournaments() se hace browser-side vía
 *   fetch('/api/graphql'), por lo que se puede interceptar con
 *   mockGraphQLAll(GRAPHQL_PROXY_ROUTE) antes de cada goto().
 * - isAuthenticated se inyecta server-side desde Astro.locals.user. Para ver
 *   "Anotar equipo" (autenticado) o "Iniciar sesión para anotar" (anónimo), hay
 *   que controlar el storageState a nivel describe.
 * - El filtro cliente keepRegistrationOnly() corre después del fetch: torneos
 *   con status !== 'REGISTRATION' del mock no aparecen en la lista.
 * - La mutación joinTournament envía a /api/graphql-auth. Los tests de submit
 *   mockean esa ruta con mockGraphQLAll(GRAPHQL_AUTH_ROUTE) para no escribir en DB.
 * - Los skeletons de carga son <div> normales; cuando aparece un <article> o el
 *   estado vacío sabemos que la hidratación y el fetch completaron.
 * - Previously fixed bugs: none relevant.
 */

/* ══════════════════════════════════════════════════════════════════════════
   Bloque 1 — Layout, estados de lista y usuario anónimo
   ══════════════════════════════════════════════════════════════════════════ */

test.describe('Listado de torneos — layout y estados', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    // Default mock: empty list. Individual tests override before goto().
    await mockGraphQLAll(page, GRAPHQL_PROXY_ROUTE, { data: { tournaments: [] } });
  });

  test('renderiza el heading y el subtítulo al navegar a /torneos', async ({ tournamentsPage }) => {
    await tournamentsPage.goto();

    await expect(tournamentsPage.heading).toBeVisible();
    await expect(tournamentsPage.subtitle).toBeVisible();
  });

  test('muestra estado vacío cuando no hay torneos', async ({ tournamentsPage }) => {
    await tournamentsPage.goto();
    await tournamentsPage.expectListSettled();

    await expect(tournamentsPage.emptyState).toBeVisible();
  });

  test('muestra panel de error cuando la query falla', async ({ tournamentsPage, page }) => {
    await mockGraphQLAll(page, GRAPHQL_PROXY_ROUTE, {
      errors: [{ message: 'Error de conexión con el servidor' }],
    });

    await tournamentsPage.goto();
    await tournamentsPage.expectListSettled();

    await expect(tournamentsPage.errorPanel).toBeVisible();
    await expect(page.getByText('Error de conexión con el servidor')).toBeVisible();
  });

  test('botón Reintentar en el panel de error recarga la lista', async ({
    tournamentsPage,
    page,
  }) => {
    // First load fails
    await mockGraphQLAll(page, GRAPHQL_PROXY_ROUTE, {
      errors: [{ message: 'Timeout' }],
    });
    await tournamentsPage.goto();
    await expect(tournamentsPage.errorPanel).toBeVisible({ timeout: 15_000 });

    // Mock changes to return data before clicking Reintentar
    await mockGraphQLAll(page, GRAPHQL_PROXY_ROUTE, {
      data: { tournaments: [buildTournament({ name: 'Copa Retry' })] },
    });
    await tournamentsPage.retryButton.click();

    await expect(tournamentsPage.card('Copa Retry')).toBeVisible({ timeout: 10_000 });
  });

  test('renderiza cards con nombre, formato y progreso de equipos', async ({
    tournamentsPage,
    page,
  }) => {
    await mockGraphQLAll(page, GRAPHQL_PROXY_ROUTE, {
      data: {
        tournaments: [
          buildTournament({ id: 'aaa-1', name: 'Copa Norte', format: 'FIVE_VS_FIVE', registeredTeamsCount: 3, teamCount: 8 }),
          buildTournament({ id: 'aaa-2', name: 'Liga Sur', format: 'SEVEN_VS_SEVEN', registeredTeamsCount: 6, teamCount: 8 }),
        ],
      },
    });

    await tournamentsPage.goto();
    await tournamentsPage.expectListSettled();

    await expect(tournamentsPage.card('Copa Norte')).toBeVisible();
    await expect(tournamentsPage.card('Liga Sur')).toBeVisible();
    // Format badges
    await expect(page.getByText('5v5').first()).toBeVisible();
    await expect(page.getByText('7v7').first()).toBeVisible();
    // Progress counters
    await expect(page.getByText('3/8 equipos')).toBeVisible();
    await expect(page.getByText('6/8 equipos')).toBeVisible();
  });

  test('muestra el club y la zona en el card', async ({ tournamentsPage, page }) => {
    await mockGraphQLAll(page, GRAPHQL_PROXY_ROUTE, {
      data: {
        tournaments: [
          buildTournament({
            name: 'Copa Club',
            club: { id: 'c1', name: 'Club Palermo', zone: 'Norte', address: null, imageUrl: null },
          }),
        ],
      },
    });

    await tournamentsPage.goto();
    await tournamentsPage.expectListSettled();

    await expect(page.getByText('Club Palermo')).toBeVisible();
    // Scope the zone to the card: the new TournamentFilters Zona <select> also renders
    // a "Norte" <option>, so an unscoped getByText(/Norte/) hits a strict-mode violation.
    await expect(tournamentsPage.card('Copa Club').getByText(/Norte/)).toBeVisible();
  });

  test('muestra "Fecha a confirmar" cuando startDate es null', async ({
    tournamentsPage,
    page,
  }) => {
    await mockGraphQLAll(page, GRAPHQL_PROXY_ROUTE, {
      data: { tournaments: [buildTournament({ startDate: null, name: 'Copa Sin Fecha' })] },
    });

    await tournamentsPage.goto();
    await tournamentsPage.expectListSettled();

    await expect(page.getByText('Fecha a confirmar')).toBeVisible();
  });

  test('filtro cliente: torneos IN_PROGRESS no aparecen en la lista', async ({
    tournamentsPage,
    page,
  }) => {
    // Tanto IN_PROGRESS como COMPLETED deben ser filtrados por keepRegistrationOnly()
    await mockGraphQLAll(page, GRAPHQL_PROXY_ROUTE, {
      data: {
        tournaments: [
          buildTournament({ name: 'Torneo Activo', status: 'IN_PROGRESS' }),
          buildTournament({ name: 'Torneo Terminado', status: 'COMPLETED' }),
        ],
      },
    });

    await tournamentsPage.goto();
    await tournamentsPage.expectListSettled();

    // Client-side filter eliminates both → empty state shows
    await expect(tournamentsPage.emptyState).toBeVisible({ timeout: 10_000 });
  });

  test('torneo completo muestra "Completo" deshabilitado', async ({ tournamentsPage, page }) => {
    await mockGraphQLAll(page, GRAPHQL_PROXY_ROUTE, {
      data: {
        tournaments: [
          buildTournament({ name: 'Copa Llena', teamCount: 8, registeredTeamsCount: 8 }),
        ],
      },
    });

    await tournamentsPage.goto();
    await tournamentsPage.expectListSettled();

    await expect(tournamentsPage.completoButton()).toBeVisible();
    await expect(tournamentsPage.completoButton()).toBeDisabled();
  });

  test('badge de playersPerTeam muestra el número correcto "X por equipo"', async ({
    tournamentsPage,
    page,
  }) => {
    await mockGraphQLAll(page, GRAPHQL_PROXY_ROUTE, {
      data: { tournaments: [buildTournament({ playersPerTeam: 7, name: 'Copa 7v7' })] },
    });

    await tournamentsPage.goto();
    await tournamentsPage.expectListSettled();

    await expect(page.getByText('7 por equipo')).toBeVisible();
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   Bloque 2 — Navegación y usuario anónimo
   ══════════════════════════════════════════════════════════════════════════ */

test.describe('Listado de torneos — usuario anónimo', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    await mockGraphQLAll(page, GRAPHQL_PROXY_ROUTE, {
      data: { tournaments: [buildTournament({ id: 'tour-anon-1', name: 'Copa Pública' })] },
    });
  });

  test('usuario anónimo ve "Iniciar sesión para anotar" en lugar de "Anotar equipo"', async ({
    tournamentsPage,
  }) => {
    await tournamentsPage.goto();
    await tournamentsPage.expectListSettled();

    await expect(tournamentsPage.loginToRegisterButton()).toBeVisible();
    await expect(tournamentsPage.anotarButton()).not.toBeVisible();
  });

  test('clicking "Iniciar sesión para anotar" navega a /login', async ({
    tournamentsPage,
    page,
  }) => {
    await tournamentsPage.goto();
    await tournamentsPage.expectListSettled();

    await tournamentsPage.loginToRegisterButton().click();

    await expect(page).toHaveURL(/\/login$/, { timeout: 10_000 });
  });

  test('el link del título del card apunta a /torneos/:id', async ({ tournamentsPage, page }) => {
    await tournamentsPage.goto();
    await tournamentsPage.expectListSettled();

    const titleLink = page.getByRole('link', { name: 'Copa Pública' });
    await expect(titleLink).toHaveAttribute('href', '/torneos/tour-anon-1');
  });

  test('"Ver detalle" en el card apunta a /torneos/:id', async ({ tournamentsPage, page }) => {
    await tournamentsPage.goto();
    await tournamentsPage.expectListSettled();

    const detailLink = page.getByRole('link', { name: 'Ver detalle' }).first();
    await expect(detailLink).toHaveAttribute('href', '/torneos/tour-anon-1');
  });

  test('navbar muestra enlace "Partidos" y "Iniciar Sesión" para usuario anónimo', async ({
    tournamentsPage,
    page,
  }) => {
    await tournamentsPage.goto();

    await expect(page.getByRole('link', { name: /Partidos/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Iniciar Sesión/i })).toBeVisible();
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   Bloque 3 — Usuario autenticado: CTA y formulario inline
   ══════════════════════════════════════════════════════════════════════════ */

test.describe('Listado de torneos — usuario autenticado', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ storageState: TEST_USERS.playerMateo.storageStatePath });

  test.beforeEach(async ({ page }) => {
    await mockGraphQLAll(page, GRAPHQL_PROXY_ROUTE, {
      data: { tournaments: [buildTournament({ id: 'tour-auth-1', name: 'Copa Auth' })] },
    });
  });

  test('usuario autenticado ve "Anotar equipo" en lugar de "Iniciar sesión para anotar"', async ({
    tournamentsPage,
  }) => {
    await tournamentsPage.goto();
    await tournamentsPage.expectListSettled();

    await expect(tournamentsPage.anotarButton()).toBeVisible();
    await expect(tournamentsPage.loginToRegisterButton()).not.toBeVisible();
  });

  test('clicking "Anotar equipo" abre el formulario inline con input y botones', async ({
    tournamentsPage,
  }) => {
    await tournamentsPage.goto();
    await tournamentsPage.expectListSettled();

    await tournamentsPage.anotarButton().click();

    await expect(tournamentsPage.teamNameInput).toBeVisible();
    await expect(tournamentsPage.submitAnotarButton()).toBeVisible();
    await expect(tournamentsPage.cancelButton).toBeVisible();
  });

  test('"Cancelar" cierra el formulario y restaura el botón "Anotar equipo"', async ({
    tournamentsPage,
  }) => {
    await tournamentsPage.goto();
    await tournamentsPage.expectListSettled();

    await tournamentsPage.anotarButton().click();
    await expect(tournamentsPage.teamNameInput).toBeVisible();

    await tournamentsPage.cancelButton.click();

    await expect(tournamentsPage.teamNameInput).not.toBeVisible();
    await expect(tournamentsPage.anotarButton()).toBeVisible();
  });

  test('submit con nombre vacío muestra error de validación sin enviar la mutation', async ({
    tournamentsPage,
    page,
  }) => {
    // Track /api/graphql-auth requests to verify the mutation is NOT sent
    const authRequests: string[] = [];
    await page.route(GRAPHQL_AUTH_ROUTE, async (route) => {
      authRequests.push(route.request().postData() ?? '');
      await route.continue();
    });

    await tournamentsPage.goto();
    await tournamentsPage.expectListSettled();

    await tournamentsPage.anotarButton().click();
    // Submit without filling the name (empty string)
    await tournamentsPage.submitAnotarButton().click();

    await expect(tournamentsPage.cardError()).toBeVisible({ timeout: 5_000 });
    await expect(tournamentsPage.cardError()).toContainText(/2 caracteres/i);
    // joinTournament must not have been dispatched
    const joinSent = authRequests.some((body) => body.includes('joinTournament'));
    expect(joinSent, 'joinTournament no debe enviarse con nombre inválido').toBe(false);
  });

  test('submit con nombre de 1 caracter también muestra error de validación', async ({
    tournamentsPage,
  }) => {
    await tournamentsPage.goto();
    await tournamentsPage.expectListSettled();

    await tournamentsPage.anotarButton().click();
    await tournamentsPage.teamNameInput.fill('A');
    await tournamentsPage.submitAnotarButton().click();

    await expect(tournamentsPage.cardError()).toContainText(/2 caracteres/i, { timeout: 5_000 });
  });

  test('submit exitoso muestra "Equipo anotado." y cierra el formulario', async ({
    tournamentsPage,
    page,
  }) => {
    // Mock the joinTournament mutation to return success
    await mockGraphQLAll(page, GRAPHQL_AUTH_ROUTE, {
      data: {
        joinTournament: { success: true, teamId: 'team-new-1', message: null, tournament: null },
      },
    });

    await tournamentsPage.goto();
    await tournamentsPage.expectListSettled();

    await tournamentsPage.anotarButton().click();
    await tournamentsPage.teamNameInput.fill('Los Cracks E2E');
    await tournamentsPage.submitAnotarButton().click();

    await expect(tournamentsPage.cardSuccess()).toContainText(/Equipo anotado/i, {
      timeout: 10_000,
    });
    // Form should close after success
    await expect(tournamentsPage.teamNameInput).not.toBeVisible();
  });

  test('error del servidor al anotar muestra mensaje de error inline', async ({
    tournamentsPage,
    page,
  }) => {
    await mockGraphQLAll(page, GRAPHQL_AUTH_ROUTE, {
      data: {
        joinTournament: {
          success: false,
          teamId: null,
          message: 'Ya existe un equipo con ese nombre en el torneo',
          tournament: null,
        },
      },
    });

    await tournamentsPage.goto();
    await tournamentsPage.expectListSettled();

    await tournamentsPage.anotarButton().click();
    await tournamentsPage.teamNameInput.fill('Equipo Duplicado');
    await tournamentsPage.submitAnotarButton().click();

    await expect(tournamentsPage.cardError()).toContainText(/ya existe un equipo/i, {
      timeout: 10_000,
    });
    // Form must stay open so the user can correct the name
    await expect(tournamentsPage.teamNameInput).toBeVisible();
  });

  test('error de GraphQL al anotar muestra mensaje de error inline', async ({
    tournamentsPage,
    page,
  }) => {
    await mockGraphQLAll(page, GRAPHQL_AUTH_ROUTE, {
      errors: [{ message: 'Internal server error' }],
    });

    await tournamentsPage.goto();
    await tournamentsPage.expectListSettled();

    await tournamentsPage.anotarButton().click();
    await tournamentsPage.teamNameInput.fill('Equipo Error');
    await tournamentsPage.submitAnotarButton().click();

    await expect(tournamentsPage.cardError()).toBeVisible({ timeout: 10_000 });
    await expect(tournamentsPage.cardError()).toContainText(/Internal server error/i);
  });

  test('navbar muestra enlace "Crear torneo" para jugador autenticado', async ({
    tournamentsPage,
    page,
  }) => {
    // The shared Topbar's DynamicNavActions island issues a MY_TEAMS query to decide
    // whether to show "Crear torneo" (captain-only, rule F9). The describe-level
    // mockGraphQLAll would starve that query and hide the link, so here we mock ONLY
    // the tournaments operation and let MY_TEAMS reach the real backend — seeded
    // playerMateo is a captain, so the link renders.
    await mockGraphQLOperation(page, GRAPHQL_PROXY_ROUTE, 'tournaments(', {
      data: { tournaments: [buildTournament({ id: 'tour-auth-1', name: 'Copa Auth' })] },
    });
    await tournamentsPage.goto();

    await expect(
      page.getByRole('link', { name: /Crear torneo/i }),
    ).toHaveAttribute('href', '/torneos/crear');
  });

  test('múltiples cards renderizan CTAs independientes por torneo', async ({
    tournamentsPage,
    page,
  }) => {
    await mockGraphQLAll(page, GRAPHQL_PROXY_ROUTE, {
      data: {
        tournaments: [
          buildTournament({ id: 'multi-1', name: 'Copa A', registeredTeamsCount: 2, teamCount: 8 }),
          buildTournament({ id: 'multi-2', name: 'Copa B', registeredTeamsCount: 8, teamCount: 8 }),
        ],
      },
    });

    await tournamentsPage.goto();
    await tournamentsPage.expectListSettled();

    // Copa A is open → "Anotar equipo" button
    await expect(tournamentsPage.anotarButton()).toBeVisible();
    // Copa B is full → "Completo" button
    await expect(tournamentsPage.completoButton()).toBeVisible();
    await expect(tournamentsPage.completoButton()).toBeDisabled();
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   Bloque 4 — Responsive
   ══════════════════════════════════════════════════════════════════════════ */

test.describe('Listado de torneos — responsive', () => {
  test.use({ storageState: TEST_USERS.playerMateo.storageStatePath });

  test.beforeEach(async ({ page }) => {
    await mockGraphQLAll(page, GRAPHQL_PROXY_ROUTE, {
      data: { tournaments: [buildTournament({ name: 'Copa Mobile' })] },
    });
  });

  test('no hay scroll horizontal en mobile 375px', async ({ tournamentsPage, page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await tournamentsPage.goto();

    const bodyScrollWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(
      bodyScrollWidth,
      'No debe haber overflow horizontal en mobile 375px',
    ).toBeLessThanOrEqual(viewportWidth + 1);
  });

  test('heading y card visible en mobile 375px', async ({ tournamentsPage, page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await tournamentsPage.goto();
    await tournamentsPage.expectListSettled();

    await expect(tournamentsPage.heading).toBeVisible();
    await expect(tournamentsPage.card('Copa Mobile')).toBeVisible();
  });

  test('no hay scroll horizontal en tablet 768px', async ({ tournamentsPage, page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await tournamentsPage.goto();

    const bodyScrollWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(
      bodyScrollWidth,
      'No debe haber overflow horizontal en tablet 768px',
    ).toBeLessThanOrEqual(viewportWidth + 1);
  });
});
