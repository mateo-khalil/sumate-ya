/**
 * Auth REST controllers
 *
 * Decision Context:
 * - Why: Keep login/session/refresh resolution in backend so Astro only talks to the app API.
 * - Pattern: Controllers orchestrate HTTP IO, authService encapsulates Supabase calls.
 * - Previously fixed bugs:
 *   - logout() returned 204 without calling signOut() on Supabase, leaving the JWT valid
 *     server-side until natural expiry. Fixed: createUserClient(token).auth.signOut() is
 *     called best-effort before responding. Best-effort means the frontend always clears
 *     its cookies even if the Supabase call fails (e.g., already-expired token).
 */

import type { Request, Response } from 'express';

import { createUserClient } from '../config/supabase.js';
import { authService } from '../services/authService.js';

export const authController = {
  async login(req: Request, res: Response): Promise<void> {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!email || !password) {
      res.status(400).json({ message: 'Email and password are required.' });
      return;
    }

    try {
      const result = await authService.login(email, password);
      res.status(200).json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Authentication failed';
      const status = message === 'Invalid login credentials' ? 401 : 400;
      res.status(status).json({ message });
    }
  },

  async session(req: Request, res: Response): Promise<void> {
    const authHeader = req.headers.authorization;
    const accessToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

    if (!accessToken) {
      res.status(401).json({ message: 'Missing or malformed token.' });
      return;
    }

    try {
      const user = await authService.getSession(accessToken);
      res.status(200).json({ user });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Authentication failed';
      res.status(401).json({ message });
    }
  },

  // P3: exchanges a refresh token for a new session pair + user payload.
  async refresh(req: Request, res: Response): Promise<void> {
    const refreshToken =
      typeof req.body?.refreshToken === 'string' ? req.body.refreshToken.trim() : '';

    if (!refreshToken) {
      res.status(400).json({ message: 'Refresh token is required.' });
      return;
    }

    try {
      const result = await authService.refresh(refreshToken);
      res.status(200).json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Token refresh failed';
      res.status(401).json({ message });
    }
  },

  // P4: call signOut() so the JWT is invalidated server-side, not just cleared client-side.
  async logout(req: Request, res: Response): Promise<void> {
    const authHeader = req.headers.authorization;
    const accessToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

    if (accessToken) {
      try {
        await createUserClient(accessToken).auth.signOut();
      } catch {
        // Best-effort: frontend clears cookies regardless of whether signOut succeeds.
      }
    }

    res.status(204).send();
  },
};
