import { defineMiddleware } from 'astro:middleware';
import { createSupabaseServerClient, type UserRole } from './lib/supabase';

/** Rutas que requieren autenticación */
const PROTECTED_ROUTES: string[] = ['/partidos', '/panel-club'];

/** Rutas restringidas por rol: sólo accesibles para el rol indicado */
const ROLE_RESTRICTED: Record<string, UserRole> = {
  '/panel-club': 'club_admin',
};

export const onRequest = defineMiddleware(async ({ cookies, request, url, redirect }, next) => {
  const pathname = url.pathname;

  // Rutas públicas: continuar sin verificar
  const isProtected = PROTECTED_ROUTES.some((route) => pathname.startsWith(route));
  if (!isProtected) {
    return next();
  }

  const supabase = createSupabaseServerClient(cookies, request);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Sin sesión → login
  if (!user) {
    return redirect('/login');
  }

  // Verificar restricción por rol
  const requiredRole = Object.entries(ROLE_RESTRICTED).find(([route]) =>
    pathname.startsWith(route),
  )?.[1];

  if (requiredRole) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const userRole = profile?.role as UserRole | undefined;
    if (userRole !== requiredRole) {
      // Redirigir a la ruta apropiada para su rol en lugar de mostrar 403
      return redirect(userRole === 'club_admin' ? '/panel-club' : '/partidos');
    }
  }

  return next();
});
