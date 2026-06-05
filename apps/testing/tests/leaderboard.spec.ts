import {
  buildLeaderboardEntry,
  expect,
  GRAPHQL_PROXY_ROUTE,
  gqlPostOrThrow,
  mockGraphQLAll,
  readAccessToken,
  test,
  TEST_USERS,
} from './support';

/**
 * Tests E2E — Ranking de jugadores (/leaderboard).
 *
 * Decision Context:
 * - La página tiene SSR shell (prerender = false) para que el Topbar compartido se
 *   renderice con la sesión, pero LeaderboardTable hidrata cliente con client:visible y
 *   pide el ranking browser-side vía fetch('/api/graphql'). Por eso se intercepta con
 *   mockGraphQLAll(GRAPHQL_PROXY_ROUTE) antes de cada goto().
 * - El endpoint `leaderboard` es público: tanto visitantes anónimos como autenticados ven
 *   la tabla. No se mockea ninguna ruta de auth porque no hay mutaciones.
 * - El backend ya ordena por winrate y asigna `rank`; el componente NO ordena nada, sólo
 *   renderiza en el orden recibido. Por eso los mocks pasan entries ya ordenadas.
 * - Self-highlight (.leaderboard-row--self / badge "Vos") sólo aparece cuando el userId de
 *   la sesión coincide con una fila. Para ese caso se obtiene el id real de playerMateo vía
 *   myProfile (gqlPostOrThrow con el token de la cookie) y se mockea una entry con ese id.
 * - Los skeletons de carga son <div>; cuando aparece la tabla, el estado vacío o el panel de
 *   error sabemos que la hidratación y el fetch completaron (expectSettled()).
 * - Previously fixed bugs: none relevant.
 */

/* ══════════════════════════════════════════════════════════════════════════
   Bloque 1 — Layout, estados y render de filas (visitante anónimo)
   ══════════════════════════════════════════════════════════════════════════ */

