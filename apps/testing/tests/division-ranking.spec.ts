import type { APIRequestContext, Browser, BrowserContext, Page } from '@playwright/test';
import {
  computeExpectedDivision,
  DIVISION_CSS_CLASS,
  DIVISION_NAME,
  DIVISION_THRESHOLDS,
  expect,
  FRONTEND_URL,
  gqlPostOrThrow,
  MatchDetailPage,
  readAccessToken,
  SEED_MATCHES,
  test,
  TEST_USERS,
} from './support';

/**
 * División y ranking — US #41 (PR #124)
 *
 * Decision Context:
 * - El sistema de divisiones asigna Bronce (1), Plata (2), Oro (3) o Diamante
 *   (4) a cada jugador según winrate y cantidad mínima de partidos confirmados.
 * - DivisionBadge.astro renderiza el badge con clases CSS y un atributo `title`
 *   que permiten verificar tanto presencia como nivel sin acoplarse al texto
 *   visible, que podría cambiar si se rediseña el badge.
 * - /perfil y /perfil/[id] son SSR: el fetch de `myProfile` / `profile(id)`
 *   ocurre en el servidor de Astro y no puede ser interceptado con page.route.
 *   Por eso los tests de perfil se apoyan en el backend real y no en mocks.
 * - /partidos/[id] también es SSR con islands client:load. Los player-cards
 *   del listado de participantes son estáticos (sin client:*), así que el badge
 *   queda en el HTML inicial y no requiere esperar hidratación.
 * - Los tests de privacidad (showDivision) usan updatePrivacy para variar el
 *   estado y afterEach lo restaura, igual que en privacy-settings.spec.ts, para
 *   no contaminar el estado de otros specs.
 * - Previously fixed bugs: none relevant.
 */

// ---------------------------------------------------------------------------
// Shared GraphQL helpers
// ---------------------------------------------------------------------------

type ProfileStats = {
  id: string;
  displayName: string;
  division: number;
  matchesPlayed: number;
  matchesWon: number;
};

type PrivacySettings = {
  isPublic: boolean;
  showStats: boolean;
  showHistory: boolean;
  showPosition: boolean;
  showDivision: boolean;
};

type PublicProfile = {
  id: string;
  division: number | null;
};

async function fetchMyProfile(
  request: APIRequestContext,
  accessToken: string,
): Promise<ProfileStats> {
  const data = await gqlPostOrThrow<{ myProfile: ProfileStats }>(
    request,
    /* GraphQL */ `
      query DivisionRankingMyProfile {
        myProfile {
          id
          displayName
          division
          matchesPlayed
          matchesWon
        }
      }
    `,
    undefined,
    accessToken,
  );
  return data.myProfile;
}

async function fetchPublicProfile(
  request: APIRequestContext,
  profileId: string,
  viewerToken: string,
): Promise<PublicProfile | null> {
  const data = await gqlPostOrThrow<{ profile: PublicProfile | null }>(
    request,
    /* GraphQL */ `
      query DivisionRankingPublicProfile($id: ID!) {
        profile(id: $id) {
          id
          division
        }
      }
    `,
    { id: profileId },
    viewerToken,
  );
  return data.profile;
}

async function updatePrivacy(
  request: APIRequestContext,
  accessToken: string,
  input: Partial<PrivacySettings>,
): Promise<void> {
  await gqlPostOrThrow<{ updatePrivacy: PrivacySettings }>(
    request,
    /* GraphQL */ `
      mutation DivisionRankingUpdatePrivacy($input: UpdatePrivacyInput!) {
        updatePrivacy(input: $input) {
          isPublic showStats showHistory showPosition showDivision
        }
      }
    `,
    { input },
    accessToken,
  );
}

const PUBLIC_ALL: PrivacySettings = {
  isPublic: true,
  showStats: true,
  showHistory: true,
  showPosition: true,
  showDivision: true,
};

// Todos los tests que usan browser necesitan playerMateo autenticado.
// Los tests de privacidad crean contextos adicionales via openAsRicardo().
// Los tests sin browser (umbrales puros) ignoran el storageState.
test.use({ storageState: TEST_USERS.playerMateo.storageStatePath });

/** Abre /perfil/{path} como playerRicardo en un contexto fresco. */
async function openAsRicardo(
  browser: Browser,
  path: string,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    storageState: TEST_USERS.playerRicardo.storageStatePath,
  });
  const page = await context.newPage();
  await page.goto(`${FRONTEND_URL}${path}`);
  return { context, page };
}

// ===========================================================================
// Grupo 1: Badge en perfil propio (/perfil)
// ===========================================================================

