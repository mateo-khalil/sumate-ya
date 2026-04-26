/**
 * Astro SSR middleware — auth guard + role-based routing.
 *
 * Decision Context:
 * - Why: Centralizes auth checks so individual pages don't repeat getUser() + redirect logic,
 *   and ensures Astro.locals.user is populated consistently for both public and protected
 *   routes so navbars can show authenticated-user affordances (e.g., "Mi Perfil").
 * - Pattern: Always attempt to resolve the session if an access token is present, then apply
 *   auth/role enforcement only for PROTECTED_ROUTES. Public routes still get locals.user when
 *   a valid cookie is attached — this is what powers the authenticated navbar state.
 * - Refresh flow (P3): if the access token is missing or invalid AND a refresh token cookie
 *   exists, the middleware silently calls /api/auth/refresh, overwrites both cookies in the
 *   response, and continues the request. Only if refresh also fails does it redirect to /login.
 *   This keeps sessions alive past the 1-hour JWT TTL without the user noticing.
 * - Security: Frontend only trusts backend-validated session payloads. Tokens are forwarded
 *   to the backend /api/auth/session endpoint; we never call Supabase directly from here.
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
const PROTECTED_ROUTES: string[] = ['/panel-club', '/perfil', '/partidos/crear'];

/** Rutas restringidas por rol: sólo accesibles para el rol indicado */
const ROLE_RESTRICTED: Record<string, UserRole> = {
  '/panel-club': 'club_admin',
  '/partidos/crear': 'player',
};

export const onRequest = defineMiddleware(async ({ cookies, url, redirect, locals, request }, next) => {
  const pathname = url.pathname;
  const isProtected = PROTECTED_ROUTES.some((route) => pathname.startsWith(route));
  const isProd = isProduction(request);
  const accessToken = readAccessToken(cookies);

  // Always resolve session so public pages (e.g. navbar) can show authenticated state.
  let user = accessToken ? await getSessionFromBackend(accessToken) : null;

  if (accessToken && !user) {
    // Cookie presente pero rechazada — limpiar el access token antes de intentar refresh.
    cookies.delete(ACCESS_TOKEN_COOKIE, { path: '/' });
  }

  if (user) {
    locals.user = user;
  }

  if (!isProtected) {
    return next();
  }

  // Ruta protegida: si no hay usuario válido, intentar refresh silencioso (P3).
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
      locals.user = user;
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

  return next();
});
