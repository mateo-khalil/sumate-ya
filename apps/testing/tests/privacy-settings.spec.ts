import type { APIRequestContext, Browser, BrowserContext, Page } from '@playwright/test';
import {
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
 * Tests E2E de privacidad de perfil (/ajustes + /perfil/[id]).
 *
 * Decision Context:
 * - Usamos el backend real para updatePrivacy/profile/myProfile: la historia vive
 *   justamente en la persistencia de `profiles.isPublic` y en el filtrado server-side.
 * - El owner es Mateo y el viewer es Ricardo. Cada test arranca reseteando la privacidad
 *   de Mateo a publica y el afterEach la restaura, asi otros specs no quedan pegados a
 *   un perfil privado si una asercion falla.
 * - /ajustes es SSR + React island: los clicks pasan por la UI real; /perfil/[id] se
 *   valida desde otro contexto autenticado para cubrir el comportamiento entre usuarios.
 */

type PrivacySettings = {
  isPublic: boolean;
  showStats: boolean;
  showHistory: boolean;
  showPosition: boolean;
  showDivision: boolean;
};

type Profile = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  preferredPosition: 'GOALKEEPER' | 'DEFENDER' | 'MIDFIELDER' | 'FORWARD' | null;
  division: number | null;
  matchesPlayed: number | null;
  matchesWon: number | null;
  winrate: number | null;
  isPrivate: boolean | null;
};

type UpdatePrivacyInput = Partial<PrivacySettings>;

const PUBLIC_SETTINGS: PrivacySettings = {
  isPublic: true,
  showStats: true,
  showHistory: true,
  showPosition: true,
  showDivision: true,
};

const PRIVATE_SETTINGS: PrivacySettings = {
  ...PUBLIC_SETTINGS,
  isPublic: false,
};

const POSITION_LABEL: Record<NonNullable<Profile['preferredPosition']>, string> = {
  GOALKEEPER: 'Arquero',
  DEFENDER: 'Defensor',
  MIDFIELDER: 'Mediocampista',
  FORWARD: 'Delantero',
};

async function updatePrivacy(
  request: APIRequestContext,
  accessToken: string,
  input: UpdatePrivacyInput,
): Promise<PrivacySettings> {
  const data = await gqlPostOrThrow<{ updatePrivacy: PrivacySettings }>(
    request,
    /* GraphQL */ `
      mutation UpdatePrivacyE2E($input: UpdatePrivacyInput!) {
        updatePrivacy(input: $input) {
          isPublic
          showStats
          showHistory
          showPosition
          showDivision
        }
      }
    `,
    { input },
    accessToken,
  );

  return data.updatePrivacy;
}

async function fetchMySettings(
  request: APIRequestContext,
  accessToken: string,
): Promise<PrivacySettings> {
  const data = await gqlPostOrThrow<{ mySettings: PrivacySettings }>(
    request,
    /* GraphQL */ `
      query MySettingsPrivacyE2E {
        mySettings {
          isPublic
          showStats
          showHistory
          showPosition
          showDivision
        }
      }
    `,
    undefined,
    accessToken,
  );

  return data.mySettings;
}

async function fetchMyProfile(
  request: APIRequestContext,
  accessToken: string,
): Promise<Profile> {
  const data = await gqlPostOrThrow<{ myProfile: Profile }>(
    request,
    /* GraphQL */ `
      query MyProfilePrivacyE2E {
        myProfile {
          id
          displayName
          avatarUrl
          preferredPosition
          division
          matchesPlayed
          matchesWon
          winrate
          isPrivate
        }
      }
    `,
    undefined,
    accessToken,
  );

  return data.myProfile;
}

async function fetchProfileAsViewer(
  request: APIRequestContext,
  profileId: string,
  viewerToken: string,
): Promise<Profile | null> {
  const data = await gqlPostOrThrow<{ profile: Profile | null }>(
    request,
    /* GraphQL */ `
      query PublicProfilePrivacyE2E($id: ID!) {
        profile(id: $id) {
          id
          displayName
          avatarUrl
          preferredPosition
          division
          matchesPlayed
          matchesWon
          winrate
          isPrivate
        }
      }
    `,
    { id: profileId },
    viewerToken,
  );

  return data.profile;
}

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

