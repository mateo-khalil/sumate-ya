import {
  buildLeaveTournamentErrors,
  buildLeaveTournamentFailure,
  buildLeaveTournamentResponse,
  expect,
  GRAPHQL_AUTH_ROUTE,
  gqlPost,
  mockGraphQLOperation,
  SEED_TOURNAMENTS,
  test,
  TEST_USERS,
  TournamentDetailPage,
} from './support';

/**
 * Tests E2E — US #47 "Abandonar torneo" (/torneos/[id]).
 *
 * Decision Context:
 * - The tournament detail page is SSR (`prerender = false`). The initial fetch
 *   to the backend GraphQL endpoint resolves who-is-captain + tournament status,
 *   which gates the SSR rendering of <LeaveTournamentButton client:load>.
 *   We CANNOT intercept that initial fetch with page.route(), so we depend on
 *   seed data: SEED_TOURNAMENTS.withCaptainMateo has playerMateo as captain of
 *   a team registered in a REGISTRATION-status tournament. That guarantees the
 *   leave button is rendered.
 * - The `LeaveTournament` mutation is dispatched client-side by
 *   LeaveTournamentDialog via fetch('/api/graphql-auth', ...). This IS
 *   interceptable with page.route() and is ALWAYS mocked so the test never
 *   removes the seeded team from the real DB. We use
 *   `mockGraphQLOperation(page, GRAPHQL_AUTH_ROUTE, 'leaveTournament', body)`
 *   which only mocks the leaveTournament op and passes everything else through.
 * - hasOnlyTwoTeams is computed in the Astro page as
 *   `registeredTeamsCount <= 2`. With only Mateo's team in the seed
 *   (registeredTeamsCount === 1), the critical 2-teams warning IS visible in
 *   every captain-view rendering. The dedicated warning test asserts it
 *   explicitly; tests that don't care simply ignore it.
 * - After a successful mutation, handleSuccess() updates React state THEN
 *   schedules a setTimeout(window.location.reload, 1500) or
 *   setTimeout(redirect, 2500). We assert the intermediate state
 *   (.leave-success-msg / .leave-extra-msg present) and don't wait for the
 *   timers — same pattern as unirse-torneo.spec.ts (mutation tests don't wait
 *   for reload, they verify mutation payload + intermediate paint).
 * - Auth posture:
 *     · Captain visibility & dialog flow: TEST_USERS.playerMateo (storage state).
 *     · Non-captain visibility: TEST_USERS.playerRicardo (separate browser ctx).
 *     · Unauth mutation contract: raw API request without token.
 * - Selector strategy:
 *     · `leaveTournamentButton` matches by aria-label regex
 *       `/retirar equipo .* del torneo/i` to stay seed-agnostic.
 *     · `submitLeaveButton` is scoped INSIDE the dialog because the trigger
 *       button also contains "Retirar equipo" text — using getByRole at page
 *       level returned two matches before scoping.
 *     · `twoTeamsWarning` uses the CSS class `.leave-warning--critical` because
 *       both the always-shown destructive warning and the critical 2-teams
 *       warning use role="alert" — there is no unique accessible name to
 *       distinguish them. Documented in the PO file.
 * - Previously fixed bugs: none relevant (new spec).
 *
 * Coverage NOT included (intentional skips / out-of-scope):
 *   · Real DB-mutating happy path: would delete Mateo's seeded team, breaking
 *     all subsequent unirse-torneo + abandonar-torneo runs. Service-layer unit
 *     tests cover the mutation's actual effects.
 *   · The redirect timers (1500ms / 2500ms): asserted at the message level,
 *     not by waiting for the reload — same approach as unirse-torneo.spec.ts.
 *   · `authentication required` → redirect /login: documented as case #11 below.
 */

/* ══════════════════════════════════════════════════════════════════════════
   Bloque 1 — Visibilidad del botón
   ══════════════════════════════════════════════════════════════════════════ */

