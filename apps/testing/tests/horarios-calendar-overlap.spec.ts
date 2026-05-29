import {
  expect,
  FRONTEND_URL,
  test,
  TEST_USERS,
} from './support';

/**
 * Regression e2e — fix visual overlap del calendario en /panel-club/horarios.
 *
 * Decision Context:
 * - Por qué SSR-friendly + sin mocks: la query `MY_CLUB_SLOTS_SSR` se ejecuta
 *   en el frontmatter de `apps/frontend/src/pages/panel-club/horarios.astro`
 *   (server-side, POST directo al backend `:4000/graphql` con la cookie
 *   HttpOnly). Ese request nunca pasa por el browser, así que `page.route()`
 *   NO puede interceptarlo. Por eso este spec se apoya 100% en la seed real
 *   (`apps/testing/scripts/seed.ts` → `seedClubDashboard`), que crea, para el
 *   club_admin de testing (`TEST_USERS.clubAdmin`), tres slots los sábados:
 *     · 10:00 → `available`, priceArs=24000  (precio debe verse, no solapar)
 *     · 11:00 → `match`,     priceArs=30000  (precio NO debe renderizarse)
 *     · 12:00 → `blocked`,   priceArs=26000  (precio debe verse)
 * - Por qué selectores crudos (`.slot-price`, `.cal-court-label`,
 *   `.cal-cell--match-open`): el bug VIVE en esas clases concretas (posición
 *   absoluta dentro de la celda) y el contrato del fix se expresa
 *   exactamente sobre ellas. Un Page Object dedicado a 2-3 aserciones de
 *   layout sería over-engineering. La regla #2 del e2e-testing rulebook
 *   (POs dueños de selectores) no aplica acá porque no hay un PO existente
 *   para SlotManager / SlotCalendarView, y el spec entero son 3 casos cortos
 *   sobre clases CSS que son las que el fix protege.
 * - Por qué buscamos cell-por-cell en vez de hardcodear `getByRole('button',
 *   { name: /saturday 10:00/i })`: si el día actual ya pasó el sábado, la
 *   primera semana renderizada por SlotCalendarView usa el lunes-de-hoy como
 *   inicio y el sábado de la semana corriente puede ser un "past day"
 *   (que la lógica de `renderCell` pinta con clase `cal-cell--past-day-*`
 *   y NO renderiza el contenido normal con `.slot-price` / `.cal-court-label`).
 *   Iterar las celdas visibles del calendario es robusto frente a esa
 *   variación: si la seed no produjo una celda elegible en la semana actual,
 *   skipeamos con un mensaje claro en vez de fallar falsamente.
 *
 * - Bug previo que este test protege contra regresiones:
 *     `.slot-price` (bottom:2px;left:4px) y `.cal-court-label`
 *     (bottom:4px;left:5px) compartían la esquina inferior-izquierda de la
 *     celda, así que el precio (ej. "$26000") se solapaba con el nombre de
 *     la cancha (ej. "Cancha Dashboard 1"). El fix mueve `.slot-price` a la
 *     esquina superior-izquierda (top:3px;left:4px) con la tipografía/color
 *     verde de `AvailableSlotsPicker .pk-price`, y oculta el precio cuando
 *     `status === 'match'` (mismo criterio que el picker de "Crear Partido").
 *     Cualquier regresión que vuelva a poner el precio en la mitad inferior
 *     de la celda, o que lo muestre en slots ocupados, hará fallar este spec.
 */

test.use({ storageState: TEST_USERS.clubAdmin.storageStatePath });

const HORARIOS_URL = `${FRONTEND_URL}/panel-club/horarios`;

/**
 * Espera a que los islands `client="load"` terminen de hidratar.
 * SlotManager hidrata con `client:load`, así que cuando este marker se
 * estampa en el `<astro-island>` ya tenemos el calendario interactivo.
 * (Patrón reutilizado de ClubDashboardPage.waitForIslandsHydrated.)
 */
async function waitForIslandsHydrated(page: import('@playwright/test').Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const islands = Array.from(document.querySelectorAll('astro-island[client="load"]'));
      if (islands.length === 0) return true;
      return islands.every((island) => island.hasAttribute('client-render-time'));
    },
    { timeout: 10_000 },
  );
}

type Box = { x: number; y: number; width: number; height: number };

function isOverlap(a: Box, b: Box): boolean {
  // Dos cajas axis-aligned NO se solapan si una está completamente a un lado
  // de la otra en cualquier eje. Negamos para detectar solapamiento real.
  const aRight = a.x + a.width;
  const aBottom = a.y + a.height;
  const bRight = b.x + b.width;
  const bBottom = b.y + b.height;
  return !(aRight <= b.x || bRight <= a.x || aBottom <= b.y || bBottom <= a.y);
}

