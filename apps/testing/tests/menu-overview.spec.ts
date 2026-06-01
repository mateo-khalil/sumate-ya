import { expect, GRAPHQL_PROXY_ROUTE, mockGraphQLAll, test } from './support';

/**
 * Tests E2E del menu/vistazo rápido en la home (/).
 *
 * Decision Context:
 * - La home hidrata MatchList y dispara una query pública. Mockeamos
 *   `/api/graphql` con una lista vacía para que la home rinda contra un
 *   contrato controlado y los tests no dependan del estado de Supabase.
 * - El objetivo de estos tests es navegación y contenido del menu, no el
 *   estado del backend.
 * - Previously fixed bugs: none relevant.
 */

test.describe('Menu de vistazo rapido (/)', () => {
  test.beforeEach(async ({ page }) => {
    await mockGraphQLAll(page, GRAPHQL_PROXY_ROUTE, { data: { matches: [] } });
  });

  test('muestra el resumen principal y CTAs para visitantes', async ({ homePage }) => {
    await homePage.goto();

    await expect(homePage.hero).toBeVisible();
    await expect(homePage.loginLink).toHaveAttribute('href', '/login');
    await expect(homePage.registerLink).toHaveAttribute('href', '/registro-jugador');
  });

  test('incluye accesos y contenido para explorar partidos disponibles', async ({
    homePage,
    page,
  }) => {
    await homePage.goto();

    await expect(page.getByRole('heading', { name: /partidos disponibles/i })).toBeVisible();
    await expect(homePage.viewAllMatchesLink).toHaveAttribute('href', '/partidos');
    await expect(homePage.searchInput).toBeVisible();
    await expect(page.locator('main select')).toHaveCount(3);
    await expect(page.getByText(/no hay partidos disponibles/i)).toBeVisible();
  });

  test('presenta metricas y pasos que explican rapidamente como funciona', async ({
    homePage,
    page,
  }) => {
    await homePage.goto();

    await expect(homePage.metricCard('Jugadores', '500+')).toBeVisible();
    await expect(homePage.metricCard('Partidos activos', '120+')).toBeVisible();
    await expect(homePage.metricCard('Clubes', '30+')).toBeVisible();

    await expect(page.getByRole('heading', { name: /c.mo funciona/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /crea tu perfil/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /encontr.*partidos/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /sumate al equipo/i })).toBeVisible();
  });

  test('permite navegar desde el vistazo rapido hacia login, registro y partidos', async ({
    homePage,
    page,
  }) => {
    await homePage.goto();

    await homePage.registerLink.click();
    await expect(page).toHaveURL(/\/registro-jugador$/);
    await expect(page.locator('#displayName')).toBeVisible();

    await homePage.goto();
    await homePage.loginLink.click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.locator('#email')).toBeVisible();

    await homePage.goto();
    await homePage.viewAllMatchesLink.click();
    await expect(page).toHaveURL(/\/partidos$/);
    // /partidos unified matches + tournaments under one h1 (commit 432281a):
    // the destination heading is now "Partidos & Torneos", not "Partidos Disponibles"
    // (that text only lives as the home section heading).
    await expect(page.getByRole('heading', { name: /partidos\s*&\s*torneos/i })).toBeVisible();
  });
});