test.describe('Badge de división en perfil propio (/perfil)', () => {
  test.describe.configure({ mode: 'serial' });

  let ownerToken = '';
  let profile: ProfileStats;

  test.beforeEach(async ({ page, request }) => {
    ownerToken = await readAccessToken(page);
    profile = await fetchMyProfile(request, ownerToken);
  });

  test('jugador autenticado ve badge de división en su perfil', async ({
    profilePage,
  }) => {
    await profilePage.goto();
    await expect(
      profilePage.divisionBadge,
      'El badge de división debe ser visible en el perfil propio',
    ).toBeVisible();
  });

  test('badge tiene la clase CSS de color correspondiente al nivel de división', async ({
    profilePage,
  }) => {
    await profilePage.goto();

    const expectedClass =
      DIVISION_CSS_CLASS[profile.division as 1 | 2 | 3 | 4] ??
      DIVISION_CSS_CLASS[1];

    await expect(
      profilePage.divisionBadge,
      `Badge debe tener clase '${expectedClass}' para nivel ${profile.division}`,
    ).toHaveClass(new RegExp(expectedClass));
  });

  test('badge tiene atributo title con el nombre español de la división', async ({
    profilePage,
  }) => {
    await profilePage.goto();

    const expectedName =
      DIVISION_NAME[profile.division as 1 | 2 | 3 | 4] ?? DIVISION_NAME[1];

    await expect(
      profilePage.divisionBadge,
      `Badge debe tener title="División ${expectedName}"`,
    ).toHaveAttribute('title', `División ${expectedName}`);
  });

  test('indicador de nivel (D1–D4) dentro del badge coincide con la división del perfil', async ({
    profilePage,
  }) => {
    await profilePage.goto();

    const mark = profilePage.divisionBadge.locator('.division-mark');
    await expect(
      mark,
      `El marcador de nivel debe mostrar 'D${profile.division}'`,
    ).toContainText(`D${profile.division}`);
  });
});

// ===========================================================================
// Grupo 2: Consistencia de la lógica de cálculo con los umbrales
// ===========================================================================

test.describe('Consistencia de división con umbrales de cálculo', () => {
  test('la división devuelta por la API es consistente con matchesPlayed y matchesWon', async ({
    page,
    request,
  }) => {
    const token = await readAccessToken(page);
    const p = await fetchMyProfile(request, token);

    const expected = computeExpectedDivision(p.matchesPlayed, p.matchesWon);

    expect(
      p.division,
      `Con ${p.matchesPlayed} partidos y ${p.matchesWon} victorias ` +
        `la división esperada es ${expected} pero la API devolvió ${p.division}`,
    ).toBe(expected);
  });

  test('player con menos de 5 partidos confirmados tiene división Bronce (nivel 1)', async ({
    page,
    request,
  }) => {
    const token = await readAccessToken(page);
    const p = await fetchMyProfile(request, token);

    if (p.matchesPlayed >= DIVISION_THRESHOLDS.minMatches) {
      // playerMateo tiene suficientes partidos — el caso < 5 no aplica aquí.
      // Ver README: usar una cuenta sin historial para cubrir este escenario.
      test.skip(
        true,
        `playerMateo tiene ${p.matchesPlayed} partidos (≥ ${DIVISION_THRESHOLDS.minMatches}). ` +
          'Usar una cuenta sin historial para cubrir este caso exacto.',
      );
      return;
    }

    expect(
      p.division,
      `Con ${p.matchesPlayed} partidos (< ${DIVISION_THRESHOLDS.minMatches} mínimo) ` +
        'la división debe ser Bronce (1)',
    ).toBe(1);
  });

  test('los umbrales de winrate para Plata, Oro y Diamante son correctos según la migración', async () => {
    // Verificación de constantes en TS (sin red): comprueba que DIVISION_THRESHOLDS
    // refleja los valores del SQL en 20260518000000_profile_division_recalculation.sql.
    expect(computeExpectedDivision(5, 0)).toBe(1);  // 0% → Bronce
    expect(computeExpectedDivision(5, 2)).toBe(1);  // 40% < 45% → Bronce
    expect(computeExpectedDivision(20, 9)).toBe(2); // 45% → Plata (límite exacto)
    expect(computeExpectedDivision(5, 3)).toBe(3);  // 60% → Oro (límite exacto gold)
    expect(computeExpectedDivision(10, 7)).toBe(3); // 70% → Oro
    expect(computeExpectedDivision(10, 8)).toBe(4); // 80% → Diamante
    expect(computeExpectedDivision(4, 4)).toBe(1);  // < 5 partidos → Bronce siempre
  });
});

// ===========================================================================
// Grupo 3: Badge en listado de participantes (/partidos/[id])
// ===========================================================================