test.describe('Calendario /panel-club/horarios — fix visual overlap precio/cancha', () => {
  test('precio y nombre de cancha no se solapan en celdas con ambos visibles', async ({ page }) => {
    await page.goto(HORARIOS_URL);
    await waitForIslandsHydrated(page);
    await expect(page.getByRole('heading', { name: /^horarios$/i })).toBeVisible();

    // Aseguramos vista calendario (default, pero hacemos el click idempotente
    // por si una corrida anterior dejó "Lista" activo via state cacheado).
    const calendarBtn = page.getByRole('button', { name: /vista calendario|calendario/i }).first();
    if (await calendarBtn.isVisible().catch(() => false)) {
      await calendarBtn.click().catch(() => {});
    }

    // Limitamos la búsqueda al cuerpo del calendario (no afecta el header).
    const calendarBody = page.locator('.cal-wrap .cal-body');
    await expect(calendarBody).toBeVisible();

    const cells = calendarBody.locator('.cal-cell');
    const totalCells = await cells.count();
    expect.soft(totalCells, 'el grid del calendario debería tener celdas renderizadas').toBeGreaterThan(0);

    // Buscamos la primera celda que tenga AMBOS `.slot-price` y
    // `.cal-court-label` visibles. La seed garantiza un slot disponible los
    // sábados a las 10:00 con priceArs=24000 (que post-fix renderiza precio
    // porque status !== 'match'). Si por past-day esa celda no es elegible
    // en la semana actual, también sirve el slot bloqueado de las 12:00
    // sábado (priceArs=26000), que también renderiza precio.
    let matchedCellHandle: import('@playwright/test').ElementHandle<Element> | null = null;
    let priceBox: Box | null = null;
    let labelBox: Box | null = null;
    let cellBox: Box | null = null;

    for (let i = 0; i < totalCells; i += 1) {
      const cell = cells.nth(i);
      const price = cell.locator('.slot-price');
      const label = cell.locator('.cal-court-label');
      const priceCount = await price.count();
      const labelCount = await label.count();
      if (priceCount === 0 || labelCount === 0) continue;

      const pBox = await price.boundingBox();
      const lBox = await label.boundingBox();
      const cBox = await cell.boundingBox();
      if (!pBox || !lBox || !cBox) continue;

      matchedCellHandle = await cell.elementHandle();
      priceBox = pBox;
      labelBox = lBox;
      cellBox = cBox;
      break;
    }

    test.skip(
      matchedCellHandle === null,
      'No se encontró ninguna celda con `.slot-price` + `.cal-court-label` visibles en la semana actual. ' +
        'La seed (`seedClubDashboard`) crea slots los sábados, pero si la semana corriente ya pasó el sábado ' +
        'no son elegibles (past-day). Reportar al director para decidir si conviene un fixture adicional.',
    );

    // Garantizado por el `test.skip` de arriba — los `!` son para el typechecker.
    const p = priceBox!;
    const l = labelBox!;
    const c = cellBox!;

    expect(isOverlap(p, l), `slot-price (${JSON.stringify(p)}) y cal-court-label (${JSON.stringify(l)}) se solapan dentro de la celda (${JSON.stringify(c)})`).toBe(false);

    // Aserto adicional barato: el precio queda en la mitad superior de la
    // celda. Captura la intención del fix (top-left, no bottom-left) sin
    // acoplarse a pixeles exactos.
    const cellMidY = c.y + c.height / 2;
    expect(
      p.y,
      `slot-price.top (${p.y}) debe estar por encima del centro vertical de la celda (${cellMidY})`,
    ).toBeLessThan(cellMidY);
  });

  test('en celdas con status `match` el precio no se renderiza', async ({ page }) => {
    await page.goto(HORARIOS_URL);
    await waitForIslandsHydrated(page);
    await expect(page.getByRole('heading', { name: /^horarios$/i })).toBeVisible();

    const calendarBody = page.locator('.cal-wrap .cal-body');
    await expect(calendarBody).toBeVisible();

    // `.cal-cell--match-open` lo aplica SlotCalendarView.renderCell cuando
    // `getSlotStatus(primary) === 'match'`. La seed crea el partido sábado
    // 11:00 con status='open', lo que dispara `hasScheduledMatch=true` para
    // ese slot vía la query GraphQL de horarios.
    const matchCells = calendarBody.locator('.cal-cell.cal-cell--match-open');
    const matchCellCount = await matchCells.count();

    test.skip(
      matchCellCount === 0,
      'No se encontró ninguna celda con `cal-cell--match-open` en la semana actual. ' +
        'La seed crea un match el sábado 11:00, pero si la semana corriente ya pasó el sábado ' +
        'la celda se renderiza con `cal-cell--past-day-busy` y el caso no es ejercitable. ' +
        'Reportar al director para decidir si conviene un fixture adicional.',
    );

    // Verificamos en TODAS las celdas con match: ninguna debe tener
    // `.slot-price`. Si la seed crea 1, validamos 1; si por evolución de
    // la seed hay más, validamos todas — el fix aplica al render condicional
    // `primary.priceArs != null && status !== 'match'`.
    for (let i = 0; i < matchCellCount; i += 1) {
      const cell = matchCells.nth(i);
      const price = cell.locator('.slot-price');
      const priceCount = await price.count();
      expect(priceCount, `celda match #${i} no debe renderizar .slot-price (esconde el precio en slots ocupados)`).toBe(0);
    }
  });
});
