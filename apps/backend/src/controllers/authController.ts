/**
 * Auth REST controllers
 *
 * Decision Context:
 * - Why: Keep login/session resolution in backend so Astro only talks to the app API.
 * - Pattern: Controllers orchestrate HTTP IO, authService encapsulates Supabase calls.
 * - Previously fixed bugs: none relevant.
 */

import type { Request, Response } from 'express';

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

  async logout(_req: Request, res: Response): Promise<void> {
    res.status(204).send();
  },
};