async function expectOwnProfileCardVisible(page: Page, profile: Profile): Promise<void> {
  const card = page.locator('.profile-card').first();
  await expect(card.getByRole('heading', { name: profile.displayName })).toBeVisible();

  if (profile.division != null) {
    // DivisionBadge.astro renders a "D{level}" mark + division name, replacing the
    // old "DIV {n}" text label.
    await expect(card.locator('.division-badge .division-mark')).toHaveText(`D${profile.division}`);
  }

  if (profile.preferredPosition) {
    await expect(card.getByText(POSITION_LABEL[profile.preferredPosition])).toBeVisible();
  }

  if (profile.matchesPlayed != null) {
    await expect(
      card.locator('.stat-cell').filter({ hasText: 'Partidos' }).locator('.stat-value'),
    ).toHaveText(String(profile.matchesPlayed));
  }

  if (profile.matchesWon != null) {
    await expect(
      card.locator('.stat-cell').filter({ hasText: 'Victorias' }).locator('.stat-value'),
    ).toHaveText(String(profile.matchesWon));
  }

  if (profile.winrate != null) {
    await expect(
      card.locator('.stat-cell').filter({ hasText: 'Efectividad' }).locator('.stat-value'),
    ).toHaveText(`${profile.winrate.toFixed(1)}%`);
  }
}

test.use({ storageState: TEST_USERS.playerMateo.storageStatePath });