test.describe('Badge de división en player-cards del partido', () => {
  test('badges de división aparecen en las player-cards del partido de seed', async ({
    matchDetailPage,
  }) => {
    await matchDetailPage.goto(SEED_MATCHES.full);

    // Verificar que existe al menos un player-card con badge de división.
    const badges = matchDetailPage.allPlayerDivisionBadges;
    await expect(
      badges.first(),
      'Debe haber al menos un badge de división en las player-cards del partido',
    ).toBeVisible();
  });

  test('el badge dentro de player-card está en modo compacto (division-badge--compact)', async ({
    matchDetailPage,
  }) => {
    await matchDetailPage.goto(SEED_MATCHES.full);

    const badges = matchDetailPage.allPlayerDivisionBadges;
    const count = await badges.count();
    expect(count, 'Debe haber al menos un badge de división').toBeGreaterThan(0);

    // Todos los badges en player-cards deben usar compact mode.
    for (let i = 0; i < Math.min(count, 5); i++) {
      await expect(
        badges.nth(i),
        `Badge #${i} en player-card debe tener clase division-badge--compact`,
      ).toHaveClass(/division-badge--compact/);
    }
  });

  test('badge de playerMateo en el partido muestra su nivel de división correcto', async ({
    page,
    request,
    matchDetailPage,
  }) => {
    const token = await readAccessToken(page);
    const profile = await fetchMyProfile(request, token);

    await matchDetailPage.goto(SEED_MATCHES.full);

    const badge = matchDetailPage.playerDivisionBadge(profile.displayName);
    await expect(
      badge,
      `El badge de división de ${profile.displayName} debe ser visible en el partido`,
    ).toBeVisible();

    const expectedClass =
      DIVISION_CSS_CLASS[profile.division as 1 | 2 | 3 | 4] ??
      DIVISION_CSS_CLASS[1];

    await expect(
      badge,
      `Badge de ${profile.displayName} debe tener clase '${expectedClass}'`,
    ).toHaveClass(new RegExp(expectedClass));
  });
});

// ===========================================================================
// Grupo 4: Privacidad — showDivision (integración con US #53)
// ===========================================================================

test.describe('Privacidad de división (interacción con US #53)', () => {
  test.describe.configure({ mode: 'serial' });

  let ownerToken = '';
  let ownerId = '';

  test.beforeEach(async ({ page, request }) => {
    ownerToken = await readAccessToken(page);
    const p = await fetchMyProfile(request, ownerToken);
    ownerId = p.id;
    await updatePrivacy(request, ownerToken, PUBLIC_ALL);
  });

  test.afterEach(async ({ request }) => {
    if (!ownerToken) return;
    await updatePrivacy(request, ownerToken, PUBLIC_ALL).catch(() => undefined);
    ownerToken = '';
    ownerId = '';
  });

  test('owner siempre ve su propia división aunque showDivision=false en sus ajustes', async ({
    page,
    request,
    profilePage,
  }) => {
    await updatePrivacy(request, ownerToken, { showDivision: false });

    // La API myProfile devuelve la división real al owner, sin importar el toggle.
    const p = await fetchMyProfile(request, ownerToken);
    expect(p.division, 'myProfile debe devolver la división al owner aunque showDivision=false').toBeGreaterThanOrEqual(1);

    // La UI propia también muestra el badge.
    await profilePage.goto();
    await expect(
      profilePage.divisionBadge,
      'El owner siempre debe ver su badge de división en /perfil',
    ).toBeVisible();
  });

  test('API retorna division=null para visitante cuando showDivision=false', async ({
    request,
    browser,
  }) => {
    await updatePrivacy(request, ownerToken, { showDivision: false });

    const { context, page: viewerPage } = await openAsRicardo(
      browser,
      `/perfil/${ownerId}`,
    );
    try {
      // Leer el token del viewer desde sus cookies y reusar el `request`
      // del test principal con dicho bearer (patrón de privacy-settings.spec.ts).
      const viewerToken = await readAccessToken(viewerPage);
      const publicProfile = await fetchPublicProfile(request, ownerId, viewerToken);

      expect(
        publicProfile?.division,
        'Con showDivision=false, la API debe retornar division=null para un visitante',
      ).toBeNull();
    } finally {
      await context.close();
    }
  });

  test('API retorna la división real cuando showDivision=true en perfil público', async ({
    request,
    browser,
  }) => {
    await updatePrivacy(request, ownerToken, { showDivision: true, isPublic: true });

    const ownerProfile = await fetchMyProfile(request, ownerToken);

    const { context, page: viewerPage } = await openAsRicardo(
      browser,
      `/perfil/${ownerId}`,
    );
    try {
      const viewerToken = await readAccessToken(viewerPage);
      const publicProfile = await fetchPublicProfile(request, ownerId, viewerToken);

      expect(
        publicProfile?.division,
        'Con showDivision=true, la API debe retornar la división real para visitantes',
      ).toBe(ownerProfile.division);
    } finally {
      await context.close();
    }
  });

  test('badge no aparece en el perfil de otro jugador cuando isPublic=false', async ({
    request,
    browser,
  }) => {
    await updatePrivacy(request, ownerToken, { isPublic: false });

    const { context, page: viewerPage } = await openAsRicardo(
      browser,
      `/perfil/${ownerId}`,
    );
    try {
      // El perfil privado muestra sólo nombre/avatar sin badge de división.
      const card = viewerPage.locator('.profile-card').first();
      await expect(card, 'La card de perfil privado debe existir').toBeVisible();
      await expect(
        card.locator('.division-badge'),
        'Un perfil privado no debe mostrar badge de división a visitantes',
      ).toHaveCount(0);
    } finally {
      await context.close();
    }
  });
});

