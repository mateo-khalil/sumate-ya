import type { APIRequestContext } from '@playwright/test';
import {
  ACCESS_TOKEN_COOKIE,
  expect,
  FRONTEND_URL,
  gqlPostOrThrow,
  loginAndReadToken,
  REFRESH_TOKEN_COOKIE,
  test,
} from './support';

/**
 * Tests E2E de visualización de perfil (/perfil).
 *
 * Decision Context:
 * - /perfil es SSR y requiere auth: el fetch de `myProfile` ocurre en el
 *   servidor de Astro, por lo que `page.route()` no lo intercepta. Para que el
 *   test sea determinista respecto al usuario autenticado, hacemos login real
 *   y consultamos el mismo contrato GraphQL con el access token.
 * - Validamos la UI contra la respuesta de myProfile: nombre, avatar/fallback,
 *   división, posición preferida, partidos jugados/ganados y winrate.
 * - Edge cases: visitante anónimo redirigido, token inválido sin refresh,
 *   avatar ausente, posición preferida ausente, winrate null.
 */

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

async function fetchMyProfile(
  request: APIRequestContext,
  accessToken: string,
): Promise<Profile> {
  const data = await gqlPostOrThrow<{ myProfile: Profile }>(
    request,
    /* GraphQL */ `
      query GetMyProfile {
        myProfile {
          id displayName avatarUrl role preferredPosition division
          matchesPlayed matchesWon winrate
        }
      }
    `,
    undefined,
    accessToken,
  );
  return data.myProfile;
}

test.describe('Ver perfil de usuario (/perfil)', () => {
  test.describe.configure({ mode: 'serial' });

  test('redirige a login cuando el jugador no esta autenticado', async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/perfil`);

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

    await page.goto(`${FRONTEND_URL}/perfil`);

    await expect(page).toHaveURL(/\/login$/);
    const cookies = await context.cookies(FRONTEND_URL);
    expect(cookies.some((c) => c.name === ACCESS_TOKEN_COOKIE)).toBe(false);
    expect(cookies.some((c) => c.name === REFRESH_TOKEN_COOKIE)).toBe(false);
  });

  test('muestra nombre, division, posicion, avatar, stats y winrate del perfil autenticado', async ({
    profilePage,
    page,
    request,
  }) => {
    const token = await loginAndReadToken(page, 'playerMateo');
    const profile = await fetchMyProfile(request, token);

    await profilePage.goto();

    await expect(profilePage.card.getByRole('heading', { name: profile.displayName })).toBeVisible();
    // The division badge now renders a "D{level}" mark + division name (DivisionBadge.astro),
    // replacing the old "DIV {n}" text label.
    await expect(profilePage.divisionBadge).toBeVisible();
    await expect(profilePage.divisionBadge.locator('.division-mark')).toHaveText(`D${profile.division}`);
    await profilePage.expectStatValue('Partidos', profile.matchesPlayed);
    await profilePage.expectStatValue('Victorias', profile.matchesWon);

    if (profile.preferredPosition) {
      await expect(
        profilePage.card.getByText(POSITION_LABEL[profile.preferredPosition]),
      ).toBeVisible();
    } else {
      await expect(profilePage.card.locator('.position-tag')).toHaveCount(0);
    }

    if (profile.avatarUrl) {
      const avatar = profilePage.card.getByAltText(`Foto de ${profile.displayName}`);
      await expect(avatar).toBeVisible();
      await expect(avatar).toHaveAttribute('src', profile.avatarUrl);
    } else {
      await expect(profilePage.card.getByLabel(/sin foto de perfil/i)).toBeVisible();
    }

    const winrate = profilePage.statCell('Efectividad').locator('.stat-value');
    if (profile.winrate === null || profile.winrate === undefined) {
      await expect(winrate).not.toContainText('%');
      await expect(winrate).not.toHaveText('0%');
    } else {
      await expect(winrate).toHaveText(`${profile.winrate.toFixed(1)}%`);
    }
  });

  test('el winrate visible respeta los bordes de myProfile', async ({
    profilePage,
    page,
    request,
  }) => {
    const token = await loginAndReadToken(page, 'playerMateo');
    const profile = await fetchMyProfile(request, token);

    await profilePage.goto();

    const expectedWinrate =
      profile.matchesPlayed > 0
        ? Number(((profile.matchesWon / profile.matchesPlayed) * 100).toFixed(2))
        : null;

    expect(profile.winrate).toBe(expectedWinrate);

    const winrate = profilePage.statCell('Efectividad').locator('.stat-value');
    if (profile.winrate === null) {
      await expect(winrate).not.toContainText('%');
    } else {
      await expect(winrate).toHaveText(`${profile.winrate.toFixed(1)}%`);
    }
  });
});