test.describe('Privacidad de perfil (/ajustes)', () => {
  test.describe.configure({ mode: 'serial' });

  let ownerToken = '';
  let ownerProfile: Profile;

  test.beforeEach(async ({ page, request }) => {
    ownerToken = await readAccessToken(page);
    await updatePrivacy(request, ownerToken, PUBLIC_SETTINGS);
    ownerProfile = await fetchMyProfile(request, ownerToken);
  });

  test.afterEach(async ({ request }) => {
    if (!ownerToken) return;
    await updatePrivacy(request, ownerToken, PUBLIC_SETTINGS).catch(() => undefined);
    ownerToken = '';
  });

  test('permite poner el perfil privado desde /ajustes y persiste profiles.isPublic=false', async ({
    page,
    profilePage,
    request,
    settingsPage,
  }) => {
    await settingsPage.goto();

    await expect(settingsPage.publicProfileSwitch).toHaveAttribute('aria-checked', 'true');
    await settingsPage.publicProfileSwitch.click();
    await expect(settingsPage.publicProfileSwitch).toHaveAttribute('aria-checked', 'false');
    await expect(settingsPage.statsSwitch).toBeDisabled();
    await expect(settingsPage.historySwitch).toBeDisabled();
    await expect(settingsPage.positionSwitch).toBeDisabled();
    await expect(settingsPage.divisionSwitch).toBeDisabled();

    const mutationPromise = page.waitForRequest((req) => {
      const body = req.postData() ?? '';
      return req.method() === 'POST' && req.url().endsWith('/graphql') && body.includes('updatePrivacy');
    });

    await settingsPage.saveButton.click();

    const mutationRequest = await mutationPromise;
    const payload = JSON.parse(mutationRequest.postData() ?? '{}') as {
      variables?: { input?: UpdatePrivacyInput };
    };
    expect(payload.variables?.input).toMatchObject({ isPublic: false });

    await expect(page.getByRole('alert')).toContainText(
      /configuraci.n de privacidad guardada/i,
    );
    await expect.poll(async () => (await fetchMySettings(request, ownerToken)).isPublic).toBe(false);

    await profilePage.goto();
    await expect(page.getByText(/tu perfil est. privado/i)).toBeVisible();
    await expect(page.getByRole('link', { name: /cambiar en ajustes/i })).toHaveAttribute(
      'href',
      '/ajustes',
    );
    await expectOwnProfileCardVisible(page, ownerProfile);
    await expect(profilePage.historySection).toBeVisible();
  });

  test('otro jugador ve un perfil privado sin division, posicion, stats ni historial', async ({
    browser,
    request,
  }) => {
    await updatePrivacy(request, ownerToken, PRIVATE_SETTINGS);

    const { context, page: viewerPage } = await openAsRicardo(browser, `/perfil/${ownerProfile.id}`);
    try {
      const card = viewerPage.locator('.profile-card').first();
      await expect(card.getByRole('heading', { name: ownerProfile.displayName })).toBeVisible();

      if (ownerProfile.avatarUrl) {
        await expect(card.getByAltText(`Foto de ${ownerProfile.displayName}`)).toBeVisible();
      } else {
        await expect(card.getByLabel(/sin foto de perfil/i)).toBeVisible();
      }

      await expect(viewerPage.getByText(/este jugador mantiene su perfil privado/i)).toBeVisible();
      await expect(viewerPage.getByText(/solo se muestra su nombre y foto/i)).toBeVisible();
      await expect(card.locator('.division-badge')).toHaveCount(0);
      await expect(card.locator('.position-tag')).toHaveCount(0);
      await expect(card.locator('.stats-grid')).toHaveCount(0);
      await expect(viewerPage.locator('.history-section')).toHaveCount(0);

      const viewerToken = await readAccessToken(viewerPage);
      const filteredProfile = await fetchProfileAsViewer(request, ownerProfile.id, viewerToken);
      expect(filteredProfile).toMatchObject({
        id: ownerProfile.id,
        displayName: ownerProfile.displayName,
        avatarUrl: ownerProfile.avatarUrl,
        preferredPosition: null,
        division: null,
        matchesPlayed: null,
        matchesWon: null,
        winrate: null,
        isPrivate: true,
      });
    } finally {
      await context.close();
    }
  });

  test('el propio usuario sigue viendo todos sus datos aunque oculte todo', async ({
    page,
    profilePage,
    request,
  }) => {
    await updatePrivacy(request, ownerToken, {
      isPublic: false,
      showStats: false,
      showHistory: false,
      showPosition: false,
      showDivision: false,
    });

    const ownerView = await fetchMyProfile(request, ownerToken);
    expect(ownerView.matchesPlayed).toBe(ownerProfile.matchesPlayed);
    expect(ownerView.matchesWon).toBe(ownerProfile.matchesWon);
    expect(ownerView.division).toBe(ownerProfile.division);
    expect(ownerView.preferredPosition).toBe(ownerProfile.preferredPosition);

    await profilePage.goto();

    await expect(page.getByText(/tu perfil est. privado/i)).toBeVisible();
    await expectOwnProfileCardVisible(page, ownerProfile);
    await profilePage.historySection.scrollIntoViewIfNeeded();
    await expect(page.getByRole('heading', { name: /historial de partidos/i })).toBeVisible();
  });

  test('si el perfil es publico pero showStats=false, otro jugador ve stats ocultas sin mensaje privado', async ({
    browser,
    request,
  }) => {
    await updatePrivacy(request, ownerToken, {
      isPublic: true,
      showStats: false,
      showHistory: true,
      showPosition: true,
      showDivision: true,
    });

    const { context, page: viewerPage } = await openAsRicardo(browser, `/perfil/${ownerProfile.id}`);
    try {
      const card = viewerPage.locator('.profile-card').first();
      await expect(card.getByRole('heading', { name: ownerProfile.displayName })).toBeVisible();
      await expect(viewerPage.getByText(/este jugador mantiene su perfil privado/i)).toHaveCount(0);
      await expect(card.locator('.private-tag')).toHaveCount(0);
      await expect(card.locator('.stats-hidden')).toContainText(/estad/i);
      await expect(card.locator('.stats-grid')).toHaveCount(0);

      if (ownerProfile.division != null) {
        // DivisionBadge.astro renders a "D{level}" mark + division name, replacing the
        // old "DIV {n}" text label.
        await expect(card.locator('.division-badge .division-mark')).toHaveText(
          `D${ownerProfile.division}`,
        );
      }

      const viewerToken = await readAccessToken(viewerPage);
      const filteredProfile = await fetchProfileAsViewer(request, ownerProfile.id, viewerToken);
      expect(filteredProfile).toMatchObject({
        id: ownerProfile.id,
        displayName: ownerProfile.displayName,
        isPrivate: false,
        matchesPlayed: null,
        matchesWon: null,
        winrate: null,
        division: ownerProfile.division,
      });
    } finally {
      await context.close();
    }
  });

  test('mantiene nombre y avatar visibles en partidos aunque el perfil este privado', async ({
    browser,
    request,
  }) => {
    await updatePrivacy(request, ownerToken, PRIVATE_SETTINGS);

    const { context, page: viewerPage } = await openAsRicardo(
      browser,
      `/partidos/${SEED_MATCHES.full}`,
    );
    try {
      const matchDetailPage = new MatchDetailPage(viewerPage);
      await expect(matchDetailPage.root).toBeVisible();
      await matchDetailPage.waitForIslandsHydrated();

      const playerCard = viewerPage
        .locator('.player-card')
        .filter({ hasText: ownerProfile.displayName })
        .first();
      await expect(playerCard).toBeVisible();

      if (ownerProfile.avatarUrl) {
        await expect(playerCard.locator('img.avatar-img')).toHaveAttribute(
          'src',
          ownerProfile.avatarUrl,
        );
      } else {
        await expect(playerCard.locator('.avatar-initial')).toHaveText(
          ownerProfile.displayName.charAt(0).toUpperCase(),
        );
      }
    } finally {
      await context.close();
    }
  });
});
