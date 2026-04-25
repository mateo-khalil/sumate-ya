/**
 * Astro SSR middleware — auth guard + role-based routing.
 *
 * Decision Context:
 * - Why: Centralizes auth checks so individual pages don't repeat getUser() + redirect logic,
 *   and ensures Astro.locals.user is populated consistently for both public and protected
 *   routes so navbars can show authenticated-user affordances (e.g., "Mi Perfil").
 * - Pattern: Always attempt to resolve the session if an access token is present, then apply
 *   auth/role enforcement only for PROTECTED_ROUTES. Public routes still get locals.user when
 *   a valid cookie is attached — this is what powers the authenticated navbar on /partidos.
 * - Security: Frontend only trusts backend-validated session payloads. Tokens are forwarded
 *   to the backend /api/auth/session endpoint; we never call Supabase directly from here.
 * - Previously fixed bugs:
 *   - /partidos navbar showed "Iniciar Sesión" for logged-in users because the middleware
 *     short-circuited on non-protected routes and never populated locals.user. Fixed by
 *     splitting session resolution from route enforcement.
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
const PROTECTED_ROUTES: string[] = ['/panel-club', '/perfil', '/partidos/crear'];

/** Rutas restringidas por rol: sólo accesibles para el rol indicado */
const ROLE_RESTRICTED: Record<string, UserRole> = {
  '/panel-club': 'club_admin',
  '/partidos/crear': 'player',
};

export const onRequest = defineMiddleware(async ({ cookies, url, redirect, locals }, next) => {
  const pathname = url.pathname;
  const isProtected = PROTECTED_ROUTES.some((route) => pathname.startsWith(route));

  const accessToken = readAccessToken(cookies);

  // Intentar resolver la sesión para cualquier ruta que tenga cookie — así las páginas
  // públicas (ej: /partidos) pueden renderizar el navbar autenticado.
  const user = accessToken ? await getSessionFromBackend(accessToken) : null;

  if (accessToken && !user) {
    // Cookie presente pero inválida: limpiar para forzar re-login
    clearAuthCookies(cookies);
  }

  if (user) {
    locals.user = user;
  }

  if (!isProtected) {
    return next();
  }

  // A partir de acá: ruta protegida
  if (!user) {
    return redirect('/login');
  }

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
