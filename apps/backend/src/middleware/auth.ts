import type { Request, Response, NextFunction } from 'express';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

// Augmentar el tipo de Request para que los handlers tengan acceso al usuario y al cliente
declare global {
  namespace Express {
    interface Request {
      user: User;
      supabase: SupabaseClient;
    }
  }
}

/**
 * Middleware de autenticación JWT.
 *
 * Extrae el accessToken del header `Authorization: Bearer <token>`,
 * lo verifica contra Supabase y adjunta `req.user` y `req.supabase`
 * (cliente con scope de usuario) para los handlers siguientes.
 *
 * Uso: app.use('/api/protected', authMiddleware, router)
 */
export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Se requiere el header Authorization: Bearer <token>',
    });
    return;
  }

  const accessToken = authHeader.slice(7).trim();

  if (!accessToken) {
    res.status(401).json({ error: 'Unauthorized', message: 'Token vacío.' });
    return;
  }

  // Crear cliente Supabase con el JWT del usuario.
  // Esto respeta las políticas RLS definidas para ese usuario.
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    {
      global: {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
      auth: {
        // Deshabilitar persistencia: en el backend no queremos cookies ni localStorage
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );

  // Verificar el token llamando a Supabase (valida firma y expiración)
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Token inválido o expirado.',
    });
    return;
  }

  // Adjuntar al request para uso en los handlers
  req.user = user;
  req.supabase = supabase;

  next();
}