test.describe('Visibilidad del botón "Retirar equipo"', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ storageState: TEST_USERS.playerMateo.storageStatePath });

  test('capitán en torneo en REGISTRATION ve el botón "Retirar equipo"', async ({
    tournamentCaptainPage,
  }) => {
    await tournamentCaptainPage.goto();
    await expect(
      tournamentCaptainPage.leaveTournamentButton,
      'El botón "Retirar equipo" debe ser visible para el capitán',
    ).toBeVisible({ timeout: 15_000 });
  });

  test('click en el botón abre el dialog de confirmación', async ({ tournamentCaptainPage }) => {
    await tournamentCaptainPage.goto();
    await tournamentCaptainPage.openLeaveDialog();

    await expect(
      tournamentCaptainPage.leaveDialogTitle,
      'El dialog debe mostrar el título "Retirar equipo del torneo"',
    ).toBeVisible();
  });

  test('jugador no-capitán NO ve el botón "Retirar equipo"', async ({ browser }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.playerRicardo.storageStatePath,
    });
    const ricardoPage = await ctx.newPage();
    const po = new TournamentDetailPage(ricardoPage, SEED_TOURNAMENTS.withCaptainMateo);
    try {
      await po.goto();
      await po.expectLeaveButtonHidden();
    } finally {
      await ctx.close();
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   Bloque 2 — Interacciones del dialog
   ══════════════════════════════════════════════════════════════════════════ */

test.describe('Interacciones del dialog', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ storageState: TEST_USERS.playerMateo.storageStatePath });

  test('el botón "Retirar equipo" del dialog arranca deshabilitado', async ({
    tournamentCaptainPage,
  }) => {
    await tournamentCaptainPage.goto();
    await tournamentCaptainPage.openLeaveDialog();

    await expect(
      tournamentCaptainPage.submitLeaveButton,
      'El submit del dialog debe estar deshabilitado sin confirmación',
    ).toBeDisabled();
  });

  test('tildar el checkbox de confirmación habilita el botón "Retirar"', async ({
    tournamentCaptainPage,
  }) => {
    await tournamentCaptainPage.goto();
    await tournamentCaptainPage.openLeaveDialog();

    await tournamentCaptainPage.tickConfirm();

    await expect(
      tournamentCaptainPage.submitLeaveButton,
      'Tras tildar el checkbox, el submit debe habilitarse',
    ).toBeEnabled();
  });

  test('la textarea de motivo respeta maxLength=500', async ({ tournamentCaptainPage }) => {
    await tournamentCaptainPage.goto();
    await tournamentCaptainPage.openLeaveDialog();

    // Build a 600-char string. fill() respects the input's maxLength attribute
    // and the resulting `value` should be truncated to 500.
    const longText = 'x'.repeat(600);
    await tournamentCaptainPage.fillReason(longText);

    const value = await tournamentCaptainPage.reasonTextarea.inputValue();
    expect(
      value.length,
      'El textarea debe truncar el valor a 500 caracteres por el atributo maxLength',
    ).toBe(500);
  });

  test('cerrar el dialog con "Cancelar" lo oculta sin enviar mutation', async ({
    tournamentCaptainPage,
    page,
  }) => {
    // Track that no leaveTournament mutation is dispatched while the dialog is open
    // and after dismissing it.
    const { payloads } = await mockGraphQLOperation(
      page,
      GRAPHQL_AUTH_ROUTE,
      'leaveTournament',
      buildLeaveTournamentResponse(),
    );

    await tournamentCaptainPage.goto();
    await tournamentCaptainPage.openLeaveDialog();
    await tournamentCaptainPage.cancelLeaveButton.click();

    await expect(
      tournamentCaptainPage.leaveDialog,
      'El dialog debe ocultarse al cancelar',
    ).not.toBeVisible({ timeout: 5_000 });
    expect(
      payloads,
      'No debe haberse enviado la mutation leaveTournament al cancelar',
    ).toHaveLength(0);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   Bloque 3 — Warning de 2 equipos
   ══════════════════════════════════════════════════════════════════════════ */

test.describe('Warning de cancelación por pocos equipos', () => {
  test.use({ storageState: TEST_USERS.playerMateo.storageStatePath });

  test('cuando hasOnlyTwoTeams=true se muestra el warning crítico rojo', async ({
    tournamentCaptainPage,
  }) => {
    /*
     * The seeded tournament has only Mateo's team registered (1 ≤ 2 → true),
     * so the .leave-warning--critical element is rendered. If the seed evolves
     * to host > 2 teams this assertion will fail intentionally — that's the
     * regression guard.
     */
    await tournamentCaptainPage.goto();
    await tournamentCaptainPage.openLeaveDialog();

    await expect(
      tournamentCaptainPage.twoTeamsWarning,
      'El warning crítico de cancelación debe aparecer cuando hay ≤2 equipos',
    ).toBeVisible();
    await expect(tournamentCaptainPage.twoTeamsWarning).toContainText(
      /podria cancelarse|quedaria solo 1 equipo|podría cancelarse|quedaría solo/i,
    );
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   Bloque 4 — Happy paths (mock leaveTournament)
   ══════════════════════════════════════════════════════════════════════════ */

test.describe('Retiro exitoso', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ storageState: TEST_USERS.playerMateo.storageStatePath });

  test('retiro exitoso reemplaza el botón por el mensaje verde con el message del backend', async ({
    tournamentCaptainPage,
    page,
  }) => {
    const expectedMessage = 'Equipo retirado del torneo';
    const { payloads } = await mockGraphQLOperation(
      page,
      GRAPHQL_AUTH_ROUTE,
      'leaveTournament',
      buildLeaveTournamentResponse({
        success: true,
        message: expectedMessage,
        tournamentStatus: 'REGISTRATION',
        remainingTeams: 5,
      }),
    );

    await tournamentCaptainPage.goto();
    await tournamentCaptainPage.openLeaveDialog();
    await tournamentCaptainPage.tickConfirm();
    await tournamentCaptainPage.submitLeave();

    // Verify the mutation was dispatched
    await expect.poll(() => payloads.length, { timeout: 10_000 }).toBeGreaterThanOrEqual(1);

    // Intermediate success state (before the 1500ms reload timer fires).
    await expect(
      tournamentCaptainPage.leaveSuccessMessage,
      'Debe mostrarse el mensaje de éxito con el message del backend',
    ).toContainText(expectedMessage, { timeout: 5_000 });

    // No extra (yellow) cancellation message in the non-CANCELLED path.
    await expect(
      tournamentCaptainPage.leaveExtraMessage,
      'No debe aparecer el mensaje extra cuando el torneo no fue cancelado',
    ).toHaveCount(0);
  });

  test('retiro con tournamentStatus=CANCELLED muestra el mensaje extra amarillo', async ({
    tournamentCaptainPage,
    page,
  }) => {
    const expectedMessage = 'Equipo retirado. Torneo cancelado por falta de equipos';
    await mockGraphQLOperation(
      page,
      GRAPHQL_AUTH_ROUTE,
      'leaveTournament',
      buildLeaveTournamentResponse({
        success: true,
        message: expectedMessage,
        tournamentStatus: 'CANCELLED',
        remainingTeams: 1,
      }),
    );

    await tournamentCaptainPage.goto();
    await tournamentCaptainPage.openLeaveDialog();
    await tournamentCaptainPage.tickConfirm();
    await tournamentCaptainPage.submitLeave();

    await expect(
      tournamentCaptainPage.leaveSuccessMessage,
      'Debe mostrarse el mensaje de éxito',
    ).toContainText(expectedMessage, { timeout: 5_000 });

    await expect(
      tournamentCaptainPage.leaveExtraMessage,
      'Debe mostrarse el mensaje extra de cancelación + redirección',
    ).toContainText(/torneo fue cancelado|redirigido a la lista/i, { timeout: 5_000 });
  });

  test('payload enviado al backend contiene tournamentId, teamId y reason', async ({
    tournamentCaptainPage,
    page,
  }) => {
    const { payloads } = await mockGraphQLOperation(
      page,
      GRAPHQL_AUTH_ROUTE,
      'leaveTournament',
      buildLeaveTournamentResponse(),
    );

    await tournamentCaptainPage.goto();
    await tournamentCaptainPage.openLeaveDialog();
    await tournamentCaptainPage.fillReason('Conflicto de agenda E2E');
    await tournamentCaptainPage.tickConfirm();
    await tournamentCaptainPage.submitLeave();

    await expect.poll(() => payloads.length, { timeout: 10_000 }).toBeGreaterThanOrEqual(1);

    const payload = payloads[0] as {
      variables?: {
        input?: { tournamentId?: string; teamId?: string; reason?: string | null };
      };
    };
    expect(payload.variables?.input?.tournamentId, 'tournamentId debe coincidir con el torneo').toBe(
      SEED_TOURNAMENTS.withCaptainMateo,
    );
    expect(payload.variables?.input?.teamId, 'teamId debe estar presente').toBeTruthy();
    expect(payload.variables?.input?.reason, 'reason debe coincidir con lo ingresado').toBe(
      'Conflicto de agenda E2E',
    );
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   Bloque 5 — Error paths
   ══════════════════════════════════════════════════════════════════════════ */

test.describe('Errores del retiro', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ storageState: TEST_USERS.playerMateo.storageStatePath });

  test('success=false con message muestra error inline en el dialog', async ({
    tournamentCaptainPage,
    page,
  }) => {
    const errorMessage = 'No podés retirar este equipo';
    await mockGraphQLOperation(
      page,
      GRAPHQL_AUTH_ROUTE,
      'leaveTournament',
      buildLeaveTournamentFailure(errorMessage),
    );

    await tournamentCaptainPage.goto();
    await tournamentCaptainPage.openLeaveDialog();
    await tournamentCaptainPage.tickConfirm();
    await tournamentCaptainPage.submitLeave();

    await expect(
      tournamentCaptainPage.leaveErrorBanner,
      'Debe mostrarse el error inline con el message del backend',
    ).toContainText(errorMessage, { timeout: 5_000 });

    // The dialog must remain open after a failure.
    await expect(
      tournamentCaptainPage.leaveDialog,
      'El dialog NO debe cerrarse cuando la mutation falla',
    ).toBeVisible();
  });

  test('errors[0].message GraphQL-level muestra error inline', async ({
    tournamentCaptainPage,
    page,
  }) => {
    const errorMessage = 'No se pudo retirar el equipo';
    await mockGraphQLOperation(
      page,
      GRAPHQL_AUTH_ROUTE,
      'leaveTournament',
      buildLeaveTournamentErrors([errorMessage]),
    );

    await tournamentCaptainPage.goto();
    await tournamentCaptainPage.openLeaveDialog();
    await tournamentCaptainPage.tickConfirm();
    await tournamentCaptainPage.submitLeave();

    await expect(
      tournamentCaptainPage.leaveErrorBanner,
      'Debe mostrarse el error inline cuando llega un error GraphQL',
    ).toContainText(errorMessage, { timeout: 5_000 });
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   Bloque 6 — Seguridad
   ══════════════════════════════════════════════════════════════════════════ */

test.describe('Seguridad', () => {
  test('mutation leaveTournament sin token de auth retorna error de autenticación', async ({
    request,
  }) => {
    const response = await gqlPost(
      request,
      `mutation LeaveTournamentUnauth($input: LeaveTournamentInput!) {
        leaveTournament(input: $input) { success message }
      }`,
      {
        input: {
          tournamentId: SEED_TOURNAMENTS.withCaptainMateo,
          teamId: '00000000-0000-0000-0000-000000000001',
          reason: null,
        },
      },
      // Sin token de autorización
    );

    expect(
      response.errors?.length ?? 0,
      'Debe retornar al menos un error GraphQL',
    ).toBeGreaterThanOrEqual(1);
    expect(
      response.errors?.[0]?.message,
      'El error debe indicar falta de autenticación',
    ).toMatch(/auth|unauth|required|token/i);
  });
});
