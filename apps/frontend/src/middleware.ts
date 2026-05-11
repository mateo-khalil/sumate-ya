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
 * - Role gating: ROLE_RESTRICTED maps a path to the role that owns it. /panel-club is club-only,
 *   /partidos and /partidos/crear are player-only. Mismatched roles get bounced via
 *   getRoleRedirect so neither role can view the other's shell by typing the URL.
 * - Security: Frontend only trusts backend-validated session payloads. Tokens are forwarded
 *   to the backend /api/auth/session endpoint; we never call Supabase directly from here.
 * - Previously fixed bugs:
 *   - Missing /perfil in PROTECTED_ROUTES (added in M1 — placeholder for future page).
 *   - No refresh logic: expired tokens always redirected to /login. Fixed in P3 above.
 *   - /partidos was unrestricted, so a club_admin who visited it directly saw the player UI.
 *     Added the explicit player gate to mirror the existing club_admin gate on /panel-club.
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
const PROTECTED_ROUTES: string[] = ['/panel-club', '/perfil', '/ajustes', '/partidos/crear', '/torneos/crear'];

/** Rutas restringidas por rol: sólo accesibles para el rol indicado */
const ROLE_RESTRICTED: Record<string, UserRole> = {
  '/panel-club': 'club_admin',
  '/partidos': 'player',
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
    // Store raw token in locals so API route proxies can forward it as Authorization Bearer.
    // The /api/graphql proxy cannot reliably parse the HttpOnly cookie from the route handler
    // in all Astro dev/prod configurations; middleware is the proven read point.
    locals.accessToken = accessToken;
  }

  if (!isProtected) {
    // Do NOT recreate the Request object here for /api/graphql POST requests.
    // Previously this block injected the Authorization header via new Request(request, {...})
    // but that pattern discards the POST body in Node.js — the body ReadableStream is not
    // transferred across the constructor, causing request.json() in the route handler to fail
    // with "Invalid request body" on any client-side refetch (e.g. week navigation).
    //
    // Auth forwarding is handled without body corruption via two mechanisms:
    //   1. locals.accessToken is set above (line ~73) when the session is valid — the proxy
    //      route handler reads it in the `else if (locals.accessToken)` branch.
    //   2. useDashboard.ts and other islands always send Authorization: Bearer <token>
    //      explicitly — the proxy's `explicitAuth` branch picks that up directly.
    //
    // Previously fixed bugs:
    //   - /api/graphql returned "Authentication required" — fixed via locals.accessToken.
    //   - new Request(request, {headers}) body loss caused "Invalid request body" on
    //     week navigation in the dashboard — fixed by removing the Request reconstruction.
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
      locals.accessToken = result.accessToken;
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
