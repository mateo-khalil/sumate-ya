/**
 * Frontend auth helper
 *
 * Decision Context:
 * - Why: Frontend must not depend on Supabase SDKs or query the database directly.
 *   Astro server code talks only to backend REST auth endpoints.
 * - Pattern: Access token is stored in an HttpOnly cookie and forwarded to the backend
 *   for session validation on SSR requests.
 * - Previously fixed bugs: none relevant.
 */

import type { AstroCookies, CookieAttributes } from 'astro';

export type UserRole = 'player' | 'club_admin';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

export const ACCESS_TOKEN_COOKIE = 'sumateya-access-token';
export const REFRESH_TOKEN_COOKIE = 'sumateya-refresh-token';

const backendUrl =
  import.meta.env.PRIVATE_BACKEND_URL || process.env.PRIVATE_BACKEND_URL || 'http://localhost:4000';

export function getRoleRedirect(role: UserRole | undefined): string {
  return role === 'club_admin' ? '/panel-club' : '/partidos';
}

export function getAuthCookieOptions(isProd: boolean): CookieAttributes {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    path: '/',
  };
}

export function clearAuthCookies(cookies: AstroCookies): void {
  cookies.delete(ACCESS_TOKEN_COOKIE, { path: '/' });
  cookies.delete(REFRESH_TOKEN_COOKIE, { path: '/' });
}

export function readAccessToken(cookies: AstroCookies): string | undefined {
  return cookies.get(ACCESS_TOKEN_COOKIE)?.value;
}

export async function loginWithBackend(email: string, password: string): Promise<LoginResponse> {
  const response = await fetch(`${backendUrl}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });

  const payload = (await response.json().catch(() => null)) as
    | { message?: string; accessToken?: string; refreshToken?: string; user?: AuthUser }
    | null;

  if (!response.ok || !payload?.accessToken || !payload.refreshToken || !payload.user) {
    throw new Error(payload?.message ?? 'Authentication failed');
  }

  return {
    accessToken: payload.accessToken,
    refreshToken: payload.refreshToken,
    user: payload.user,
  };
}

export async function getSessionFromBackend(accessToken: string): Promise<AuthUser | null> {
  const response = await fetch(`${backendUrl}/api/auth/session`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as { user?: AuthUser };
  return payload.user ?? null;
}

export async function logoutFromBackend(accessToken?: string): Promise<void> {
  if (!accessToken) {
    return;
  }

  await fetch(`${backendUrl}/api/auth/logout`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  }).catch(() => undefined);
}