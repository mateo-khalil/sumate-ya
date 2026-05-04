import { test, expect, type Page, type Route } from '@playwright/test';

/**
 * Tests E2E del listado de partidos (/partidos).
 *
 * Decision Context:
 * - Por qué mockeamos el endpoint GraphQL con `page.route()`: el ambiente de dev puede
 *   no tener datos seed en la DB de Supabase. Interceptando la respuesta del endpoint
 *   GraphQL dejamos los tests deterministas y los desacoplamos del estado del backend.
 * - El login NO va por GraphQL sino por POST a /login (SSR que golpea la REST del backend),
 *   así que el route de `**\/graphql` no interfiere con la autenticación.
 * - Usamos cookies HttpOnly (set por el flujo SSR de login) — Playwright las persiste entre
 *   navegaciones del mismo `page`, por lo que una vez logueados podemos ir directo a /partidos.
 * - Por qué usamos el glob `**\/graphql` en lugar de la URL absoluta: el endpoint puede
 *   cambiar de `http://localhost:4000/...` a `http://127.0.0.1:...` (o a un proxy del dev
 *   server) y el matching literal por URL falla silenciosamente. El glob por path cubre
 *   cualquier host/puerto.
 * - Scope `main` en selectors: el Astro dev toolbar inyecta controles (incluyendo un
 *   `<select>`) dentro del body que contaminan conteos globales. Restringir a `main`
 *   garantiza que sólo contemos elementos de la página real.
 * - Assumptions:
 *   * El usuario `mateoduran2010@gmail.com` tiene role != 'club_admin' → redirect a /partidos.
 *   * El backend corre en :4000 y el frontend en :4321 (pnpm dev levantado a mano).
 * - Previously fixed bugs:
 *   * Mock no interceptaba: el suite ahora responde todo request a `/api/graphql`
 *     porque estas pruebas sólo validan el listado y el login no usa GraphQL.
 *   * Mock URL literal `http://localhost:4000/graphql` era frágil por diferencias de
 *     host/puerto. Se cambió al proxy del frontend con glob `**\/api/graphql**`.
 *   * `page.locator('select')` contaba 4 elementos por el Astro dev toolbar. Se restringe
 *     a `main select`.
 *   * Interacciones con el filtro "Limpiar" fallaban porque React no había hidratado
 *     todavía. Se espera a que la lista termine el loading antes de escribir en la búsqueda.
 */

const FRONTEND_URL = 'http://localhost:4321';
// Glob path-only: catches the frontend GraphQL proxy, including urql querystrings.
const GRAPHQL_ROUTE = '**/api/graphql**';

const TEST_USER = {
  email: 'mateoduran2010@gmail.com',
  password: 'Hola1234',
};

type MockMatch = {
  __typename?: string;
  id: string;
  title: string;
  startTime: string;
  format: 'FIVE_VS_FIVE' | 'SEVEN_VS_SEVEN' | 'TEN_VS_TEN' | 'ELEVEN_VS_ELEVEN';
  totalSlots: number;
  availableSlots: number;
  status: 'OPEN' | 'FULL' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  club: { __typename?: string; name: string; zone: string | null } | null;
};

function buildMatch(overrides: Partial<MockMatch> = {}): MockMatch {
  return {
    __typename: 'Match',
    id: 'match-default',
    title: 'Partido de prueba',
    startTime: '2026-05-01T20:00:00Z',
    format: 'FIVE_VS_FIVE',
    totalSlots: 10,
    availableSlots: 5,
    status: 'OPEN',
    club: { __typename: 'Club', name: 'Club Test', zone: 'Norte' },
    ...overrides,
  };
}

/**
 * Intercepta el endpoint GraphQL del frontend y responde con la lista provista.
 */
async function mockMatchesQuery(page: Page, matches: MockMatch[]): Promise<void> {
  await page.unroute(GRAPHQL_ROUTE).catch(() => undefined);
  await page.route(GRAPHQL_ROUTE, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { matches } }),
    });
  });
}

/** Mockea un error de servidor para el listado. */
async function mockMatchesError(page: Page, message = 'Backend caído'): Promise<void> {
  await page.unroute(GRAPHQL_ROUTE).catch(() => undefined);
  await page.route(GRAPHQL_ROUTE, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ errors: [{ message }] }),
    });
  });
}

/**
 * Helper de login — completa el form y espera a que el SSR redirija fuera de /login.
 * Replica el flujo validado por login.spec.ts.
 */
