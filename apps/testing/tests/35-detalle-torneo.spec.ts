/**
 * Tests E2E — US #35 Detalle de Torneo (/torneos/[id]).
 *
 * Decision Context:
 * - The tournament detail page is SSR (`prerender = false`). The initial tournament
 *   data (teams, fixture, status) is fetched server-side and CANNOT be intercepted
 *   with page.route(). All tests rely on seeded DB data from scripts/seed.ts:
 *     · SEED_TOURNAMENTS.open          → status=REGISTRATION, zero teams (T1).
 *     · SEED_TOURNAMENTS.withCaptainMateo → status=REGISTRATION, 1 team (T2).
 *     · SEED_TOURNAMENTS.withFixture   → status=IN_PROGRESS, 2 teams, 2 fixture
 *                                        matches (1 COMPLETED, 1 SCHEDULED) (T3).
 * - TournamentRegistrationForm is a React island (client:load). Its presence or
 *   absence on the page is visible in SSR HTML, but INTERACTION (submit, error)
 *   requires waitForFormHydrated() or waitForReactHydrated(). Tests in THIS spec
 *   only check static/SSR-rendered content — form interaction tests live in
 *   unirse-torneo.spec.ts (US #39).
 * - The "Torneo no encontrado" state is rendered by the SSR page when the backend
 *   returns `tournament: null`. We use NON_EXISTENT_TOURNAMENT_ID — a valid UUID
 *   that passes the Astro UUID_REGEX guard but has no DB row.
 * - Auth posture:
 *     · Most tests: anonymous context (the detail page is fully public).
 *     · Capacity / status pill tests: playerMateo storage state (the pill is SSR
 *       and visible to anonymous users too, but reusing playerMateo avoids
 *       instantiating extra browser contexts).
 *     · Security: raw HTTP request (no browser).
 * - Coverage overlap with unirse-torneo.spec.ts (intentionally avoided here):
 *     · Registration form interactions (join, captain panel, member management).
 *     · Fixture empty-state text (already in unirse-torneo Bloque 3).
 *     · UUID-invalid redirect (already in unirse-torneo Bloque 6).
 *     · Most responsive layout tests (already in unirse-torneo Bloque 5).
 * - Previously fixed bugs: none relevant (new spec).
 */

import {
  expect,
  FRONTEND_URL,
  GRAPHQL_AUTH_ROUTE,
  gqlPost,
  NON_EXISTENT_TOURNAMENT_ID,
  SEED_TOURNAMENTS,
  test,
  TEST_USERS,
  TournamentDetailPage,
  torneoDetailUrl,
} from './support';

/* ══════════════════════════════════════════════════════════════════════════
   Bloque 1 — Visualización básica del detalle
   ══════════════════════════════════════════════════════════════════════════ */