// ===========================================================================
// Grupo 5: Responsive
// ===========================================================================

test.describe('Responsive — badge en distintos viewports', () => {
  test('badge es legible en viewport mobile 375px sin overflow horizontal', async ({
    page,
    profilePage,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await profilePage.goto();

    await expect(profilePage.divisionBadge).toBeVisible();

    const badgeBox = await profilePage.divisionBadge.boundingBox();
    expect(badgeBox, 'El badge debe tener dimensiones medibles').not.toBeNull();

    // El badge no puede sobresalir del card (max-width 360px en ProfileCard.astro).
    if (badgeBox) {
      expect(
        badgeBox.x,
        'El badge no debe comenzar fuera del viewport izquierdo',
      ).toBeGreaterThanOrEqual(0);
      expect(
        badgeBox.x + badgeBox.width,
        'El badge no debe desbordar el viewport de 375px',
      ).toBeLessThanOrEqual(375);
    }
  });

  test('badge visible y sin deformación en viewport tablet 768px', async ({
    page,
    profilePage,
  }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await profilePage.goto();

    await expect(profilePage.divisionBadge).toBeVisible();

    const badgeBox = await profilePage.divisionBadge.boundingBox();
    expect(badgeBox).not.toBeNull();

    if (badgeBox) {
      // El badge debe tener altura mínima razonable (al menos 16px).
      expect(
        badgeBox.height,
        'El badge debe tener altura >= 16px en tablet',
      ).toBeGreaterThanOrEqual(16);
    }
  });

  test('badge visible y proporcional en desktop 1280px', async ({
    page,
    profilePage,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await profilePage.goto();

    await expect(profilePage.divisionBadge).toBeVisible();

    const badgeBox = await profilePage.divisionBadge.boundingBox();
    expect(badgeBox).not.toBeNull();

    if (badgeBox) {
      // En desktop el card tiene max-width 360px y el badge cabe holgado.
      expect(
        badgeBox.width,
        'El badge no debe ser más ancho que el card (360px)',
      ).toBeLessThanOrEqual(360);
    }
  });

  test('badge en player-card del partido es accesible en mobile 375px', async ({
    page,
    matchDetailPage,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await matchDetailPage.goto(SEED_MATCHES.full);

    const firstBadge = matchDetailPage.allPlayerDivisionBadges.first();
    await expect(
      firstBadge,
      'Badge en player-card debe ser visible en mobile',
    ).toBeVisible();

    const box = await firstBadge.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      expect(
        box.x + box.width,
        'Badge en player-card no debe desbordar el viewport de 375px',
      ).toBeLessThanOrEqual(375);
    }
  });
});

// ===========================================================================
// Grupo 6: Mapeo visual de niveles — constantes y helper expectDivisionBadge
// ===========================================================================

test.describe('Mapeo visual de niveles de división', () => {
  test('DIVISION_CSS_CLASS mapea correctamente los 4 niveles definidos', () => {
    expect(DIVISION_CSS_CLASS[1]).toBe('division-bronze');
    expect(DIVISION_CSS_CLASS[2]).toBe('division-silver');
    expect(DIVISION_CSS_CLASS[3]).toBe('division-gold');
    expect(DIVISION_CSS_CLASS[4]).toBe('division-diamond');
  });

  test('DIVISION_NAME devuelve el nombre español correcto para cada nivel', () => {
    expect(DIVISION_NAME[1]).toBe('Bronce');
    expect(DIVISION_NAME[2]).toBe('Plata');
    expect(DIVISION_NAME[3]).toBe('Oro');
    expect(DIVISION_NAME[4]).toBe('Diamante');
  });
});

test.describe('expectDivisionBadge — integración con perfil real', () => {
  test('expectDivisionBadgeLevel valida clase y title del badge en el perfil del usuario', async ({
    page,
    request,
    profilePage,
  }) => {
    const token = await readAccessToken(page);
    const profile = await fetchMyProfile(request, token);

    await profilePage.goto();

    const level = Math.min(Math.max(profile.division, 1), 4) as 1 | 2 | 3 | 4;
    await profilePage.expectDivisionBadgeLevel(level);
  });
});