async function login(page: Page): Promise<void> {
  await page.goto(`${FRONTEND_URL}/login`);
  await page.getByRole('textbox', { name: 'Email' }).fill(TEST_USER.email);
  await page.getByRole('textbox', { name: 'Contraseña' }).fill(TEST_USER.password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 10_000 });
}

async function gotoMatchesPage(page: Page): Promise<void> {
  await page.goto(`${FRONTEND_URL}/partidos`);
  await page.locator('.matches-section').scrollIntoViewIfNeeded();
}

test.describe('Listado de partidos (/partidos)', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    // Mock por defecto: lista vacía. Los tests que necesiten data la re-mockean antes de navegar.
    await mockMatchesQuery(page, []);
    await login(page);
  });

  test('renderiza el header y sale del estado de loading', async ({ page }) => {
    await gotoMatchesPage(page);

    await expect(page.getByRole('heading', { name: /Partidos Disponibles/i })).toBeVisible();
    // Con la lista mockeada vacía, debe aparecer el empty-state (no quedarse en skeleton).
    await expect(page.getByText('No hay partidos disponibles')).toBeVisible();
  });

  test('muestra los controles de filtros principales', async ({ page }) => {
    await gotoMatchesPage(page);

    await expect(page.getByPlaceholder(/Buscar partido o club/i)).toBeVisible();
    // 3 selects (formato, zona, horario) + 2 date pickers (desde, hasta) + boton "Limpiar".
    // Scope a `main` para ignorar el Astro dev toolbar (que puede inyectar un <select>).
    await expect(page.locator('main select')).toHaveCount(3);
    await expect(page.locator('main input[type="date"]')).toHaveCount(2);
    await expect(page.getByRole('button', { name: /Limpiar/i })).toBeVisible();
  });

  test('los date pickers de rango de fecha estan visibles por defecto', async ({ page }) => {
    await gotoMatchesPage(page);

    // Esperar a que MatchList termine el fetch y hidrate antes de validar inputs —
    // de lo contrario los handlers todavia no estan enganchados.
    // Decision Context: el filtro avanzado dejo de estar oculto detras de "Mas filtros";
    // ahora los date pickers se renderizan junto al boton "Limpiar" en una segunda fila.
    await expect(page.getByText('No hay partidos disponibles')).toBeVisible();

    const dateInputs = page.locator('main input[type="date"]');
    await expect(dateInputs).toHaveCount(2);
    await expect(dateInputs.first()).toBeVisible();
    await expect(dateInputs.nth(1)).toBeVisible();
  });

  test('al aplicar un filtro aparece "Limpiar" y al clickearlo se resetea la búsqueda', async ({ page }) => {
    await gotoMatchesPage(page);

    // Esperamos a que el empty-state (lista vacía mockeada) se renderice — garantiza
    // que MatchList hidrató y los handlers onChange ya están enganchados. Sin esto,
    // el fill() dispara antes de la hidratación y React no actualiza el estado.
    await expect(page.getByText('No hay partidos disponibles')).toBeVisible();

    const search = page.getByPlaceholder(/Buscar partido o club/i);
    await search.fill('river');

    const clearBtn = page.getByRole('button', { name: /Limpiar/i });
    await expect(clearBtn).toBeVisible();
    await expect(clearBtn).toBeEnabled();

    await clearBtn.click();
    await expect(search).toHaveValue('');
    // El boton "Limpiar" siempre esta renderizado (vive junto a los filtros), pero
    // se deshabilita cuando no hay filtros activos. Antes asertabamos `not.toBeVisible()`
    // asumiendo que desaparecia, pero el componente nunca tuvo ese comportamiento.
    await expect(clearBtn).toBeDisabled();
  });

  test('renderiza cards cuando la query devuelve partidos', async ({ page }) => {
    await mockMatchesQuery(page, [
      buildMatch({ id: '1', title: 'Pickup F5 en Palermo', format: 'FIVE_VS_FIVE' }),
      buildMatch({
        id: '2',
        title: 'F7 nocturno en Núñez',
        format: 'SEVEN_VS_SEVEN',
        club: { name: 'Club Núñez', zone: 'Norte' },
      }),
    ]);

    await gotoMatchesPage(page);

    await expect(page.getByText('Pickup F5 en Palermo')).toBeVisible();
    await expect(page.getByText('F7 nocturno en Núñez')).toBeVisible();
    await expect(page.getByText('5v5')).toBeVisible();
    await expect(page.getByText('7v7')).toBeVisible();
    await expect(page.getByText('Club Núñez')).toBeVisible();
    // Hay al menos un botón "Sumarme" habilitado
    await expect(page.getByRole('button', { name: /Sumarme/i }).first()).toBeEnabled();
  });

  test('partido lleno muestra badge "Completo" y CTA "Ver detalle" que navega al detalle', async ({ page }) => {
    // Decision Context: para partidos llenos el card debe seguir siendo accionable.
    // El badge "Completo" comunica el estado y el CTA inferior pasa a "Ver detalle"
    // (en vez de un botón "Completo" deshabilitado e inservible) para que el usuario
    // pueda clickear y ver quiénes están anotados antes de decidir si esperar un cupo.
    // Previously fixed bugs: el CTA anterior era un botón disabled "Completo" — los
    // usuarios no tenían forma de abrir el detalle de un partido 10/10 desde el listado.
    // Decision Context: el id DEBE ser un UUID válido. El SSR de /partidos/[id]
    // valida el formato con UUID_REGEX (ver matchResolver.match) y redirige a
    // /partidos cuando el id no matchea — eso hacía que este test fallara con
    // "Expected /partidos/full-1, Received /partidos".
    // Previously fixed bugs: el id era 'full-1' (no UUID) → el detalle redirigía
    // al listado y la assertion de URL fallaba. Cambiado a un UUID memorable.
    const FULL_MATCH_ID = '00000000-0000-0000-0000-00000000fff1';
    await mockMatchesQuery(page, [
      buildMatch({
        id: FULL_MATCH_ID,
        title: 'Partido lleno',
        totalSlots: 10,
        availableSlots: 0,
      }),
    ]);

    await gotoMatchesPage(page);

    // El status sigue comunicándose mediante el badge en el header del card
    await expect(page.getByText('Completo').first()).toBeVisible();
    await expect(page.getByText('10/10 jugadores')).toBeVisible();

    // Decision Context: usamos `name: 'Ver detalle', exact: true` (no regex /Ver detalle/i)
    // porque la card tiene aria-label="Ver detalle del partido Partido lleno" y matchearia
    // tambien al contenedor role="button" de la propia card, generando strict-mode
    // violations. El boton CTA es el unico elemento con accesible name exactamente
    // "Ver detalle", asi que el matcher exact deja la query sin ambiguedad.
    // Previously fixed bugs: el test fallaba por strict-mode violation entre el boton
    // y la card cuyo aria-label arranca con "Ver detalle del partido ...".
    const detailBtn = page.getByRole('button', { name: 'Ver detalle', exact: true });
    await expect(detailBtn).toBeVisible();
    await expect(detailBtn).toBeEnabled();

    // Click en el CTA navega al detalle
    await detailBtn.click();
    await expect(page).toHaveURL(new RegExp(`/partidos/${FULL_MATCH_ID}$`));
  });

  test('partido lleno: clickear el card también navega al detalle', async ({ page }) => {
    // UUID válido — el SSR del detalle valida el formato y redirige al listado
    // si el id no es un UUID. Ver decision context del test anterior.
    const FULL_MATCH_ID = '00000000-0000-0000-0000-00000000fff2';
    await mockMatchesQuery(page, [
      buildMatch({
        id: FULL_MATCH_ID,
        title: 'Otro partido lleno',
        totalSlots: 10,
        availableSlots: 0,
      }),
    ]);

    await gotoMatchesPage(page);

    // Clickear el título (parte de la card, fuera del botón) navega al detalle
    await page.getByText('Otro partido lleno').click();
    await expect(page).toHaveURL(new RegExp(`/partidos/${FULL_MATCH_ID}$`));
  });

  test('empty-state muestra mensaje amigable cuando no hay partidos', async ({ page }) => {
    await gotoMatchesPage(page);

    await expect(page.getByText('No hay partidos disponibles')).toBeVisible();
    // El subtítulo varía según haya filtros activos o no:
    // - sin filtros: "No hay partidos abiertos por el momento. Volvé más tarde."
    // - con filtros: "Ningún partido coincide con los filtros. Probá ajustando la búsqueda."
    // El test no aplica filtros → matcheamos el copy del caso sin filtros, pero dejamos
    // el regex flexible por si en el futuro se unifica el wording.
    // Previously fixed bugs: el copy original "Probá con otros filtros" fue reemplazado
    // por dos variantes contextuales — el test fallaba con el wording viejo.
    await expect(
      page.getByText(/Volvé más tarde|ajustando la búsqueda|otros filtros/i),
    ).toBeVisible();
  });

  test('muestra mensaje de error cuando la query falla', async ({ page }) => {
    await mockMatchesError(page, 'Server on fire');

    await gotoMatchesPage(page);

    await expect(page.getByText('Error').first()).toBeVisible();
    await expect(page.getByText('Server on fire')).toBeVisible();
  });
});
