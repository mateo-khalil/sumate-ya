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
 * - "Crear partido aquí" del popover de slot libre ahora es un BOTÓN que abre el
 *   wizard de partido en un modal in-place (antes era un link a /panel-club/horarios
 *   con action=create, que la página rediseñada ignora). Verificamos el cambio de
 *   contrato: el botón existe y abre un dialog "Crear partido" sin navegar fuera del
 *   dashboard. No afirmamos el paso/heading interno del wizard porque el auto-avance
 *   depende de que el slot semilla caiga en la semana actual (time-drift de seed).
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
      // "Crear partido aquí" es un botón (abre el wizard en un modal), no un link.
      await expect(clubDashboardPage.createMatchAction).toBeVisible();
      await expect(clubDashboardPage.blockSlotLink).toHaveAttribute('href', /action=block/);
      await clubDashboardPage.freeSlotPanel.getByRole('button', { name: /cerrar/i }).click();

      await clubDashboardPage.slotCell(SEED_CLUB_DASHBOARD.blockedSlotTime, 'BLOCKED').click();
      const blockedPanel = page.locator('.slot-panel');
      await expect(blockedPanel.getByText(/^bloqueado$/i)).toBeVisible();
      await expect(blockedPanel.getByText(SEED_CLUB_DASHBOARD.blockedReason)).toBeVisible();
      await expect(blockedPanel.getByRole('link', { name: /desbloquear en horarios/i })).toHaveAttribute(
        'href',
        /action=unblock/,
      );
    });

    test('"Crear partido aquí" abre el wizard en un modal sin salir del dashboard', async ({
      clubDashboardPage,
      page,
    }) => {
      await clubDashboardPage.goto();

      await clubDashboardPage.slotCell(SEED_CLUB_DASHBOARD.freeSlotTime, 'AVAILABLE').click();
      await clubDashboardPage.createMatchAction.click();

      await expect(clubDashboardPage.matchWizardDialog).toBeVisible();
      // Regresión previa: el link a /panel-club/horarios?action=create dejaba al admin en el
      // configurador de horarios. Ahora abre un dialog y NO navega fuera del dashboard.
      await expect(page).toHaveURL(/\/panel-club\/dashboard/);

      await clubDashboardPage.matchWizardDialog.getByRole('button', { name: /cerrar/i }).click();
      await expect(clubDashboardPage.matchWizardDialog).toBeHidden();
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
