import {
  buildMatch,
  expect,
  FRONTEND_URL,
  GRAPHQL_PROXY_ROUTE,
  mockGraphQLAll,
  test,
  TEST_USERS,
} from './support';

/**
 * Tests E2E del epic WebApp Responsiva.
 *
 * Decision Context:
 * - El done del epic pide demostrar la webapp en formatos usuales; estos tests
 *   cubren los breakpoints representativos de la doc manual: mobile 390x844,
 *   tablet 768x1024 y desktop 1280x800.
 * - Priorizamos invariantes que rompen UX real: cero overflow horizontal,
 *   formularios con targets tactiles, grid de partidos 1/2/3 columnas y
 *   navegacion mobile del panel de club.
 * - Las paginas publicas que hidratan GraphQL se mockean para que el responsive
 *   no dependa de Supabase. El panel de club sigue usando el seed E2E porque su
 *   primer render es SSR protegido.
 */

const VIEWPORTS = {
  mobile: { width: 390, height: 844 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1280, height: 800 },
} as const;

const responsiveMatches = [
  buildMatch({
    id: '00000000-0000-0000-0000-00000000aa01',
    title: 'Responsive Palermo',
    club: { name: 'Club Palermo', zone: 'Centro' },
  }),
  buildMatch({
    id: '00000000-0000-0000-0000-00000000aa02',
    title: 'Responsive Prado',
    club: { name: 'Club Prado', zone: 'Oeste' },
  }),
  buildMatch({
    id: '00000000-0000-0000-0000-00000000aa03',
    title: 'Responsive Pocitos',
    club: { name: 'Club Pocitos', zone: 'Este' },
  }),
];

async function expectNoHorizontalOverflow(page: import('@playwright/test').Page): Promise<void> {
  await expect
    .poll(async () => {
      return page.evaluate(() => {
        const documentWidth = Math.max(
          document.documentElement.scrollWidth,
          document.body.scrollWidth,
        );
        return documentWidth - window.innerWidth;
      });
    }, { message: 'la pagina no debe desbordar horizontalmente' })
    .toBeLessThanOrEqual(1);
}

async function expectMinTouchSize(locator: import('@playwright/test').Locator, min = 44) {
  const box = await locator.boundingBox();
  expect(box, 'el target tactil debe existir').not.toBeNull();
  expect(box!.height).toBeGreaterThanOrEqual(min);
}

async function waitForClientLoadIslands(page: import('@playwright/test').Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const islands = Array.from(document.querySelectorAll('astro-island[client="load"]'));
      return islands.length === 0 || islands.every((island) => island.hasAttribute('client-render-time'));
    },
    { timeout: 10_000 },
  );
}

