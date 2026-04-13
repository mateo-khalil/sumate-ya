/**
 * Astro SSR middleware — auth guard + role-based routing.
 *
 * Decision Context:
 * - Why: Centralizes auth checks so individual pages don't repeat getUser() + redirect logic.
 * - Pattern: Checks PROTECTED_ROUTES first (short-circuit for public paths).
 *   It forwards the access token cookie to backend auth endpoints and never talks to Supabase.
 * - Security: Frontend only trusts backend-validated session payloads.
 * - Previously fixed bugs: none relevant.
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
