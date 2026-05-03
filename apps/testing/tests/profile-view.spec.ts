import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

/**
 * Tests E2E de visualizacion de perfil (/perfil).
 *
 * Decision Context:
 * - /perfil es SSR y requiere auth: el fetch de myProfile ocurre en el servidor de
 *   Astro, por lo que page.route() no puede interceptarlo desde el browser. Para que
 *   el test sea determinista respecto al usuario autenticado, hacemos login real y
 *   consultamos el mismo contrato GraphQL con el access token de la cookie HttpOnly.
 * - Validamos la UI contra la respuesta de myProfile: nombre, avatar/fallback,
 *   division, posicion preferida, partidos jugados/ganados y winrate.
 * - Edge cases cubiertos: usuario anonimo redirigido, token invalido sin refresh,
 *   avatar ausente, posicion preferida ausente y winrate null cuando no hay partidos.
 *   Los valores concretos dependen del perfil seed usado por el ambiente.
 */

const FRONTEND_URL = 'http://localhost:4321';
const BACKEND_GRAPHQL_URL = 'http://localhost:4000/graphql';
const PROFILE_URL = `${FRONTEND_URL}/perfil`;
const ACCESS_TOKEN_COOKIE = 'sumateya-access-token';
const REFRESH_TOKEN_COOKIE = 'sumateya-refresh-token';

const TEST_USER = {
  email: 'mateoduran2010@gmail.com',
  password: 'Hola1234',
};

type Profile = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  role: 'PLAYER' | 'CLUB_ADMIN';
  preferredPosition: 'GOALKEEPER' | 'DEFENDER' | 'MIDFIELDER' | 'FORWARD' | null;
  division: number;
  matchesPlayed: number;
  matchesWon: number;
  winrate: number | null;
};

const POSITION_LABEL: Record<NonNullable<Profile['preferredPosition']>, string> = {
  GOALKEEPER: 'Arquero',
  DEFENDER: 'Defensor',
  MIDFIELDER: 'Mediocampista',
  FORWARD: 'Delantero',
};

async function login(page: Page): Promise<void> {
  await page.goto(`${FRONTEND_URL}/login`);
  await page.getByRole('textbox', { name: 'Email' }).fill(TEST_USER.email);
  await page.getByRole('textbox', { name: /contrase/i }).fill(TEST_USER.password);
  await page.getByRole('button', { name: /ingresar/i }).click();
  await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 10_000 });
}

async function readAccessToken(page: Page): Promise<string> {
  const cookies = await page.context().cookies(FRONTEND_URL);
  const accessToken = cookies.find((cookie) => cookie.name === ACCESS_TOKEN_COOKIE)?.value;

  expect(accessToken, 'el login debe dejar cookie HttpOnly de access token').toBeTruthy();
  return accessToken as string;
}

async function fetchMyProfile(request: APIRequestContext, accessToken: string): Promise<Profile> {
  const response = await request.post(BACKEND_GRAPHQL_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    data: {
      query: /* GraphQL */ `
        query GetMyProfile {
          myProfile {
            id
            displayName
            avatarUrl
            role
            preferredPosition
            division
            matchesPlayed
            matchesWon
            winrate
          }
        }
      `,
    },
  });

  expect(response.ok(), 'myProfile debe responder 2xx para el usuario autenticado').toBe(true);

  const payload = (await response.json()) as {
    data?: { myProfile?: Profile };
    errors?: Array<{ message: string }>;
  };

  expect(payload.errors ?? []).toHaveLength(0);
  expect(payload.data?.myProfile, 'myProfile debe devolver el perfil autenticado').toBeTruthy();
  return payload.data?.myProfile as Profile;
}

async function gotoProfile(page: Page): Promise<void> {
  await page.goto(PROFILE_URL);
  await expect(page.getByRole('heading', { name: /mi perfil/i })).toBeVisible();
  await expect(page.locator('.profile-card')).toBeVisible();
}

function statCell(page: Page, label: string) {
  return page.locator('.profile-card .stat-cell').filter({ hasText: label });
}

async function expectStatValue(page: Page, label: string, value: string | number): Promise<void> {
  await expect(statCell(page, label).locator('.stat-value')).toHaveText(String(value));
}

async function expectWinrate(page: Page, profile: Profile): Promise<void> {
  const winrate = statCell(page, 'Efectividad').locator('.stat-value');

  if (profile.winrate === null || profile.winrate === undefined) {
    await expect(winrate).not.toContainText('%');
    await expect(winrate).not.toHaveText('0%');
    return;
  }

  await expect(winrate).toHaveText(`${profile.winrate.toFixed(1)}%`);
}

test.describe('Ver perfil de usuario (/perfil)', () => {
  test.describe.configure({ mode: 'serial' });

  test('redirige a login cuando el jugador no esta autenticado', async ({ page }) => {
    await page.goto(PROFILE_URL);

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('textbox', { name: 'Email' })).toBeVisible();
  });

  test('redirige a login si hay access token invalido y no existe refresh token', async ({
    context,
    page,
  }) => {
    await context.addCookies([
      {
        name: ACCESS_TOKEN_COOKIE,
        value: 'token-invalido',
        domain: 'localhost',
        path: '/',
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);

    await page.goto(PROFILE_URL);

    await expect(page).toHaveURL(/\/login$/);
    const cookies = await context.cookies(FRONTEND_URL);
    expect(cookies.some((cookie) => cookie.name === ACCESS_TOKEN_COOKIE)).toBe(false);
    expect(cookies.some((cookie) => cookie.name === REFRESH_TOKEN_COOKIE)).toBe(false);
  });

  test('muestra nombre, division, posicion, avatar, stats y winrate del perfil autenticado', async ({
    page,
    request,
  }) => {
    await login(page);
    const profile = await fetchMyProfile(request, await readAccessToken(page));

    await gotoProfile(page);

    const card = page.locator('.profile-card');
    await expect(card.getByRole('heading', { name: profile.displayName })).toBeVisible();
    await expect(card.getByText(`DIV ${profile.division}`)).toBeVisible();
    await expectStatValue(page, 'Partidos', profile.matchesPlayed);
    await expectStatValue(page, 'Victorias', profile.matchesWon);
    await expectWinrate(page, profile);

    if (profile.preferredPosition) {
      await expect(card.getByText(POSITION_LABEL[profile.preferredPosition])).toBeVisible();
    } else {
      await expect(card.locator('.position-tag')).toHaveCount(0);
    }

    if (profile.avatarUrl) {
      const avatar = card.getByAltText(`Foto de ${profile.displayName}`);
      await expect(avatar).toBeVisible();
      await expect(avatar).toHaveAttribute('src', profile.avatarUrl);
    } else {
      await expect(card.getByLabel(/sin foto de perfil/i)).toBeVisible();
    }
  });

  test('el winrate visible respeta los bordes de myProfile', async ({ page, request }) => {
    await login(page);
    const profile = await fetchMyProfile(request, await readAccessToken(page));

    await gotoProfile(page);

    const expectedWinrate =
      profile.matchesPlayed > 0
        ? Number(((profile.matchesWon / profile.matchesPlayed) * 100).toFixed(2))
        : null;

    expect(profile.winrate).toBe(expectedWinrate);
    await expectWinrate(page, profile);
  });
});
