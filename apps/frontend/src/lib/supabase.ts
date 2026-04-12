import { createServerClient, parseCookieHeader } from '@supabase/ssr';
import type { CookieOptions } from '@supabase/ssr';
import type { AstroCookies } from 'astro';

/**
 * Crea un cliente Supabase con acceso a las cookies del servidor.
 * Usar en pages y middleware de Astro (SSR).
 *
 * - getAll() parsea el header Cookie del Request (API no-deprecated de @supabase/ssr)
 * - setAll() escribe cookies httpOnly/secure para evitar acceso desde JS del cliente
 *
 * @param cookies AstroCookies para escritura (Astro.cookies o context.cookies)
 * @param request Web API Request para lectura del header Cookie (Astro.request o context.request)
 */
export function createSupabaseServerClient(cookies: AstroCookies, request: Request) {
  return createServerClient(
    import.meta.env.PUBLIC_SUPABASE_URL,
    import.meta.env.PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          // parseCookieHeader devuelve value?: string — garantizamos string para el contrato de @supabase/ssr
          return parseCookieHeader(request.headers.get('Cookie') ?? '').map(({ name, value }) => ({
            name,
            value: value ?? '',
          }));
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
          for (const { name, value, options } of cookiesToSet) {
            cookies.set(name, value, {
              ...options,
              httpOnly: true,
              secure: import.meta.env.PROD,
              sameSite: 'lax',
              path: '/',
            });
          }
        },
      },
    },
  );
}

export type UserRole = 'jugador' | 'club_admin';

export function getRoleRedirect(role: UserRole | undefined): string {
  return role === 'club_admin' ? '/panel-club' : '/partidos';
}
