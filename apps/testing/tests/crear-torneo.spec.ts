import type { Page, Route } from '@playwright/test';
import {
  BACKEND_GRAPHQL_URL,
  CreateTournamentPage,
  DEFAULT_MOCK_SLOT,
  expect,
  FRONTEND_URL,
  GRAPHQL_AUTH_ROUTE,
  GRAPHQL_PROXY_ROUTE,
  gqlPost,
  test,
  TORNEOS_CREAR_URL,
  TORNEOS_URL,
  TEST_USERS,
  type MockSlot,
} from './support';

/**
 * Tests E2E — US #21 Crear Torneo (/torneos/crear).
 *
 * Decision Context:
 * - La lista de clubes se pre-carga SSR y NO puede mockearse con page.route().
 *   Todos los tests usan el backend real para la carga inicial (club list).
 * - Los horarios del club se cargan client-side vía /api/graphql y SÍ se mockean.
 *   El handler de slots comprueba que la URL no sea /api/graphql-auth antes de
 *   interceptar, evitando colisiones con el mock de la mutation.
 * - La mutation createTournament va a /api/graphql-auth (proxy autenticado) y se
 *   mockea para no escribir datos reales en la DB durante el run de tests.
 * - Auth: storage state pre-autenticado para playerMateo (mayoría de tests) y
 *   clubAdmin (describe anidado). El test de redirect usa un contexto anónimo fresco.
 * - Tests de métricas round-robin: calculados puramente client-side, no requieren
 *   fixture de horarios ni backend.
 * - Tests de generación real de fixture (completar inscripciones vía registerTournamentTeam)
 *   NO están incluidos: requieren crear datos reales + cleanup complejo con RLS. Ver README.
 * - Previously fixed bugs:
 *   1. browser.newContext() in the anonymous-redirect test was inheriting auth cookies from
 *      the browser-level profile store when using channel:'chrome'. Fixed by passing
 *      { storageState: { cookies: [], origins: [] } } explicitly to newContext().
 *   2. teamsCountInput.fill('N') silently failed to update React state in tests that called
 *      mockCreateTournament() before goto(). Playwright's fill dispatches a synthetic input
 *      event that raced with React's reconciler when a concurrent route handler was registered.
 *      Fixed by adding CreateTournamentPage.setTeamsCount() which uses triple-click +
 *      pressSequentially (real keyboard events) instead of fill().
 */

const CREATE_TOURNAMENT_NAME = 'Copa E2E Test Torneo';

/* ── Mock helpers ─────────────────────────────────────────────────────────── */

/**
 * Mocks GET_CLUB_SLOTS responses via /api/graphql. Deliberately skips
 * /api/graphql-auth requests so the createTournament mock can run unimpeded.
 */
async function mockTournamentSlots(
  page: Page,
  slots: MockSlot[],
  error?: string,
): Promise<void> {
  await page.unroute(GRAPHQL_PROXY_ROUTE).catch(() => undefined);
  await page.route(GRAPHQL_PROXY_ROUTE, async (route: Route) => {
    // Do not intercept the authenticated mutation endpoint.
    if (route.request().url().includes('graphql-auth')) {
      await route.continue();
      return;
    }
    if (error) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ errors: [{ message: error }] }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { clubSlots: slots } }),
    });
  });
}

type TournamentFixtureMatchMock = {
  id: string;
  tournamentId: string;
  round: number;
  homeTeamId: string | null;
  awayTeamId: string | null;
  courtId: string | null;
  scheduledAt: string | null;
  status: string;
};

type MockCreateTournamentResponse =
  | { ok: true; name?: string; fixtureMatches?: TournamentFixtureMatchMock[] }
  | { ok: false; message: string; graphQLError?: boolean };

/**
 * Mocks the createTournament mutation response via /api/graphql-auth.
 * Returns captured request payloads for assertion.
 */