test.describe('Responsive publico y jugador', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.mobile);
    await mockGraphQLAll(page, GRAPHQL_PROXY_ROUTE, {
      data: { matches: responsiveMatches },
    });
  });

  test('mobile 390px: rutas principales no tienen scroll horizontal', async ({ page }) => {
    for (const path of ['/', '/login', '/registro-jugador', '/registro-club', '/partidos']) {
      await page.goto(`${FRONTEND_URL}${path}`);
      await expectNoHorizontalOverflow(page);
    }
  });

  test('mobile 390px: login tiene controles tactiles y evita zoom automatico iOS', async ({
    page,
  }) => {
    await page.goto(`${FRONTEND_URL}/login`);

    const emailInput = page.locator('#email');
    const passwordInput = page.locator('#password');
    const submitButton = page.getByRole('button', { name: /ingresar/i });

    await expect(emailInput).toBeVisible();
    await expectMinTouchSize(submitButton);

    await expect
      .poll(() => emailInput.evaluate((el) => parseFloat(getComputedStyle(el).fontSize)))
      .toBeGreaterThanOrEqual(16);
    await expect
      .poll(() => passwordInput.evaluate((el) => parseFloat(getComputedStyle(el).fontSize)))
      .toBeGreaterThanOrEqual(16);
  });

  test('mobile 390px: registro de jugador apila password y confirmacion', async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/registro-jugador`);

    const passwordInput = page.locator('#password');
    const confirmInput = page.locator('#confirmPassword');
    const submitButton = page.getByRole('button', { name: /crear cuenta/i });

    await expect(passwordInput).toBeVisible();
    await expect(confirmInput).toBeVisible();
    await expectMinTouchSize(submitButton);

    const passwordBox = await passwordInput.boundingBox();
    const confirmBox = await confirmInput.boundingBox();
    expect(passwordBox).not.toBeNull();
    expect(confirmBox).not.toBeNull();
    expect(confirmBox!.y).toBeGreaterThan(passwordBox!.y + 8);
    await expectNoHorizontalOverflow(page);
  });
});

test.describe('Responsive listado de partidos', () => {
  test.use({ storageState: TEST_USERS.playerMateo.storageStatePath });

  test.beforeEach(async ({ page }) => {
    await mockGraphQLAll(page, GRAPHQL_PROXY_ROUTE, {
      data: { matches: responsiveMatches },
    });
  });

  test('mobile 390px: topbar compacto y cards en una columna', async ({ page, matchesPage }) => {
    await page.setViewportSize(VIEWPORTS.mobile);
    await matchesPage.goto();
    await matchesPage.expectListSettled('Responsive Palermo');

    await expect(page.getByRole('link', { name: /\+ crear partido/i })).toBeHidden();
    await expect(page.getByRole('link', { name: /mi perfil/i })).toBeHidden();
    await expect(page.locator('.user-badge')).toBeVisible();

    const cards = page.locator('[aria-label^="Ver detalle del partido"]');
    const first = await cards.nth(0).boundingBox();
    const second = await cards.nth(1).boundingBox();
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(Math.abs(first!.x - second!.x)).toBeLessThanOrEqual(2);
    expect(second!.y).toBeGreaterThan(first!.y + first!.height - 2);

    await expectMinTouchSize(page.getByRole('tab', { name: /pr/i }).first());
    await expectNoHorizontalOverflow(page);
  });

  test('tablet 768px: listado usa dos columnas sin overflow', async ({ page, matchesPage }) => {
    await page.setViewportSize(VIEWPORTS.tablet);
    await matchesPage.goto();
    await matchesPage.expectListSettled('Responsive Palermo');

    const cards = page.locator('[aria-label^="Ver detalle del partido"]');
    const first = await cards.nth(0).boundingBox();
    const second = await cards.nth(1).boundingBox();
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(second!.x).toBeGreaterThan(first!.x + first!.width * 0.75);
    expect(Math.abs(first!.y - second!.y)).toBeLessThanOrEqual(2);

    await expectNoHorizontalOverflow(page);
  });

  test('desktop 1280px: listado mantiene tres columnas', async ({ page, matchesPage }) => {
    await page.setViewportSize(VIEWPORTS.desktop);
    await matchesPage.goto();
    await matchesPage.expectListSettled('Responsive Palermo');

    const cards = page.locator('[aria-label^="Ver detalle del partido"]');
    const first = await cards.nth(0).boundingBox();
    const second = await cards.nth(1).boundingBox();
    const third = await cards.nth(2).boundingBox();
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(third).not.toBeNull();
    expect(second!.x).toBeGreaterThan(first!.x + first!.width * 0.75);
    expect(third!.x).toBeGreaterThan(second!.x + second!.width * 0.75);
    expect(Math.abs(first!.y - third!.y)).toBeLessThanOrEqual(2);
  });
});

test.describe('Responsive panel de club', () => {
  test.use({ storageState: TEST_USERS.clubAdmin.storageStatePath });

  test('mobile 390px: hamburger abre drawer y oculta sidebar desktop', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.mobile);
    await page.goto(`${FRONTEND_URL}/panel-club/dashboard`);
    await waitForClientLoadIslands(page);

    const menuButton = page.getByRole('button', { name: /abrir men/i });
    await expect(menuButton).toBeVisible();
    await expectMinTouchSize(menuButton);
    await expect(page.locator('.sidebar')).toBeHidden();
    await expect(page.locator('.page-content')).toBeVisible();

    await menuButton.click();
    const drawer = page.getByRole('dialog', { name: /men/i });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole('link', { name: /dashboard/i })).toBeVisible();
    await expect(drawer.getByRole('link', { name: /crear partido/i })).toBeVisible();
    await expectMinTouchSize(drawer.getByRole('link', { name: /horarios/i }), 48);

    await page.getByRole('button', { name: /cerrar men/i }).click();
    await expect(drawer).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
  });

  test('tablet 768px: sidebar visible y hamburger oculto', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.tablet);
    await page.goto(`${FRONTEND_URL}/panel-club/dashboard`);
    await waitForClientLoadIslands(page);

    await expect(page.locator('.sidebar')).toBeVisible();
    await expect(page.getByRole('button', { name: /abrir men/i })).toBeHidden();
    await expect(page.getByRole('link', { name: /crear partido/i }).first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
