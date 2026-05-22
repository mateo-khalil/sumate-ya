import type { Browser, Page, Request } from '@playwright/test';
import {
  CLUB_DASHBOARD_URL,
  expect,
  FRONTEND_URL,
  SEED_CLUB_DASHBOARD,
  test,
  TEST_USERS,
} from './support';

/**
 * Tests E2E del dashboard de club (/panel-club/dashboard).
 *
 * Decision Context:
 * - La historia pedía /club/dashboard, pero la pantalla existente del producto
 *   vive en /panel-club/dashboard y está protegida por el middleware de rol.
 * - La primera carga hace fetch SSR contra GraphQL; Playwright no puede mockear
 *   ese request desde el browser. Por eso usamos el seed idempotente para dejar
 *   un club, una cancha y tres estados de slot determinísticos.
 */

function emptyStorageState() {
  return { cookies: [], origins: [] };
}

async function openDashboardAs(
  browser: Browser,
  storageState: string | ReturnType<typeof emptyStorageState>,
): Promise<Page> {
  const context = await browser.newContext({ storageState });
  const page = await context.newPage();
  return page;
}

function isDashboardRefetch(req: Request): boolean {
  const body = req.postData() ?? '';
  return req.method() === 'POST'
    && req.url().includes('/api/graphql')
    && body.includes('CLUB_DASHBOARD');
}

test.describe('Dashboard de club (/panel-club/dashboard)', () => {
  test.describe.configure({ mode: 'serial' });

  test('redirige al login si no hay sesion autenticada', async ({ browser }) => {
    const page = await openDashboardAs(browser, emptyStorageState());
    try {
      await page.goto(CLUB_DASHBOARD_URL);
      await expect(page).toHaveURL(`${FRONTEND_URL}/login`);
    } finally {
      await page.context().close();
    }
  });

  test('bloquea el acceso a jugadores y los redirige a /partidos', async ({ browser }) => {
    const page = await openDashboardAs(browser, TEST_USERS.playerMateo.storageStatePath);
    try {
      await page.goto(CLUB_DASHBOARD_URL);
      await expect(page).toHaveURL(`${FRONTEND_URL}/partidos`);
    } finally {
      await page.context().close();
    }
  });

  test.describe('como club_admin', () => {
    test.use({ storageState: TEST_USERS.clubAdmin.storageStatePath });

    test('muestra la vista semanal con slots libres, ocupados y bloqueados', async ({
      clubDashboardPage,
      page,
    }) => {
      await clubDashboardPage.goto();

      await expect(page.getByRole('heading', { name: SEED_CLUB_DASHBOARD.clubName })).toBeVisible();
      await expect(page.getByText(/partidos esta semana/i).first()).toBeVisible();
      await expect(page.getByText(/ocupaci/i).first()).toBeVisible();
      await expect(page.getByText(/canchas activas/i).first()).toBeVisible();

      await expect(page.getByText('Libre').first()).toBeVisible();
      await expect(page.getByText('Partido abierto').first()).toBeVisible();
      await expect(page.getByText('Bloqueado').first()).toBeVisible();

      await expect(
        clubDashboardPage.slotCell(SEED_CLUB_DASHBOARD.freeSlotTime, 'AVAILABLE'),
      ).toBeVisible();
      await expect(
        clubDashboardPage.slotCell(SEED_CLUB_DASHBOARD.matchSlotTime, 'MATCH_OPEN'),
      ).toBeVisible();
      await expect(
        clubDashboardPage.slotCell(SEED_CLUB_DASHBOARD.blockedSlotTime, 'BLOCKED'),
      ).toBeVisible();
    });

    test('permite inspeccionar un slot libre y un slot bloqueado desde el calendario', async ({
      clubDashboardPage,
      page,
    }) => {
      await clubDashboardPage.goto();

      await clubDashboardPage.slotCell(SEED_CLUB_DASHBOARD.freeSlotTime, 'AVAILABLE').click();
      await expect(page.getByText(/horario libre/i)).toBeVisible();
      await expect(page.getByText(/cancha/i).first()).toBeVisible();
      await expect(page.getByRole('link', { name: /crear partido aqu/i })).toHaveAttribute(
        'href',
        /action=create/,
      );
      await expect(page.getByRole('link', { name: /bloquear horario/i })).toHaveAttribute(
        'href',
        /action=block/,
      );
      await page.getByRole('button', { name: /cerrar/i }).click();

      await clubDashboardPage.slotCell(SEED_CLUB_DASHBOARD.blockedSlotTime, 'BLOCKED').click();
      const blockedPanel = page.locator('.slot-panel');
      await expect(blockedPanel.getByText(/^bloqueado$/i)).toBeVisible();
      await expect(blockedPanel.getByText(SEED_CLUB_DASHBOARD.blockedReason)).toBeVisible();
      await expect(blockedPanel.getByRole('link', { name: /desbloquear en horarios/i })).toHaveAttribute(
        'href',
        /action=unblock/,
      );
    });

    test('abre el detalle del partido con cancha, formato, cupos y organizador', async ({
      clubDashboardPage,
      page,
    }) => {
      await clubDashboardPage.goto();

      await clubDashboardPage.slotCell(SEED_CLUB_DASHBOARD.matchSlotTime, 'MATCH_OPEN').click();

      const dialog = page.getByRole('dialog', { name: /detalle del partido/i });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByText('5 vs 5')).toBeVisible();
      await expect(dialog.getByText(/abierto/i)).toBeVisible();
      await expect(dialog.getByText(/cancha/i).first()).toBeVisible();
      await expect(dialog.getByText(/\d+ \/ 10 jugadores/i)).toBeVisible();
      await expect(dialog.getByText(/organizador/i)).toBeVisible();
      await expect(dialog.getByRole('link', { name: /ver perfil del organizador/i })).toBeVisible();
    });

    test('muestra la agenda semanal y refetchea GraphQL con filtros de fecha', async ({
      clubDashboardPage,
      page,
    }) => {
      await clubDashboardPage.goto();

      await clubDashboardPage.agendaViewButton.click();
      await expect(clubDashboardPage.agendaMatchCell()).toBeVisible();
      await expect(page.getByText('5 vs 5').first()).toBeVisible();
      await expect(page.getByText(/\d+\/10/).first()).toBeVisible();

      const requestPromise = page.waitForRequest(isDashboardRefetch);
      await clubDashboardPage.nextWeekButton.click();
      const request = await requestPromise;
      const payload = JSON.parse(request.postData() ?? '{}') as {
        variables?: {
          filters?: {
            startDate?: string;
            endDate?: string;
            includeBlocked?: boolean;
            includeInactive?: boolean;
          };
        };
      };

      expect(payload.variables?.filters).toMatchObject({
        includeBlocked: true,
        includeInactive: false,
      });
      expect(payload.variables?.filters?.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(payload.variables?.filters?.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      await clubDashboardPage.waitForRefetchSettled();
    });
  });
});