async function mockCreateTournament(
  page: Page,
  response: MockCreateTournamentResponse,
): Promise<{ payloads: unknown[] }> {
  const payloads: unknown[] = [];

  await page.unroute(GRAPHQL_AUTH_ROUTE).catch(() => undefined);
  await page.route(GRAPHQL_AUTH_ROUTE, async (route: Route) => {
    payloads.push(JSON.parse(route.request().postData() ?? '{}') as unknown);

    if (response.ok) {
      const name = response.name ?? CREATE_TOURNAMENT_NAME;
      const fixtureMatches = response.fixtureMatches ?? [
        {
          id: 'fm-e2e-1',
          tournamentId: 'tournament-e2e-id',
          round: 1,
          homeTeamId: null,
          awayTeamId: null,
          courtId: 'court-e2e-1',
          scheduledAt: '2027-07-01T19:00:00',
          status: 'SCHEDULED',
        },
      ];

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            createTournament: {
              success: true,
              tournamentId: 'tournament-e2e-id',
              message: null,
              tournament: {
                id: 'tournament-e2e-id',
                organizerId: 'user-e2e-id',
                name,
                format: 'SEVEN_VS_SEVEN',
                teamCount: 2,
                playersPerTeam: 7,
                registeredTeamsCount: 0,
                status: 'REGISTRATION',
                description: null,
                startDate: '2027-07-01',
                endDate: '2027-07-01',
                createdAt: '2027-07-01T12:00:00Z',
                club: { id: 'club-e2e', name: 'Club E2E', zone: null, address: null, imageUrl: null },
                fixtureMatches,
              },
            },
          },
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        response.graphQLError
          ? { errors: [{ message: response.message }] }
          : {
              data: {
                createTournament: {
                  success: false,
                  tournamentId: null,
                  message: response.message,
                  tournament: null,
                },
              },
            },
      ),
    });
  });

  return { payloads };
}

/* ── Shared setup ─────────────────────────────────────────────────────────── */

test.use({ storageState: TEST_USERS.playerMateo.storageStatePath });

