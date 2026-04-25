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

// CookieAttributes was removed in Astro 6 — the canonical type is AstroCookieSetOptions.
import type { AstroCookies, AstroCookieSetOptions } from 'astro';

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
  return role === 'club_admin' ? '/panel-club' : '/';
}

export function getAuthCookieOptions(isProd: boolean): AstroCookieSetOptions {
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
    | { code?: string; message?: string; accessToken?: string; refreshToken?: string; user?: AuthUser }
    | null;

  if (!response.ok || !payload?.accessToken || !payload.refreshToken || !payload.user) {
    // Preserve machine-readable code for cases like email_not_confirmed so the
    // caller can render a specific message without string-matching the display text.
    const errorMessage =
      payload?.code === 'email_not_confirmed'
        ? 'email_not_confirmed'
        : (payload?.message ?? 'Authentication failed');
    throw new Error(errorMessage);
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

export interface RegisterClubInput {
  displayName: string;
  email: string;
  password: string;
  confirmPassword: string;
  clubName: string;
  address: string;
  zone: string;
  phone: string;
  lat?: number;
  lng?: number;
}

export interface RegisterFieldErrors {
  [field: string]: string;
}

export interface RegisterResult {
  ok: true;
  message: string;
}

export async function registerClubWithBackend(
  input: RegisterClubInput,
): Promise<RegisterResult | { ok: false; message: string; errors?: RegisterFieldErrors }> {
  const response = await fetch(`${backendUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  const payload = (await response.json().catch(() => null)) as {
    message?: string;
    errors?: RegisterFieldErrors;
  } | null;

  if (!response.ok) {
    return {
      ok: false,
      message: payload?.message ?? 'Error al registrar. Intentá de nuevo.',
      errors: payload?.errors,
    };
  }

  return { ok: true, message: payload?.message ?? 'Registro exitoso' };
}

export interface RegisterPlayerInput {
  displayName: string;
  email: string;
  password: string;
  confirmPassword: string;
}

/**
 * Player registration frontend helper.
 *
 * Decision Context:
 * - Why: Mirrors registerClubWithBackend() so the Astro page only speaks to the backend
 *   REST layer. Keeping the shape identical (ok / message / errors) means both
 *   registration pages can share the same error-rendering logic.
 * - Previously fixed bugs: none relevant.
 */
export async function registerPlayerWithBackend(
  input: RegisterPlayerInput,
): Promise<RegisterResult | { ok: false; message: string; errors?: RegisterFieldErrors }> {
  const response = await fetch(`${backendUrl}/api/auth/register-player`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  const payload = (await response.json().catch(() => null)) as {
    message?: string;
    errors?: RegisterFieldErrors;
  } | null;

  if (!response.ok) {
    return {
      ok: false,
      message: payload?.message ?? 'Error al registrar. Intentá de nuevo.',
      errors: payload?.errors,
    };
  }

  return { ok: true, message: payload?.message ?? 'Registro exitoso' };
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