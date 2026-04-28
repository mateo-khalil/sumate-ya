/**
 * Astro SSR middleware — auth guard + role-based routing.
 *
 * Decision Context:
 * - Why: Centralizes auth checks so individual pages don't repeat getUser() + redirect logic.
 * - Pattern: Checks PROTECTED_ROUTES first (short-circuit for public paths).
 *   It forwards the access token cookie to backend auth endpoints and never talks to Supabase.
 *   ROLE_RESTRICTED is the source of truth for "this route is exclusive to role X" — any other
 *   role hitting it is bounced to its own home via `getRoleRedirect`. Keep both the player
 *   (/partidos) and club (/panel-club) home routes here so neither role can view the other's
 *   shell by typing the URL or following a stale link.
 * - Security: Frontend only trusts backend-validated session payloads.
 * - Previously fixed bugs:
 *   - /partidos was unrestricted, so a club_admin who visited it directly saw the player UI
 *     (post-login redirect already separated them, but the URL was reachable). Added the
 *     explicit player gate to mirror the existing club_admin gate on /panel-club.
 */

import { defineMiddleware } from 'astro:middleware';
import {
  clearAuthCookies,
  getRoleRedirect,
  getSessionFromBackend,
  readAccessToken,
  type UserRole,
} from './lib/auth';

/** Rutas que requieren autenticación */
const PROTECTED_ROUTES: string[] = ['/partidos', '/panel-club'];

/** Rutas restringidas por rol: sólo accesibles para el rol indicado */
const ROLE_RESTRICTED: Record<string, UserRole> = {
  '/panel-club': 'club_admin',
  '/partidos': 'player',
};

export const onRequest = defineMiddleware(async ({ cookies, url, redirect, locals }, next) => {
  const pathname = url.pathname;

  // Rutas públicas: continuar sin verificar
  const isProtected = PROTECTED_ROUTES.some((route) => pathname.startsWith(route));
  if (!isProtected) {
    return next();
  }

  const accessToken = readAccessToken(cookies);

  if (!accessToken) {
    return redirect('/login');
  }

  const user = await getSessionFromBackend(accessToken);

  if (!user) {
    clearAuthCookies(cookies);
    return redirect('/login');
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
