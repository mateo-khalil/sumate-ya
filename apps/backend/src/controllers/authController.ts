/**
 * Auth REST controllers
 *
 * Decision Context:
 * - Why: Keep login/session/register/refresh resolution in backend so Astro only talks to the API.
 * - Pattern: Controllers orchestrate HTTP IO; authService encapsulates Supabase calls.
 *   Zod validation lives here so the service receives pre-validated, typed inputs.
 * - register() is mounted at POST /api/auth/register-club (renamed from /register — P3 audit).
 *   Validates body with Zod, maps field-level errors to a structured JSON response
 *   so the Astro form can display inline errors without a full page reload.
 * - Previously fixed bugs:
 *   - password min was 6 chars — raised to 8 for stronger account security (P5).
 *   - lat/lng were optional with no range check — made required with -90/90 and -180/180
 *     bounds to prevent impossible coordinates from reaching the DB (P2, P6).
 *   - email-duplicate error revealed that the specific email existed ("Este email ya está
 *     registrado") — changed to a neutral message to avoid account enumeration (P9).
 *   - phone had only min(6) with no format check — added regex to reject non-phone strings (P4).
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
    // P5: raised from 6 to 8 chars for stronger account security.
    password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
    confirmPassword: z.string().min(1, 'Confirmá tu contraseña'),
    clubName: z.string().min(2, 'Nombre del club requerido (mínimo 2 caracteres)'),
    address: z.string().min(5, 'Dirección requerida'),
    zone: z.string().min(1, 'Zona requerida'),
    // P4: regex ensures only phone-like strings pass — digits, spaces, dashes, parens, and +.
    // Minimum 8 chars gives enough room for short local formats while blocking garbage input.
    phone: z
      .string()
      .min(1, 'Teléfono requerido')
      .regex(/^[+]?[\d\s\-()+]{8,}$/, 'Formato de teléfono inválido (ej: +54 11 4222-1111)'),
    // P2, P6: lat/lng are now required and range-validated so the map never receives
    // impossible coordinates. Clubs without a location cannot be registered.
    // Zod v4 note: required_error/invalid_type_error removed; range messages cover most cases.
    lat: z
      .number()
      .min(-90, 'Latitud inválida (debe estar entre -90 y 90)')
      .max(90, 'Latitud inválida (debe estar entre -90 y 90)'),
    lng: z
      .number()
      .min(-180, 'Longitud inválida (debe estar entre -180 y 180)')
      .max(180, 'Longitud inválida (debe estar entre -180 y 180)'),
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

  /**
   * Logout endpoint: Invalidates session via Supabase and returns 204.
   *
   * Decision Context:
   * - Why: Ensures JWT is invalidated server-side, not just cleared from client cookies.
   * - Pattern: Delegates to authService.logout() which uses user-scoped signOut().
   * - Constraints: Returns 204 regardless — the frontend clears cookies in any case.
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

      if (
        message.toLowerCase().includes('already registered') ||
        message.toLowerCase().includes('already been registered')
      ) {
        // P9: neutral message — does not confirm whether the specific email exists.
        res.status(409).json({
          message: 'No se pudo completar el registro. Si el email ya está registrado, intentá iniciar sesión.',
        });
        return;
      }

      if (
        message.toLowerCase().includes('rate limit') ||
        message.toLowerCase().includes('too many requests')
      ) {
        res.status(429).json({
          message: 'Demasiados intentos de registro. Esperá unos minutos y volvé a intentarlo.',
        });
        return;
      }

      if (message.toLowerCase().includes('invalid email')) {
        res.status(400).json({
          message: 'Datos inválidos',
          errors: { email: 'El email ingresado no es válido' },
        });
        return;
      }

      if (message.toLowerCase().includes('password')) {
        res.status(400).json({
          message: 'Datos inválidos',
          errors: { password: 'La contraseña no cumple los requisitos mínimos' },
        });
        return;
      }

      res.status(400).json({ message: 'Error al registrar. Intentá de nuevo más tarde.' });
    }
  },
};
