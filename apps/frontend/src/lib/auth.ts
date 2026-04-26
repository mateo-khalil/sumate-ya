/**
 * Frontend auth helper
 *
 * Decision Context:
 * - Why: Frontend must not depend on Supabase SDKs or query the database directly.
 *   Astro server code talks only to backend REST auth endpoints.
 * - Pattern: Access token is stored in an HttpOnly cookie and forwarded to the backend
 *   for session validation on SSR requests. The refresh token is stored separately with a
 *   longer maxAge (30 days) so sessions survive browser restarts and access token expiry.
 * - Previously fixed bugs:
 *   - CookieAttributes was removed in Astro 6; replaced with AstroCookieSetOptions.
 *   - getAuthCookieOptions() returned no maxAge, making cookies session-only (cleared on
 *     browser close). Fixed: access token gets 1 h maxAge, refresh token gets 30 days.
 *   - refreshFromBackend() did not exist, so expired access tokens always caused a /login
 *     redirect even when a valid refresh token was present. Fixed: added refresh helpers
 *     consumed by the middleware to silently renew sessions.
 *   - isProd was derived from Astro.url.protocol which returns 'http:' behind TLS-terminating
 *     proxies (Nginx, Vercel, Cloudflare), causing secure:false on production cookies.
 *     Fixed: isProduction() checks PRIVATE_IS_PROD env var first, then X-Forwarded-Proto,
 *     then falls back to URL protocol as last resort.
 *   - registerClubWithBackend() called /api/auth/register — renamed to /register-club (P3 audit).
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

// Separate TTLs — access token is short-lived, refresh token survives 30 days.
export const ACCESS_TOKEN_MAX_AGE = 60 * 60; // 1 hour (seconds)
export const REFRESH_TOKEN_MAX_AGE = 60 * 60 * 24 * 30; // 30 days (seconds)

const backendUrl =
  import.meta.env.PRIVATE_BACKEND_URL || process.env.PRIVATE_BACKEND_URL || 'http://localhost:4000';

/**
 * Determines whether the current request is running under HTTPS.
 * Priority:
 *  1. PRIVATE_IS_PROD env var (explicit override — reliable behind TLS-terminating proxies)
 *  2. X-Forwarded-Proto header (set by Nginx, Vercel, Cloudflare, etc.)
 *  3. URL protocol fallback (accurate only when the app is directly exposed)
 */
export function isProduction(request: Request): boolean {
  if (import.meta.env.PRIVATE_IS_PROD === 'true') return true;
  if (request.headers.get('x-forwarded-proto') === 'https') return true;
  return new URL(request.url).protocol === 'https:';
}

export function getRoleRedirect(role: UserRole | undefined): string {
  return role === 'club_admin' ? '/panel-club' : '/partidos';
}

// maxAge param makes the cookie persistent (vs session-only when omitted).
export function getAuthCookieOptions(isProd: boolean, maxAge?: number): AstroCookieSetOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    path: '/',
    ...(maxAge !== undefined ? { maxAge } : {}),
  };
}

export function clearAuthCookies(cookies: AstroCookies): void {
  cookies.delete(ACCESS_TOKEN_COOKIE, { path: '/' });
  cookies.delete(REFRESH_TOKEN_COOKIE, { path: '/' });
}

export function readAccessToken(cookies: AstroCookies): string | undefined {
  return cookies.get(ACCESS_TOKEN_COOKIE)?.value;
}

// Read the refresh token cookie for silent session renewal.
export function readRefreshToken(cookies: AstroCookies): string | undefined {
  return cookies.get(REFRESH_TOKEN_COOKIE)?.value;
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

// P3: exchange a refresh token for a new session; throws if the token is invalid/expired.
export async function refreshFromBackend(refreshToken: string): Promise<LoginResponse> {
  const response = await fetch(`${backendUrl}/api/auth/refresh`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ refreshToken }),
  });

  const payload = (await response.json().catch(() => null)) as
    | { message?: string; accessToken?: string; refreshToken?: string; user?: AuthUser }
    | null;

  if (!response.ok || !payload?.accessToken || !payload.refreshToken || !payload.user) {
    throw new Error(payload?.message ?? 'Token refresh failed');
  }

  return {
    accessToken: payload.accessToken,
    refreshToken: payload.refreshToken,
    user: payload.user,
  };
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
  // P3: renamed from /register to /register-club for REST clarity (club-admin-only endpoint).
  const response = await fetch(`${backendUrl}/api/auth/register-club`, {
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
