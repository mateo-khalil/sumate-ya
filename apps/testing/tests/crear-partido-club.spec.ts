import {
  buildAvailableSlotsResponse,
  buildClubSlotOccurrence,
  buildCreateClubMatchResponse,
  buildCreateClubMatchFailure,
  expect,
  GRAPHQL_AUTH_ROUTE,
  mockGraphQLOperation,
  mockGraphQLOperations,
  test,
  TEST_USERS,
} from './support';

/**
 * Tests E2E — Crear Partido desde Club (/panel-club/crear-partido).
 *
 * Decision Context:
 * - The page is SSR (`prerender = false`, club_admin only) but it does NOT
 *   pre-fetch slots: AvailableSlotsPicker issues the AvailableSlotsForClubMatch
 *   query browser-side on mount, and ClubMatchWizard issues CreateClubMatch on
 *   submit. Both POST to /api/graphql-auth and ARE interceptable with
 *   page.route() — unlike the player create-match flow whose slot list is
 *   server-rendered. We therefore mock at the /api/graphql-auth boundary and
 *   never touch the real backend for the wizard's data.
 * - Two operations share the route. Tests that only need slots use a single
 *   `mockGraphQLOperation`. Tests that also exercise the mutation use
 *   `mockGraphQLOperations` — ONE route handler that branches by operation
 *   marker. Stacking two `mockGraphQLOperation` registrations does NOT work:
 *   Playwright's `route.continue()` terminates routing instead of cascading to
 *   an earlier handler, so a non-match in the top handler hits the network
 *   rather than the other mock. The combined handler is the correct pattern.
 * - Mocks are installed BEFORE goto() so the mount fetch is captured.
 * - Slot occurrences come from buildClubSlotOccurrence, which defaults to a
 *   FUTURE date inside the current Mon–Sun week at 19:00 so the grid renders a
 *   clickable cell (a cell is clickable only when not hasMatch, not a past day,
 *   and within the 15-min grace window). Hardcoding a calendar date would make
 *   the spec drift with the clock — the builder is clock-relative on purpose.
 * - Auth: club_admin storage state (the only role allowed on this page). No
 *   per-test login.
 * - Known product gap (see case "sin horarios"): AvailableSlotsPicker has NO
 *   empty-state message — when the query returns [], it just renders an empty
 *   grid. The test asserts the ACTUAL behaviour (no selectable cell, "Siguiente"
 *   stays disabled) and the gap is reported as a finding rather than asserting a
 *   copy that does not exist.
 * - Previously fixed bugs: none relevant (new spec).
 */

test.use({ storageState: TEST_USERS.clubAdmin.storageStatePath });

const SLOTS_OP = 'AvailableSlotsForClubMatch';
const CREATE_OP = 'CreateClubMatch';