test.describe('Visualización básica', () => {
  /**
   * Decision Context:
   * - These tests are all anonymous (no auth needed — the page is public).
   * - T1 (open tournament) is used because it always has a known status and
   *   clean description text from the seed.
   * - All asserted content is SSR-rendered; no island hydration is needed.
   */
  test('página carga y muestra el nombre del torneo como heading h1', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await ctx.newPage();
    const po = new TournamentDetailPage(page, SEED_TOURNAMENTS.open);
    try {
      await po.goto();
      await expect(
        po.pageHeading,
        'El heading h1 debe mostrar el nombre del torneo',
      ).toBeVisible();
      const headingText = await po.pageHeading.textContent();
      expect(
        headingText?.trim().length,
        'El nombre del torneo no debe estar vacío',
      ).toBeGreaterThan(0);
    } finally {
      await ctx.close();
    }
  });

  test('hero muestra formato, club y organizador en las pills de metadata', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await ctx.newPage();
    const po = new TournamentDetailPage(page, SEED_TOURNAMENTS.open);
    try {
      await po.goto();
      // .hero-meta contains 3 spans: format, club, organizer
      await expect(
        po.heroMeta,
        'La sección .hero-meta debe ser visible',
      ).toBeVisible();
      // Verify at least 2 pills are visible (format + club minimum)
      const pills = po.heroMeta.locator('span');
      const count = await pills.count();
      expect(count, 'Deben existir al menos 2 pills de metadata en el hero').toBeGreaterThanOrEqual(2);
    } finally {
      await ctx.close();
    }
  });

  test('grilla de información muestra el rango de fechas del torneo', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await ctx.newPage();
    const po = new TournamentDetailPage(page, SEED_TOURNAMENTS.open);
    try {
      await po.goto();
      await expect(
        po.infoGrid,
        'La sección de datos del torneo debe ser visible',
      ).toBeVisible();
      // The info grid contains Fechas / Formato / Club items
      const fechasItem = po.infoGrid.locator('.info-item').filter({ hasText: /fecha/i });
      await expect(
        fechasItem,
        'El item de Fechas debe estar en la grilla de información',
      ).toBeVisible();
    } finally {
      await ctx.close();
    }
  });

  test('hero muestra la descripción del torneo', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await ctx.newPage();
    const po = new TournamentDetailPage(page, SEED_TOURNAMENTS.open);
    try {
      await po.goto();
      await expect(
        po.heroDescription,
        'El párrafo de descripción debe ser visible en el hero',
      ).toBeVisible();
    } finally {
      await ctx.close();
    }
  });

  test('UUID inexistente retorna el estado "Torneo no encontrado"', async ({ browser }) => {
    /**
     * Decision Context:
     * - NON_EXISTENT_TOURNAMENT_ID passes the Astro UUID_REGEX guard so the page
     *   renders (no redirect). The backend returns `tournament: null`, and the Astro
     *   page shows the `.not-found` section with .nf-title "Torneo no encontrado".
     * - The page does NOT redirect to /torneos — that only happens for invalid UUID
     *   formats (tested in unirse-torneo.spec.ts Bloque 6).
     * - Previously fixed bugs: none relevant.
     */
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await ctx.newPage();
    const po = new TournamentDetailPage(page, NON_EXISTENT_TOURNAMENT_ID);
    try {
      await po.gotoNonExistent(NON_EXISTENT_TOURNAMENT_ID);
      await expect(
        po.notFoundMessage,
        'Debe mostrarse el título "Torneo no encontrado"',
      ).toContainText(/torneo no encontrado/i, { timeout: 15_000 });
      await expect(
        page,
        'La URL debe permanecer en /torneos/[id], no redirigir',
      ).toHaveURL(new RegExp(NON_EXISTENT_TOURNAMENT_ID));
    } finally {
      await ctx.close();
    }
  });

  test('página es pública: visitante anónimo puede ver el detalle completo sin autenticarse', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await ctx.newPage();
    const po = new TournamentDetailPage(page, SEED_TOURNAMENTS.open);
    try {
      await po.goto();
      // All structural sections must be visible without auth
      await expect(po.pageHeading, 'El heading h1 debe ser visible para visitantes anónimos').toBeVisible();
      await expect(po.statusPill, 'El status pill debe ser visible para visitantes anónimos').toBeVisible();
      await expect(po.infoGrid, 'La grilla de info debe ser visible para visitantes anónimos').toBeVisible();
    } finally {
      await ctx.close();
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   Bloque 2 — Equipos inscriptos
   ══════════════════════════════════════════════════════════════════════════ */

test.describe('Equipos inscriptos', () => {
  /**
   * Decision Context:
   * - T2 (withCaptainMateo) is used for "has teams" tests: it has 1 seeded team
   *   named "Equipo Capitan E2E" with Mateo as captain.
   * - T1 (open) is used for "no teams" tests: seed always clears T1 teams.
   * - Anonymous context is sufficient — team data is SSR-rendered and public.
   * - Previously fixed bugs: none relevant.
   */
  test('torneo con equipo muestra la tarjeta del equipo inscripto', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await ctx.newPage();
    const po = new TournamentDetailPage(page, SEED_TOURNAMENTS.withCaptainMateo);
    try {
      await po.goto();
      await expect(
        po.teamsHeading,
        'El heading "Equipos inscriptos" debe ser visible',
      ).toBeVisible();
      await expect(
        po.teamCards.first(),
        'Debe existir al menos una tarjeta de equipo',
      ).toBeVisible({ timeout: 15_000 });
    } finally {
      await ctx.close();
    }
  });

  test('tarjeta de equipo muestra el nombre del equipo', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await ctx.newPage();
    const po = new TournamentDetailPage(page, SEED_TOURNAMENTS.withCaptainMateo);
    try {
      await po.goto();
      // The seed names the team "Equipo Capitan E2E"
      const teamCard = po.teamCard('Equipo Capitan E2E');
      await expect(
        teamCard,
        'La tarjeta del equipo "Equipo Capitan E2E" debe ser visible',
      ).toBeVisible({ timeout: 15_000 });
      const heading = teamCard.locator('h3');
      await expect(heading, 'El nombre del equipo debe estar en un h3').toBeVisible();
    } finally {
      await ctx.close();
    }
  });

  test('tarjeta de equipo muestra el nombre del capitán', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await ctx.newPage();
    const po = new TournamentDetailPage(page, SEED_TOURNAMENTS.withCaptainMateo);
    try {
      await po.goto();
      const captainParagraph = po.teamCaptainText('Equipo Capitan E2E');
      await expect(
        captainParagraph,
        'El párrafo con "Capitan:" debe ser visible en la tarjeta del equipo',
      ).toBeVisible({ timeout: 15_000 });
    } finally {
      await ctx.close();
    }
  });

  test('tarjeta de equipo muestra la lista de jugadores', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await ctx.newPage();
    const po = new TournamentDetailPage(page, SEED_TOURNAMENTS.withCaptainMateo);
    try {
      await po.goto();
      const playerList = po.teamPlayerList('Equipo Capitan E2E');
      await expect(
        playerList,
        'La lista ul.players-mini debe ser visible en la tarjeta del equipo',
      ).toBeVisible({ timeout: 15_000 });
      // At least the captain is a member
      const players = playerList.locator('li');
      const count = await players.count();
      expect(count, 'Debe haber al menos 1 jugador en la lista').toBeGreaterThanOrEqual(1);
    } finally {
      await ctx.close();
    }
  });

  test('torneo sin equipos muestra estado vacío en la sección de equipos', async ({ browser }) => {
    // T1 always has 0 teams (seed clears them each run)
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await ctx.newPage();
    const po = new TournamentDetailPage(page, SEED_TOURNAMENTS.open);
    try {
      await po.goto();
      await expect(
        po.emptyTeamsState,
        'Debe mostrarse el estado vacío cuando no hay equipos anotados',
      ).toContainText(/no hay equipos/i, { timeout: 15_000 });
    } finally {
      await ctx.close();
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   Bloque 3 — Fixture con datos (T3)
   ══════════════════════════════════════════════════════════════════════════ */

test.describe('Fixture con datos', () => {
  /**
   * Decision Context:
   * - T3 (withFixture) has 2 seeded fixture matches:
   *     · Round 1: COMPLETED — Team Alfa vs Team Beta, score 3-1.
   *     · Round 2: SCHEDULED — Team Alfa vs Team Beta, no score.
   * - The Astro page renders `.fixture-match--played` for COMPLETED matches
   *   and `.played-mark` for the "Jugado" label.
   * - The score is rendered as `scoreHome - scoreAway` in `.fixture-line strong`
   *   when played; otherwise "vs".
   * - All content is SSR-rendered — no hydration wait is needed.
   * - Previously fixed bugs: none relevant.
   */

  test('torneo con fixture muestra la sección de rondas y partidos', async ({ tournamentWithFixturePage }) => {
    await tournamentWithFixturePage.goto();
    await expect(
      tournamentWithFixturePage.fixtureSection,
      'La sección fixture debe ser visible para T3',
    ).toBeVisible();
    // Fixture has 2 matches → 2 rounds each with 1 match
    const rounds = tournamentWithFixturePage.page.locator('.round-block');
    const roundCount = await rounds.count();
    expect(roundCount, 'Debe haber al menos 1 bloque de ronda en el fixture').toBeGreaterThanOrEqual(1);
  });

  test('fixture match completado muestra el resultado (score) de ambos equipos', async ({ tournamentWithFixturePage }) => {
    await tournamentWithFixturePage.goto();
    // At least 1 played match should exist
    await expect(
      tournamentWithFixturePage.fixturePlayed.first(),
      'Debe existir al menos un fixture match con clase --played',
    ).toBeVisible({ timeout: 15_000 });
    // The score is rendered in .fixture-line strong as "X - Y"
    const score = tournamentWithFixturePage.fixtureMatchScore(0);
    await expect(score, 'El score del match completado debe mostrarse en .fixture-line strong').toBeVisible();
    const scoreText = await score.textContent();
    expect(scoreText, 'El score debe tener el formato "X - Y"').toMatch(/\d+\s*-\s*\d+/);
  });

  test('fixture match completado muestra la marca "Jugado"', async ({ tournamentWithFixturePage }) => {
    await tournamentWithFixturePage.goto();
    await expect(
      tournamentWithFixturePage.fixturePlayedMark.first(),
      'La marca ".played-mark" debe ser visible para el match completado',
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      tournamentWithFixturePage.fixturePlayedMark.first(),
      'La marca debe contener el texto "Jugado"',
    ).toContainText(/jugado/i);
  });

  test('fixture match pendiente muestra "vs" en lugar de un score', async ({ tournamentWithFixturePage }) => {
    await tournamentWithFixturePage.goto();
    // Matches not in .fixture-match--played are pending/scheduled
    // They render "vs" in .fixture-line strong
    const pendingMatches = tournamentWithFixturePage.page.locator(
      '.fixture-match:not(.fixture-match--played)',
    );
    await expect(
      pendingMatches.first(),
      'Debe existir al menos un fixture match pendiente',
    ).toBeVisible({ timeout: 15_000 });
    const vsText = pendingMatches.first().locator('.fixture-line strong');
    await expect(vsText, 'El match pendiente debe mostrar "vs"').toContainText(/vs/i);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   Bloque 4 — Panel de inscripción y capacidad
   ══════════════════════════════════════════════════════════════════════════ */

test.describe('Panel de inscripción y capacidad', () => {
  /**
   * Decision Context:
   * - The signup-panel (capacity number + status pill + progress bar) is SSR-rendered
   *   and visible to all users. No auth or hydration wait is required to check it.
   * - T2 is used because it has 1 registered team, making registeredTeamsCount > 0
   *   and allowing a progress bar width > 0%.
   * - Previously fixed bugs: none relevant.
   */

  test('panel lateral muestra el pill de estado del torneo', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await ctx.newPage();
    const po = new TournamentDetailPage(page, SEED_TOURNAMENTS.open);
    try {
      await po.goto();
      await expect(
        po.statusPill,
        'El pill de estado debe ser visible en el panel lateral',
      ).toBeVisible();
      // The status pill for T1 should say "Inscripcion abierta"
      await expect(po.statusPill).toContainText(/inscripcion abierta/i);
    } finally {
      await ctx.close();
    }
  });

  test('panel lateral muestra el contador de equipos inscriptos', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await ctx.newPage();
    const po = new TournamentDetailPage(page, SEED_TOURNAMENTS.withCaptainMateo);
    try {
      await po.goto();
      await expect(
        po.capacityNumber,
        'El .capacity-number con el conteo de equipos debe ser visible',
      ).toBeVisible({ timeout: 15_000 });
      // T2 has 1 team out of 4 → "1/4"
      const capacityText = await po.capacityNumber.textContent();
      expect(
        capacityText?.includes('1'),
        'El contador debe incluir el número 1 para el equipo inscripto',
      ).toBe(true);
    } finally {
      await ctx.close();
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   Bloque 5 — Responsive
   ══════════════════════════════════════════════════════════════════════════ */

test.describe('Responsive', () => {
  /**
   * Decision Context:
   * - These tests focus on the DETAIL view elements (info grid, teams section,
   *   fixture section) that were not covered in unirse-torneo.spec.ts responsive
   *   block (which focused on the registration form area).
   * - At ≤850px the Astro page collapses .hero-panel, .content-grid and
   *   .info-grid to `grid-template-columns: 1fr` (single column).
   * - Previously fixed bugs: none relevant.
   */

  test('grilla de información apilada en una columna en mobile 375px sin overflow', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await ctx.newPage();
    const po = new TournamentDetailPage(page, SEED_TOURNAMENTS.open);
    try {
      await page.setViewportSize({ width: 375, height: 812 });
      await po.goto();

      const bodyScrollWidth = await page.evaluate(() => document.body.scrollWidth);
      const viewportWidth = await page.evaluate(() => window.innerWidth);
      expect(
        bodyScrollWidth,
        'No debe haber scroll horizontal en mobile 375px en la página de detalle',
      ).toBeLessThanOrEqual(viewportWidth + 1);

      await expect(po.infoGrid, 'La grilla de info debe ser visible en mobile').toBeVisible();
    } finally {
      await ctx.close();
    }
  });

  test('sección de equipos visible y accesible en mobile 375px', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await ctx.newPage();
    const po = new TournamentDetailPage(page, SEED_TOURNAMENTS.withCaptainMateo);
    try {
      await page.setViewportSize({ width: 375, height: 812 });
      await po.goto();

      await expect(
        po.teamsHeading,
        'El heading "Equipos inscriptos" debe ser visible en mobile',
      ).toBeVisible();
      await expect(
        po.teamCards.first(),
        'La tarjeta del equipo debe ser visible en mobile',
      ).toBeVisible({ timeout: 15_000 });
    } finally {
      await ctx.close();
    }
  });

  test('sección de fixture visible en tablet 768px sin scroll horizontal', async ({ tournamentWithFixturePage, page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await tournamentWithFixturePage.goto();

    const bodyScrollWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(
      bodyScrollWidth,
      'No debe haber scroll horizontal en tablet 768px al ver el fixture',
    ).toBeLessThanOrEqual(viewportWidth + 1);

    await expect(
      tournamentWithFixturePage.fixtureSection,
      'La sección de fixture debe ser visible en tablet',
    ).toBeVisible();
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   Bloque 6 — Seguridad y acceso público
   ══════════════════════════════════════════════════════════════════════════ */

test.describe('Seguridad y acceso público', () => {
  /**
   * Decision Context:
   * - The `tournament(id)` query is public: no auth token is needed to read
   *   tournament data, teams, or fixture matches.
   * - This test issues a raw HTTP request directly to the backend GraphQL endpoint
   *   (without a browser) to confirm the query resolves without errors when called
   *   without an Authorization header.
   * - Previously fixed bugs: none relevant.
   */

  test('query tournament sin autenticación devuelve datos del torneo, equipos y fixture', async ({ request }) => {
    type TournamentPublicData = {
      tournament: { id: string; name: string; status: string; teams: { id: string; name: string }[]; fixtureMatches: { id: string; round: number; status: string }[] } | null;
    };
    const response = await gqlPost<TournamentPublicData>(
      request,
      `query TournamentDetailPublic($id: ID!) {
        tournament(id: $id) {
          id
          name
          status
          teams { id name }
          fixtureMatches { id round status }
        }
      }`,
      { id: SEED_TOURNAMENTS.withCaptainMateo },
      // Sin token de autorización — verificamos acceso público
    );

    expect(
      response.errors,
      'La query tournament sin auth no debe retornar errores GraphQL',
    ).toBeUndefined();

    const tournament = response.data?.tournament;
    expect(tournament, 'Los datos del torneo deben ser accesibles sin autenticación').not.toBeNull();
    expect(typeof tournament?.name, 'El nombre del torneo debe estar presente').toBe('string');
    expect(
      Array.isArray(tournament?.teams),
      'Los equipos del torneo deben ser accesibles sin autenticación',
    ).toBe(true);
  });

  test('mutation joinTournament sin token de auth retorna error de autenticación', async ({ request }) => {
    /*
     * Decision Context:
     * - Verifies that the write path (mutation) requires auth even though the read
     *   path (query) is public. This guards against a misconfigured resolver that
     *   accidentally allows unauthenticated writes.
     * - Already covered in unirse-torneo.spec.ts; repeated here as a sanity check
     *   in the context of the detail page feature boundary.
     */
    const response = await gqlPost(
      request,
      `mutation JoinUnauth($input: JoinTournamentInput!) {
        joinTournament(input: $input) { success message }
      }`,
      { input: { tournamentId: SEED_TOURNAMENTS.open, teamName: 'Hack Team', memberIds: [] } },
    );

    expect(
      response.errors?.length ?? 0,
      'La mutation joinTournament sin auth debe retornar error',
    ).toBeGreaterThanOrEqual(1);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   Bloque 7 — Navegación (complementa unirse-torneo.spec.ts)
   ══════════════════════════════════════════════════════════════════════════ */

test.describe('Navegación', () => {
  /**
   * Decision Context:
   * - These tests verify navigation CTAs on the detail page that are not explicitly
   *   covered in unirse-torneo.spec.ts (which focuses on the registration CTA).
   * - The "Crear torneo" button in the topbar is only visible when authenticated.
   * - Previously fixed bugs: none relevant.
   */

  test('enlace "Volver a torneos" navega a /torneos desde el detalle', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await ctx.newPage();
    const po = new TournamentDetailPage(page, SEED_TOURNAMENTS.open);
    try {
      await po.goto();
      const backLink = page.getByRole('link', { name: /volver a torneos/i });
      await expect(backLink, 'El enlace "Volver a torneos" debe ser visible').toBeVisible();
      await backLink.click();
      await expect(page, 'Debe navegar a /torneos').toHaveURL(/\/torneos$/, { timeout: 10_000 });
    } finally {
      await ctx.close();
    }
  });

  test.describe('usuario autenticado', () => {
    /*
     * Decision Context:
     * - test.use() must be called at describe scope, never inside a test() body.
     *   Wrapping in a nested describe is the canonical pattern used throughout this
     *   suite whenever a single test inside a broader describe needs a different auth
     *   posture.
     * - Previously fixed bugs: test.use() was erroneously placed inside the test()
     *   callback, causing Playwright to throw "did not expect test.use() to be called
     *   here".
     */
    test.use({ storageState: TEST_USERS.playerMateo.storageStatePath });

    test('usuario autenticado ve el enlace "Crear torneo" en la barra de navegación', async ({ page }) => {
      await page.goto(torneoDetailUrl(SEED_TOURNAMENTS.open));
      await expect(
        page.getByRole('heading', { level: 1 }),
        'El heading h1 debe cargarse para confirmar la página',
      ).toBeVisible({ timeout: 15_000 });
      await expect(
        page.getByRole('link', { name: /crear torneo/i }),
        'El link "Crear torneo" debe ser visible en el topbar para usuarios autenticados',
      ).toBeVisible();
    });
  });

  test('visitante anónimo ve enlace "Iniciar Sesion" en el topbar', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await ctx.newPage();
    const po = new TournamentDetailPage(page, SEED_TOURNAMENTS.open);
    try {
      await po.goto();
      /*
       * Decision Context:
       * - The detail page renders TWO links to /login for anonymous visitors: one in
       *   the shared topbar (data-testid="topbar-login-link", text "Iniciar Sesión")
       *   and one inline in the content area (.detail-login-button "Iniciar sesion
       *   para anotar equipo").
       * - The topbar was extracted into the shared <Topbar> component (class
       *   `shared-topbar`, NOT the old `.topbar`), so we scope via the stable
       *   data-testid the component now exposes instead of a class + text regex. The
       *   accented "Sesión" also breaks a /iniciar sesion/i match, another reason to
       *   avoid text matching here.
       * - Previously fixed bugs:
       *     1. getByRole('/iniciar sesion/i') without scoping matched 2 elements and
       *        caused "strict mode violation" failure.
       *     2. page.locator('.topbar') matched zero elements once the topbar became a
       *        shared component with class `shared-topbar`. Replaced with the testid.
       */
      await expect(
        page.getByTestId('topbar-login-link'),
        'El link de login debe ser visible en el topbar para visitantes anónimos',
      ).toBeVisible({ timeout: 10_000 });
    } finally {
      await ctx.close();
    }
  });
});