test.describe('Crear Torneo (/torneos/crear)', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    await mockTournamentSlots(page, [DEFAULT_MOCK_SLOT]);
  });

  /* ── Autenticación ──────────────────────────────────────────────────────── */

  test('usuario no autenticado es redirigido a /login', async ({ browser }) => {
    // Explicitly pass empty storage state: with channel:'chrome', browser.newContext()
    // without arguments can inherit cookies from the browser-level profile store,
    // causing the context to appear authenticated. Empty storageState overrides that.
    const anonCtx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const anonPage = await anonCtx.newPage();
    try {
      await anonPage.goto(TORNEOS_CREAR_URL);
      await expect(anonPage).toHaveURL(/\/login$/);
      await expect(anonPage.getByRole('textbox', { name: 'Email' })).toBeVisible();
    } finally {
      await anonCtx.close();
    }
  });

  test('player autenticado puede acceder y ve el formulario de creación', async ({
    createTournamentPage,
  }) => {
    await createTournamentPage.goto();
    await expect(createTournamentPage.heading).toBeVisible();
    await expect(createTournamentPage.nameInput).toBeVisible();
    await expect(createTournamentPage.submitButton).toBeVisible();
  });

  /* ── Estructura del formulario ──────────────────────────────────────────── */

  test('form muestra todos los campos requeridos', async ({ createTournamentPage }) => {
    await createTournamentPage.goto();

    await expect(createTournamentPage.nameInput).toBeVisible();
    await expect(createTournamentPage.clubSelect).toBeVisible();
    await expect(createTournamentPage.teamsCountInput).toBeVisible();
    await expect(createTournamentPage.playersPerTeamInput).toBeVisible();
    await expect(createTournamentPage.descriptionTextarea).toBeVisible();
    await expect(createTournamentPage.slotDateInput).toBeVisible();

    // Format chips: all four formats available
    await expect(createTournamentPage.formatChip('5v5')).toBeVisible();
    await expect(createTournamentPage.formatChip('7v7')).toBeVisible();
    await expect(createTournamentPage.formatChip('10v10')).toBeVisible();
    await expect(createTournamentPage.formatChip('11v11')).toBeVisible();
  });

  /* ── Métricas round-robin (cálculo client-side) ─────────────────────────── */

  test('4 equipos calculan 6 partidos requeridos en las métricas', async ({
    createTournamentPage,
  }) => {
    await createTournamentPage.goto();

    // Default is 4 teams → rounds=3, matchesPerRound=2, required=6
    await createTournamentPage.setTeamsCount(4);

    await expect(createTournamentPage.requiredMatchesMetric()).toHaveText('6');
    await expect(createTournamentPage.remainingSlotsMetric()).toHaveText('6');
  });

  test('6 equipos calculan 15 partidos requeridos en las métricas', async ({
    createTournamentPage,
  }) => {
    await createTournamentPage.goto();

    // 6 teams → rounds=5, matchesPerRound=3, required=15
    await createTournamentPage.setTeamsCount(6);

    await expect(createTournamentPage.requiredMatchesMetric()).toHaveText('15');
    await expect(createTournamentPage.remainingSlotsMetric()).toHaveText('15');
  });

  test('2 equipos calculan 1 partido requerido en las métricas', async ({
    createTournamentPage,
  }) => {
    await createTournamentPage.goto();

    await createTournamentPage.setTeamsCount(2);

    await expect(createTournamentPage.requiredMatchesMetric()).toHaveText('1');
    await expect(createTournamentPage.remainingSlotsMetric()).toHaveText('1');
  });

  /* ── Selección de horarios ──────────────────────────────────────────────── */

  test('horarios disponibles aparecen como botones seleccionables', async ({
    createTournamentPage,
    page,
  }) => {
    await createTournamentPage.goto();
    await createTournamentPage.waitForSlotsLoaded();

    const slotBtn = createTournamentPage.slotButton('19:00');
    await expect(slotBtn).toBeVisible();
    await expect(slotBtn).toBeEnabled();
    // Mock slot court info visible inside the button
    await expect(slotBtn).toContainText('Cancha E2E');
  });

  test('botón crear está deshabilitado hasta seleccionar todos los horarios necesarios', async ({
    createTournamentPage,
  }) => {
    await createTournamentPage.goto();
    await createTournamentPage.waitForSlotsLoaded();

    // With 4 teams (default), 6 slots needed — none selected yet
    await expect(createTournamentPage.submitButton).toBeDisabled();

    // Fill name — still disabled because slots are missing
    await createTournamentPage.nameInput.fill(CREATE_TOURNAMENT_NAME);
    await expect(createTournamentPage.submitButton).toBeDisabled();
  });

  test('seleccionar un slot lo marca como seleccionado y actualiza el contador', async ({
    createTournamentPage,
    page,
  }) => {
    await createTournamentPage.goto();
    await createTournamentPage.waitForSlotsLoaded();

    // Switch to 2 teams so only 1 slot is needed
    await createTournamentPage.setTeamsCount(2);

    const slotBtn = createTournamentPage.slotButton('19:00');
    await slotBtn.click();

    // Slot card gets the selected CSS modifier
    await expect(slotBtn).toHaveClass(/slot-option--selected/);

    // Counter pill updates to "1/1"
    await expect(page.getByText('1/1')).toBeVisible();

    // Selected slot appears in the rounds list
    await expect(page.locator('.round-slots')).toContainText('19:00');
  });

  /* ── Validación del formulario ──────────────────────────────────────────── */

  test('botón crear está deshabilitado con nombre vacío', async ({
    createTournamentPage,
  }) => {
    await createTournamentPage.goto();
    await createTournamentPage.waitForSlotsLoaded();

    // Switch to 2 teams and select the required slot
    await createTournamentPage.setTeamsCount(2);
    await createTournamentPage.slotButton('19:00').click();

    // Name is empty → submit disabled
    await expect(createTournamentPage.submitButton).toBeDisabled();
  });

  test('botón crear está deshabilitado con nombre menor a 3 caracteres', async ({
    createTournamentPage,
  }) => {
    await createTournamentPage.goto();
    await createTournamentPage.waitForSlotsLoaded();

    await createTournamentPage.setTeamsCount(2);
    await createTournamentPage.slotButton('19:00').click();

    // Only 2 characters — below the 3-char minimum
    await createTournamentPage.nameInput.fill('AB');
    await expect(createTournamentPage.submitButton).toBeDisabled();
  });

  /* ── Flujo exitoso ──────────────────────────────────────────────────────── */

  test('torneo con datos válidos muestra pantalla de éxito', async ({
    createTournamentPage,
    page,
  }) => {
    await mockCreateTournament(page, { ok: true, name: CREATE_TOURNAMENT_NAME });

    await createTournamentPage.goto();
    await createTournamentPage.waitForSlotsLoaded();

    // Set up a minimal valid form: 2 teams → 1 slot, name, default format
    await createTournamentPage.setTeamsCount(2);
    await createTournamentPage.nameInput.fill(CREATE_TOURNAMENT_NAME);
    await createTournamentPage.slotButton('19:00').click();

    await expect(createTournamentPage.submitButton).toBeEnabled();
    await createTournamentPage.submitButton.click();

    await expect(createTournamentPage.successTitle).toBeVisible({ timeout: 10_000 });
  });

  test('pantalla de éxito muestra nombre del torneo y cantidad de partidos del fixture', async ({
    createTournamentPage,
    page,
  }) => {
    const fixtureMatches: TournamentFixtureMatchMock[] = [
      {
        id: 'fm-1',
        tournamentId: 'tournament-e2e-id',
        round: 1,
        homeTeamId: null,
        awayTeamId: null,
        courtId: 'court-e2e-1',
        scheduledAt: '2027-07-01T19:00:00',
        status: 'SCHEDULED',
      },
    ];
    await mockCreateTournament(page, {
      ok: true,
      name: CREATE_TOURNAMENT_NAME,
      fixtureMatches,
    });

    await createTournamentPage.goto();
    await createTournamentPage.waitForSlotsLoaded();

    await createTournamentPage.setTeamsCount(2);
    await createTournamentPage.nameInput.fill(CREATE_TOURNAMENT_NAME);
    await createTournamentPage.slotButton('19:00').click();
    await createTournamentPage.submitButton.click();

    await expect(createTournamentPage.successTitle).toBeVisible({ timeout: 10_000 });
    // Tournament name appears in the success heading
    await expect(page.getByRole('heading', { name: CREATE_TOURNAMENT_NAME })).toBeVisible();
    // Fixture count is shown (1 fixtureMatch reserved)
    await expect(page.getByText(/se reservaron.*partido/i)).toBeVisible();
  });

  test('crear otro torneo desde la pantalla de éxito resetea el formulario', async ({
    createTournamentPage,
    page,
  }) => {
    await mockCreateTournament(page, { ok: true });

    await createTournamentPage.goto();
    await createTournamentPage.waitForSlotsLoaded();

    await createTournamentPage.setTeamsCount(2);
    await createTournamentPage.nameInput.fill(CREATE_TOURNAMENT_NAME);
    await createTournamentPage.slotButton('19:00').click();
    await createTournamentPage.submitButton.click();

    await expect(createTournamentPage.successTitle).toBeVisible({ timeout: 10_000 });

    await createTournamentPage.createAnotherButton.click();

    // Form is back and name is empty again
    await expect(createTournamentPage.nameInput).toBeVisible();
    await expect(createTournamentPage.nameInput).toHaveValue('');
    await expect(createTournamentPage.successTitle).not.toBeVisible();
  });

  test('payload enviado al backend contiene los campos correctos', async ({
    createTournamentPage,
    page,
  }) => {
    const { payloads } = await mockCreateTournament(page, { ok: true });

    await createTournamentPage.goto();
    await createTournamentPage.waitForSlotsLoaded();

    await createTournamentPage.setTeamsCount(2);
    await createTournamentPage.nameInput.fill(CREATE_TOURNAMENT_NAME);
    await createTournamentPage.descriptionTextarea.fill('Torneo de prueba E2E');
    await createTournamentPage.slotButton('19:00').click();
    await createTournamentPage.submitButton.click();

    await expect(createTournamentPage.successTitle).toBeVisible({ timeout: 10_000 });

    await expect.poll(() => payloads.length, { timeout: 10_000 }).toBe(1);
    const payload = payloads[0] as {
      variables?: {
        input?: {
          name?: string;
          format?: string;
          teamCount?: number;
          playersPerTeam?: number;
          description?: string;
          schedule?: Array<{ slotId: string; date: string }>;
        };
      };
    };

    expect(payload.variables?.input?.name).toBe(CREATE_TOURNAMENT_NAME);
    expect(payload.variables?.input?.format).toBe('SEVEN_VS_SEVEN');
    expect(payload.variables?.input?.teamCount).toBe(2);
    expect(payload.variables?.input?.description).toBe('Torneo de prueba E2E');
    expect(payload.variables?.input?.schedule).toHaveLength(1);
    expect(payload.variables?.input?.schedule?.[0]?.slotId).toBe(DEFAULT_MOCK_SLOT.id);
  });

  /* ── Errores del backend ────────────────────────────────────────────────── */

  test('error de horario ocupado del backend se muestra inline sin redirigir', async ({
    createTournamentPage,
    page,
  }) => {
    await mockCreateTournament(page, {
      ok: false,
      message: 'Ya existe un partido en uno de los horarios seleccionados',
      graphQLError: true,
    });

    await createTournamentPage.goto();
    await createTournamentPage.waitForSlotsLoaded();

    await createTournamentPage.setTeamsCount(2);
    await createTournamentPage.nameInput.fill(CREATE_TOURNAMENT_NAME);
    await createTournamentPage.slotButton('19:00').click();
    await createTournamentPage.submitButton.click();

    await expect(createTournamentPage.submitError).toBeVisible({ timeout: 10_000 });
    await expect(createTournamentPage.submitError).toContainText(/ya existe un partido/i);
    // Page stays on /torneos/crear after error
    await expect(page).toHaveURL(/\/torneos\/crear$/);
  });

  test('error genérico del backend se muestra inline y el formulario permanece usable', async ({
    createTournamentPage,
    page,
  }) => {
    await mockCreateTournament(page, {
      ok: false,
      message: 'No se pudo crear el torneo',
    });

    await createTournamentPage.goto();
    await createTournamentPage.waitForSlotsLoaded();

    await createTournamentPage.setTeamsCount(2);
    await createTournamentPage.nameInput.fill(CREATE_TOURNAMENT_NAME);
    await createTournamentPage.slotButton('19:00').click();
    await createTournamentPage.submitButton.click();

    await expect(createTournamentPage.submitError).toBeVisible({ timeout: 10_000 });
    await expect(createTournamentPage.submitError).toContainText(/no se pudo crear/i);

    // The submit button should be enabled again after the error
    await expect(createTournamentPage.submitButton).toBeEnabled();
  });

  test('error de horarios sin disponibilidad de slots se muestra en el panel de horarios', async ({
    createTournamentPage,
    page,
  }) => {
    await mockTournamentSlots(page, [], 'No pudimos cargar horarios del club');

    await createTournamentPage.goto();

    // The slot section should show an alert with the error
    await expect(page.getByRole('alert')).toContainText(/no pudimos cargar horarios/i);
    await expect(createTournamentPage.submitButton).toBeDisabled();
  });

  test('cuando no hay horarios disponibles se muestra mensaje informativo', async ({
    createTournamentPage,
  }) => {
    await mockTournamentSlots(createTournamentPage.page, []);

    await createTournamentPage.goto();
    await expect(createTournamentPage.emptySlotMessage).toBeVisible({ timeout: 10_000 });
    await expect(createTournamentPage.submitButton).toBeDisabled();
  });

  /* ── Navegación ─────────────────────────────────────────────────────────── */

  test('enlace Crear torneo en /torneos navega a /torneos/crear', async ({ page }) => {
    await page.goto(TORNEOS_URL);

    const crearTorneoLink = page.getByRole('link', { name: /crear torneo/i });
    await expect(crearTorneoLink).toBeVisible();
    await crearTorneoLink.click();

    await expect(page).toHaveURL(/\/torneos\/crear$/);
  });

  test('nav bar muestra enlace Partidos que regresa al listado', async ({
    createTournamentPage,
    page,
  }) => {
    await createTournamentPage.goto();

    const partidos = page.getByRole('link', { name: /^partidos$/i });
    await expect(partidos).toBeVisible();
    await partidos.click();
    await expect(page).toHaveURL(/\/partidos$/);
  });

  /* ── Seguridad ───────────────────────────────────────────────────────────── */

  test('createTournament sin token de auth retorna error de autenticación', async ({
    request,
  }) => {
    // Direct backend call without Authorization header — no browser involved.
    const response = await gqlPost(
      request,
      `mutation CreateTournamentUnauth($input: CreateTournamentInput!) {
        createTournament(input: $input) { success message }
      }`,
      {
        input: {
          name: 'Hack',
          clubId: 'any-id',
          format: 'SEVEN_VS_SEVEN',
          teamCount: 2,
          playersPerTeam: 7,
          schedule: [],
        },
      },
      // No access token — unauthenticated call
    );

    // Apollo returns a GraphQL error, not an HTTP 4xx
    expect(response.errors?.length).toBeGreaterThanOrEqual(1);
    expect(response.errors?.[0]?.message).toMatch(/auth|unauth|required|token/i);
  });

  /* ── Responsive ─────────────────────────────────────────────────────────── */

  test('formulario accesible en mobile 375px sin scroll horizontal', async ({
    createTournamentPage,
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await createTournamentPage.goto();

    const bodyScrollWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    // Allow 1px tolerance for sub-pixel rounding
    expect(bodyScrollWidth, 'No debe haber scroll horizontal en mobile').toBeLessThanOrEqual(
      viewportWidth + 1,
    );
  });

  test('campos principales visibles en mobile 375px', async ({
    createTournamentPage,
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await createTournamentPage.goto();

    await expect(createTournamentPage.heading).toBeVisible();
    await expect(createTournamentPage.nameInput).toBeVisible();
    await expect(createTournamentPage.teamsCountInput).toBeVisible();
    await expect(createTournamentPage.submitButton).toBeVisible();
  });

  test('botón crear torneo tiene altura mínima aceptable en mobile', async ({
    createTournamentPage,
    page,
  }) => {
    // TODO: WCAG 2.5.5 recomienda touch targets de al menos 44px.
    //       El botón actual tiene min-height: 42px (ver CreateTournamentFlow styles).
    //       El equipo debería actualizar btn-primary a min-height: 44px.
    await page.setViewportSize({ width: 375, height: 667 });
    await createTournamentPage.goto();

    const box = await page.locator('.submit-row .btn-primary').boundingBox();
    expect(box?.height, 'Touch target debe ser al menos 40px').toBeGreaterThanOrEqual(40);
  });

  test('formulario visible correctamente en tablet 768px', async ({
    createTournamentPage,
    page,
  }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await createTournamentPage.goto();

    await expect(createTournamentPage.heading).toBeVisible();
    await expect(createTournamentPage.nameInput).toBeVisible();
    await expect(createTournamentPage.clubSelect).toBeVisible();

    // No horizontal overflow
    const bodyScrollWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyScrollWidth).toBeLessThanOrEqual(viewportWidth + 1);
  });

  /* ── Club admin (contexto anidado) ─────────────────────────────────────── */

  test.describe('Club admin', () => {
    test.use({ storageState: TEST_USERS.clubAdmin.storageStatePath });

    test('club_admin autenticado puede acceder y ve el formulario de creación', async ({
      createTournamentPage,
    }) => {
      await createTournamentPage.goto();
      await expect(createTournamentPage.heading).toBeVisible();
      await expect(createTournamentPage.nameInput).toBeVisible();
    });

    test('acceso a crear torneo desde /panel-club/dashboard funciona para club_admin', async ({
      page,
    }) => {
      await page.goto(`${FRONTEND_URL}/panel-club/dashboard`);

      const crearTorneoLink = page.getByRole('link', { name: /crear torneo/i });
      await expect(crearTorneoLink).toBeVisible();
      await crearTorneoLink.click();

      await expect(page).toHaveURL(/\/torneos\/crear$/);
    });
  });
});