test.describe('Crear Partido desde Club', () => {
  test('club_admin entra y ve el paso 1 "Horario" activo', async ({ page, clubMatchWizardPage }) => {
    await mockGraphQLOperation(
      page,
      GRAPHQL_AUTH_ROUTE,
      SLOTS_OP,
      buildAvailableSlotsResponse([buildClubSlotOccurrence()]),
    );

    await clubMatchWizardPage.goto();

    await expect(clubMatchWizardPage.step1Title).toBeVisible();
    await clubMatchWizardPage.expectActiveStep(1);
  });

  test('no se puede avanzar del paso 1 sin seleccionar horario', async ({ page, clubMatchWizardPage }) => {
    await mockGraphQLOperation(
      page,
      GRAPHQL_AUTH_ROUTE,
      SLOTS_OP,
      buildAvailableSlotsResponse([buildClubSlotOccurrence()]),
    );

    await clubMatchWizardPage.goto();

    await expect(clubMatchWizardPage.nextButton).toBeDisabled();

    await clubMatchWizardPage.selectFirstAvailableSlot();

    await expect(clubMatchWizardPage.nextButton).toBeEnabled();
  });

  test('happy path: crea el partido y muestra la pantalla de éxito', async ({ page, clubMatchWizardPage }) => {
    const matchId = 'd1000000-0000-0000-0000-0000000000aa';
    await mockGraphQLOperations(page, GRAPHQL_AUTH_ROUTE, [
      { marker: SLOTS_OP, body: buildAvailableSlotsResponse([buildClubSlotOccurrence()]) },
      { marker: CREATE_OP, body: buildCreateClubMatchResponse({ matchId }) },
    ]);

    await clubMatchWizardPage.goto();
    await clubMatchWizardPage.selectFirstAvailableSlot();
    await clubMatchWizardPage.goToStep2();

    await clubMatchWizardPage.chooseFormat('5 vs 5');
    await clubMatchWizardPage.fillDescription('Partido amistoso E2E');
    await clubMatchWizardPage.goToStep3();

    await expect(clubMatchWizardPage.submitButton).toBeVisible();
    await clubMatchWizardPage.submit();

    await clubMatchWizardPage.expectSuccessScreen();
    await expect(clubMatchWizardPage.viewMatchLink).toHaveAttribute('href', `/partidos/${matchId}`);
  });

  test('elegir un formato distinto actualiza la capacidad por defecto', async ({ page, clubMatchWizardPage }) => {
    await mockGraphQLOperation(
      page,
      GRAPHQL_AUTH_ROUTE,
      SLOTS_OP,
      buildAvailableSlotsResponse([buildClubSlotOccurrence()]),
    );

    await clubMatchWizardPage.goto();
    await clubMatchWizardPage.selectFirstAvailableSlot();
    await clubMatchWizardPage.goToStep2();

    // Default format is 7 vs 7 → capacity 14.
    await expect(clubMatchWizardPage.capacityInput).toHaveValue('14');

    await clubMatchWizardPage.chooseFormat('5 vs 5');
    await expect(clubMatchWizardPage.capacityInput).toHaveValue('10');

    await clubMatchWizardPage.chooseFormat('11 vs 11');
    await expect(clubMatchWizardPage.capacityInput).toHaveValue('22');
  });

  test('toggle "Inscribirme como jugador" se refleja en el resumen del paso 3', async ({ page, clubMatchWizardPage }) => {
    await mockGraphQLOperation(
      page,
      GRAPHQL_AUTH_ROUTE,
      SLOTS_OP,
      buildAvailableSlotsResponse([buildClubSlotOccurrence()]),
    );

    await clubMatchWizardPage.goto();
    await clubMatchWizardPage.selectFirstAvailableSlot();
    await clubMatchWizardPage.goToStep2();

    await clubMatchWizardPage.toggleAutoEnroll();
    await expect(clubMatchWizardPage.autoEnrollToggle).toBeChecked();
    await clubMatchWizardPage.goToStep3();

    await expect(clubMatchWizardPage.confirmRow('Admin inscripto')).toContainText('Sí (Equipo A)');
  });

  test('sin horarios disponibles: no hay celda seleccionable y "Siguiente" queda deshabilitado', async ({ page, clubMatchWizardPage }) => {
    await mockGraphQLOperation(
      page,
      GRAPHQL_AUTH_ROUTE,
      SLOTS_OP,
      buildAvailableSlotsResponse([]),
    );

    await clubMatchWizardPage.goto();

    await expect(clubMatchWizardPage.step1Title).toBeVisible();
    // AvailableSlotsPicker has no empty-state copy; assert there is no clickable
    // occurrence cell and that navigation stays blocked (documented finding).
    await expect(clubMatchWizardPage.slotCells()).toHaveCount(0);
    await expect(clubMatchWizardPage.nextButton).toBeDisabled();
  });

  test('createClubMatch con errors[]: muestra banner de error inline, sin éxito', async ({ page, clubMatchWizardPage }) => {
    await mockGraphQLOperations(page, GRAPHQL_AUTH_ROUTE, [
      { marker: SLOTS_OP, body: buildAvailableSlotsResponse([buildClubSlotOccurrence()]) },
      { marker: CREATE_OP, body: { errors: [{ message: 'El horario ya tiene un partido activo' }] } },
    ]);

    await clubMatchWizardPage.goto();
    await clubMatchWizardPage.selectFirstAvailableSlot();
    await clubMatchWizardPage.goToStep2();
    await clubMatchWizardPage.goToStep3();
    await clubMatchWizardPage.submit();

    await expect(clubMatchWizardPage.errorBanner).toBeVisible();
    await expect(clubMatchWizardPage.errorBanner).toContainText('El horario ya tiene un partido activo');
    await expect(clubMatchWizardPage.successTitle).toHaveCount(0);
  });

  test('createClubMatch con success:false: muestra el message en el banner', async ({ page, clubMatchWizardPage }) => {
    await mockGraphQLOperations(page, GRAPHQL_AUTH_ROUTE, [
      { marker: SLOTS_OP, body: buildAvailableSlotsResponse([buildClubSlotOccurrence()]) },
      { marker: CREATE_OP, body: buildCreateClubMatchFailure('No se pudo crear el partido: capacidad inválida') },
    ]);

    await clubMatchWizardPage.goto();
    await clubMatchWizardPage.selectFirstAvailableSlot();
    await clubMatchWizardPage.goToStep2();
    await clubMatchWizardPage.goToStep3();
    await clubMatchWizardPage.submit();

    await expect(clubMatchWizardPage.errorBanner).toBeVisible();
    await expect(clubMatchWizardPage.errorBanner).toContainText('No se pudo crear el partido: capacidad inválida');
    await expect(clubMatchWizardPage.successTitle).toHaveCount(0);
  });
});
