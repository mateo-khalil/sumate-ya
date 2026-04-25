/**
 * Astro SSR middleware — auth guard + role-based routing.
 *
 * Decision Context:
 * - Why: Centralizes auth checks so individual pages don't repeat getUser() + redirect logic.
 * - Pattern: Checks PROTECTED_ROUTES first (short-circuit for public paths).
 *   It forwards the access token cookie to backend auth endpoints and never talks to Supabase.
 * - Refresh flow (P3): if the access token is missing or invalid AND a refresh token cookie
 *   exists, the middleware silently calls /api/auth/refresh, overwrites both cookies in the
 *   response, and continues the request. Only if refresh also fails does it redirect to /login.
 *   This keeps sessions alive past the 1-hour JWT TTL without the user noticing.
 * - Security: Frontend only trusts backend-validated session payloads.
 * - TODO (M3 — performance): cache the result of getSessionFromBackend() keyed by access
 *   token hash with a 30-second TTL to avoid 2 roundtrips (middleware → backend → Supabase
 *   + DB) on every SSR navigation. Not implemented now to keep complexity low; revisit if
 *   /partidos shows measurable latency under load.
 * - Previously fixed bugs:
 *   - Missing /perfil in PROTECTED_ROUTES (added in M1 — placeholder for future page).
 *   - No refresh logic: expired tokens always redirected to /login. Fixed in P3 above.
 */

import { defineMiddleware } from 'astro:middleware';
import {
  ACCESS_TOKEN_COOKIE,
  ACCESS_TOKEN_MAX_AGE,
  REFRESH_TOKEN_COOKIE,
  REFRESH_TOKEN_MAX_AGE,
  clearAuthCookies,
  getAuthCookieOptions,
  getRoleRedirect,
  getSessionFromBackend,
  isProduction,
  readAccessToken,
  readRefreshToken,
  refreshFromBackend,
  type UserRole,
} from './lib/auth';

/** Rutas que requieren autenticación */
const PROTECTED_ROUTES: string[] = ['/partidos', '/panel-club', '/perfil'];

/** Rutas restringidas por rol: sólo accesibles para el rol indicado */
const ROLE_RESTRICTED: Record<string, UserRole> = {
  '/panel-club': 'club_admin',
};

export const onRequest = defineMiddleware(async ({ cookies, url, redirect, locals, request }, next) => {
  const pathname = url.pathname;

  // Rutas públicas: continuar sin verificar
  const isProtected = PROTECTED_ROUTES.some((route) => pathname.startsWith(route));
  if (!isProtected) {
    return next();
  }

  const isProd = isProduction(request);
  const accessToken = readAccessToken(cookies);

  let user = null;

  if (accessToken) {
    user = await getSessionFromBackend(accessToken);
    if (!user) {
      // Access token exists but is rejected (invalid or expired) — clear it before trying refresh.
      cookies.delete(ACCESS_TOKEN_COOKIE, { path: '/' });
    }
  }

  // P3: if no valid user yet, attempt silent token refresh before giving up.
  if (!user) {
    const refreshToken = readRefreshToken(cookies);

    if (!refreshToken) {
      return redirect('/login');
    }

    try {
      const result = await refreshFromBackend(refreshToken);
      cookies.set(
        ACCESS_TOKEN_COOKIE,
        result.accessToken,
        getAuthCookieOptions(isProd, ACCESS_TOKEN_MAX_AGE),
      );
      cookies.set(
        REFRESH_TOKEN_COOKIE,
        result.refreshToken,
        getAuthCookieOptions(isProd, REFRESH_TOKEN_MAX_AGE),
      );
      user = result.user;
    } catch {
      clearAuthCookies(cookies);
      return redirect('/login');
    }
  }

  // Verificar restricción por rol
  const requiredRole = Object.entries(ROLE_RESTRICTED).find(([route]) =>
    pathname.startsWith(route),
  )?.[1];

  if (requiredRole) {
    const userRole = user.role as UserRole | undefined;
    if (userRole !== requiredRole) {
      return redirect(getRoleRedirect(userRole));
    }
  }

  locals.user = user;

  return next();
});
