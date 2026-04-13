/**
 * Express JWT authentication middleware.
 *
 * Decision Context:
 * - Why: REST routes need the same RLS-scoped Supabase client that GraphQL resolvers get.
 * - Pattern: Reuses createUserClient() from config/supabase.ts so the token-to-client
 *   logic is defined in a single place. Attaches req.user and req.supabase for downstream handlers.
 * - Constraints: Must NOT reveal whether an email exists (ambiguous 401 messages).
 * - Previously fixed bugs: none relevant.
 */

import type { Request, Response, NextFunction } from 'express';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { createUserClient } from '../config/supabase.js';

declare global {
  namespace Express {
    interface Request {
      user: User;
      supabase: SupabaseClient;
    }
  }
}

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized', message: 'Missing or malformed token.' });
    return;
  }

  const accessToken = authHeader.slice(7).trim();

  if (!accessToken) {
    res.status(401).json({ error: 'Unauthorized', message: 'Missing or malformed token.' });
    return;
  }

  const supabase = createUserClient(accessToken);

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    res.status(401).json({ error: 'Unauthorized', message: 'Invalid or expired token.' });
    return;
  }

  req.user = user;
  req.supabase = supabase;

  next();
}
