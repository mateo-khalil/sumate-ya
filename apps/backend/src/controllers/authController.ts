/**
 * Auth REST controllers
 *
 * Decision Context:
 * - Why: Keep login/session/register resolution in backend so Astro only talks to the app API.
 * - Pattern: Controllers orchestrate HTTP IO, authService encapsulates Supabase calls.
 *   Zod validation lives here so the service receives pre-validated, typed inputs.
 * - register(): validates body with Zod, maps field-level errors to a structured JSON response
 *   so the Astro form can display inline errors without a full page reload.
 * - Previously fixed bugs: none relevant.
 */

import type { Request, Response } from 'express';
import { z } from 'zod';

import { authService } from '../services/authService.js';

// ---------------------------------------------------------------------------
// Zod schema for club admin registration
// ---------------------------------------------------------------------------
const RegisterSchema = z
  .object({
    displayName: z.string().min(2, 'Nombre completo requerido (mínimo 2 caracteres)'),
    email: z.string().email('Email inválido'),
    password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
    confirmPassword: z.string().min(1, 'Confirmá tu contraseña'),
    clubName: z.string().min(2, 'Nombre del club requerido (mínimo 2 caracteres)'),
    address: z.string().min(5, 'Dirección requerida'),
    zone: z.string().min(1, 'Zona requerida'),
    phone: z.string().min(6, 'Teléfono requerido'),
    lat: z.number().optional(),
    lng: z.number().optional(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmPassword'],
  });

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

      if (message === 'Email not confirmed') {
        res.status(403).json({
          code: 'email_not_confirmed',
          message: 'Debés confirmar tu email antes de iniciar sesión. Revisá tu casilla de correo.',
        });
        return;
      }

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

  /**
   * Logout endpoint: Invalidates session via Supabase and returns 204.
   *
   * Decision Context:
   * - Why: Ensures JWT is invalidated server-side, not just cleared from client cookies.
   * - Pattern: Extracts token from Authorization header, calls authService.logout.
   * - Constraints: Returns 204 even if token is missing/invalid — client should clear cookies regardless.
   * - Previously fixed bugs: none relevant.
   */
  async logout(req: Request, res: Response): Promise<void> {
    const authHeader = req.headers.authorization;
    const accessToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

    if (accessToken) {
      try {
        await authService.logout(accessToken);
      } catch {
        // Ignore errors — token may already be expired
      }
    }

    res.status(204).send();
  },

  async register(req: Request, res: Response): Promise<void> {
    const parsed = RegisterSchema.safeParse(req.body);

    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (typeof field === 'string' && !errors[field]) {
          errors[field] = issue.message;
        }
      }
      res.status(400).json({ message: 'Datos inválidos', errors });
      return;
    }

    try {
      await authService.register(parsed.data);
      res.status(201).json({ message: 'Registro exitoso. Ya podés iniciar sesión.' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Registration failed';

      // Map known Supabase auth errors to user-friendly messages in Spanish
      if (message.toLowerCase().includes('already registered') || message.toLowerCase().includes('already been registered')) {
        res.status(409).json({ message: 'Datos inválidos', errors: { email: 'Este email ya está registrado' } });
        return;
      }

      if (message.toLowerCase().includes('rate limit') || message.toLowerCase().includes('too many requests')) {
        res.status(429).json({ message: 'Demasiados intentos de registro. Esperá unos minutos y volvé a intentarlo.' });
        return;
      }

      if (message.toLowerCase().includes('invalid email')) {
        res.status(400).json({ message: 'Datos inválidos', errors: { email: 'El email ingresado no es válido' } });
        return;
      }

      if (message.toLowerCase().includes('password')) {
        res.status(400).json({ message: 'Datos inválidos', errors: { password: 'La contraseña no cumple los requisitos mínimos' } });
        return;
      }

      res.status(400).json({ message: 'Error al registrar. Intentá de nuevo más tarde.' });
    }
  },
};