test.describe('Ranking — layout, estados y filas', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    // Default: ranking vacío. Cada test sobreescribe el mock antes del goto().
    await mockGraphQLAll(page, GRAPHQL_PROXY_ROUTE, { data: { leaderboard: [] } });
  });

  test('renderiza el heading y el subtítulo al navegar a /leaderboard', async ({
    leaderboardPage,
  }) => {
    await leaderboardPage.goto();

    await expect(leaderboardPage.heading).toBeVisible();
    await expect(leaderboardPage.subtitle).toBeVisible();
  });

  test('muestra estado vacío cuando no hay jugadores con 5+ partidos', async ({
    leaderboardPage,
  }) => {
    await leaderboardPage.goto();
    await leaderboardPage.expectSettled();

    await expect(leaderboardPage.emptyState).toBeVisible();
  });

  test('muestra panel de error cuando la query falla', async ({ leaderboardPage, page }) => {
    await mockGraphQLAll(page, GRAPHQL_PROXY_ROUTE, {
      errors: [{ message: 'Error de conexión con el servidor' }],
    });

    await leaderboardPage.goto();
    await leaderboardPage.expectSettled();

    await expect(leaderboardPage.errorPanel).toBeVisible();
    await expect(page.getByText('Error de conexión con el servidor')).toBeVisible();
  });

  test('botón Reintentar recarga el ranking', async ({ leaderboardPage, page }) => {
    await mockGraphQLAll(page, GRAPHQL_PROXY_ROUTE, { errors: [{ message: 'Timeout' }] });
    await leaderboardPage.goto();
    await expect(leaderboardPage.errorPanel).toBeVisible({ timeout: 15_000 });

    await mockGraphQLAll(page, GRAPHQL_PROXY_ROUTE, {
      data: { leaderboard: [buildLeaderboardEntry({ displayName: 'Retry Crack' })] },
    });
    await leaderboardPage.retryButton.click();

    await expect(leaderboardPage.row('Retry Crack')).toBeVisible({ timeout: 10_000 });
  });

  test('renderiza las filas en el orden recibido con rank, nombre y efectividad', async ({
    leaderboardPage,
    page,
  }) => {
    await mockGraphQLAll(page, GRAPHQL_PROXY_ROUTE, {
      data: {
        leaderboard: [
          buildLeaderboardEntry({ rank: 1, id: 'p1', displayName: 'Messi', matchesPlayed: 10, matchesWon: 9, winrate: 90 }),
          buildLeaderboardEntry({ rank: 2, id: 'p2', displayName: 'Di Maria', matchesPlayed: 8, matchesWon: 6, winrate: 75 }),
          buildLeaderboardEntry({ rank: 3, id: 'p3', displayName: 'Julian', matchesPlayed: 6, matchesWon: 3, winrate: 50 }),
        ],
      },
    });

    await leaderboardPage.goto();
    await leaderboardPage.expectSettled();

    await expect(leaderboardPage.row('Messi')).toBeVisible();
    await expect(leaderboardPage.row('Di Maria')).toBeVisible();
    await expect(leaderboardPage.row('Julian')).toBeVisible();
    // Efectividad formateada a un decimal.
    await expect(leaderboardPage.row('Messi').getByText('90.0%')).toBeVisible();
    await expect(leaderboardPage.row('Di Maria').getByText('75.0%')).toBeVisible();
  });

  test('muestra estadísticas de partidos jugados y ganados', async ({
    leaderboardPage,
    page,
  }) => {
    await mockGraphQLAll(page, GRAPHQL_PROXY_ROUTE, {
      data: {
        leaderboard: [
          buildLeaderboardEntry({ id: 'p1', displayName: 'Goleador', matchesPlayed: 11, matchesWon: 7, winrate: 63.64 }),
        ],
      },
    });

    await leaderboardPage.goto();
    await leaderboardPage.expectSettled();

    const row = leaderboardPage.row('Goleador');
    await expect(row.getByText('11', { exact: true })).toBeVisible();
    await expect(row.getByText('7', { exact: true })).toBeVisible();
    await expect(row.getByText('63.6%')).toBeVisible();
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   Bloque 2 — Acceso público (anónimo) y navegación
   ══════════════════════════════════════════════════════════════════════════ */

test.describe('Ranking — acceso público', () => {
  test('visitante anónimo puede ver el ranking sin iniciar sesión', async ({
    leaderboardPage,
    page,
  }) => {
    await mockGraphQLAll(page, GRAPHQL_PROXY_ROUTE, {
      data: { leaderboard: [buildLeaderboardEntry({ displayName: 'Crack Público' })] },
    });

    await leaderboardPage.goto();
    await leaderboardPage.expectSettled();

    await expect(leaderboardPage.row('Crack Público')).toBeVisible();
    // El navbar anónimo mantiene el CTA de iniciar sesión.
    await expect(page.getByRole('link', { name: /Iniciar Sesión/i })).toBeVisible();
    // Sin sesión, ninguna fila está resaltada como propia.
    await expect(leaderboardPage.selfRow).toHaveCount(0);
  });

  test('el link "Ranking" del navbar lleva a /leaderboard', async ({ leaderboardPage, page }) => {
    await mockGraphQLAll(page, GRAPHQL_PROXY_ROUTE, { data: { leaderboard: [] } });
    await leaderboardPage.goto();

    await expect(page.getByRole('link', { name: 'Ranking' })).toHaveAttribute(
      'href',
      '/leaderboard',
    );
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   Bloque 3 — Usuario autenticado: resaltado de la fila propia
   ══════════════════════════════════════════════════════════════════════════ */

test.describe('Ranking — resaltado de la fila propia', () => {
  test.use({ storageState: TEST_USERS.playerMateo.storageStatePath });

  test('la fila del jugador logueado se resalta con el badge "Vos"', async ({
    leaderboardPage,
    page,
    request,
  }) => {
    // El id propio no es estático: lo resolvemos vía myProfile con el token de sesión.
    const token = await readAccessToken(page);
    const { myProfile } = await gqlPostOrThrow<{ myProfile: { id: string } }>(
      request,
      'query { myProfile { id } }',
      undefined,
      token,
    );

    await mockGraphQLAll(page, GRAPHQL_PROXY_ROUTE, {
      data: {
        leaderboard: [
          buildLeaderboardEntry({ rank: 1, id: 'otro-1', displayName: 'Rival Uno', winrate: 88 }),
          buildLeaderboardEntry({ rank: 2, id: myProfile.id, displayName: 'Mateo E2E', winrate: 70 }),
        ],
      },
    });

    await leaderboardPage.goto();
    await leaderboardPage.expectSettled();

    await expect(leaderboardPage.selfRow).toHaveCount(1);
    await expect(leaderboardPage.selfRow).toContainText('Vos');
    // La fila del rival no debe estar resaltada.
    await expect(leaderboardPage.row('Rival Uno')).not.toHaveClass(/leaderboard-row--self/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   Bloque 4 — Responsive
   ══════════════════════════════════════════════════════════════════════════ */

test.describe('Ranking — responsive', () => {
  test.beforeEach(async ({ page }) => {
    await mockGraphQLAll(page, GRAPHQL_PROXY_ROUTE, {
      data: { leaderboard: [buildLeaderboardEntry({ displayName: 'Crack Mobile' })] },
    });
  });

  test('sin scroll horizontal y con la tabla visible en mobile 375px', async ({
    leaderboardPage,
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await leaderboardPage.goto();
    await leaderboardPage.expectSettled();

    await expect(leaderboardPage.row('Crack Mobile')).toBeVisible();
    const bodyScrollWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(
      bodyScrollWidth,
      'No debe haber overflow horizontal en mobile 375px',
    ).toBeLessThanOrEqual(viewportWidth + 1);
  });
});
