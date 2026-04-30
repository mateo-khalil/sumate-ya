import { expect, test, type Page, type Route } from '@playwright/test';

/**
 * Tests E2E del menu/vistazo rapido de la app en la home (/).
 *
 * Decision Context:
 * - La historia pide que el usuario pueda ver un menu con un vistazo rapido de
 *   que trata la app. En el producto actual esa experiencia vive en la home:
 *   hero + CTA, partidos disponibles, metricas, "Como funciona" y CTA final.
 * - Mockeamos /api/graphql porque la home hidrata MatchList y dispara una query
 *   publica. El objetivo de estos tests es validar navegacion/contenido del menu,
 *   no el estado de Supabase ni del backend.
 * - El mock acepta GET y POST para cubrir el comportamiento de urql/fetchExchange.
 */

const FRONTEND_URL = 'http://localhost:4321';

async function mockHomeGraphQL(page: Page): Promise<void> {
  await page.route('**/api/graphql**', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { matches: [] } }),
    });
  });
}

test.describe('Menu de vistazo rapido (/)', () => {
  test.beforeEach(async ({ page }) => {
    await mockHomeGraphQL(page);
  });

  test('muestra el resumen principal de la app y sus acciones para visitantes', async ({
    page,
  }) => {
    await page.goto(FRONTEND_URL);

    await expect(page.getByRole('heading', { name: /sumate\s+al juego/i })).toBeVisible();
    await expect(
      page.getByText(/plataforma para conectar jugadores de f.tbol/i),
    ).toBeVisible();

    const loginLink = page.getByRole('link', { name: /iniciar sesi/i }).first();
    const registerLink = page.getByRole('link', { name: /registrarse/i }).first();

    await expect(loginLink).toHaveAttribute('href', '/login');
    await expect(registerLink).toHaveAttribute('href', '/registro-jugador');
  });

  test('incluye accesos y contenido para explorar partidos disponibles', async ({ page }) => {
    await page.goto(FRONTEND_URL);

    await expect(
      page.getByRole('heading', { name: /partidos disponibles/i }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: /ver todos/i })).toHaveAttribute(
      'href',
      '/partidos',
    );
    await expect(page.getByPlaceholder(/buscar por partido o club/i)).toBeVisible();
    await expect(page.locator('main select')).toHaveCount(3);
    await expect(page.getByText(/no hay partidos disponibles/i)).toBeVisible();
  });

  test('presenta metricas y pasos que explican rapidamente como funciona', async ({
    page,
  }) => {
    await page.goto(FRONTEND_URL);

    await expect(page.getByText('500+')).toBeVisible();
    await expect(page.getByText('Jugadores', { exact: true })).toBeVisible();
    await expect(page.getByText('120+')).toBeVisible();
    await expect(page.getByText('Partidos activos', { exact: true })).toBeVisible();
    await expect(page.getByText('30+')).toBeVisible();
    await expect(page.getByText('Clubes', { exact: true })).toBeVisible();

    await expect(page.getByRole('heading', { name: /c.mo funciona/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /crea tu perfil/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /encontr.*partidos/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /sumate al equipo/i })).toBeVisible();
  });

  test('permite navegar desde el vistazo rapido hacia login, registro y partidos', async ({
    page,
  }) => {
    await page.goto(FRONTEND_URL);

    await page.getByRole('link', { name: /registrarse/i }).first().click();
    await expect(page).toHaveURL(/\/registro-jugador$/);
    await expect(page.locator('#displayName')).toBeVisible();

    await page.goto(FRONTEND_URL);
    await page.getByRole('link', { name: /iniciar sesi/i }).first().click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.locator('#email')).toBeVisible();

    await page.goto(FRONTEND_URL);
    await page.getByRole('link', { name: /ver todos/i }).click();
    await expect(page).toHaveURL(/\/partidos$/);
    await expect(
      page.getByRole('heading', { name: /partidos disponibles/i }),
    ).toBeVisible();
  });
});
