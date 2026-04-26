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
 *   - lat/lng were optional with no range check — made required and validated within Uruguay
 *     so the map never receives impossible or off-territory coordinates (P2, P6).
 *   - email-duplicate error revealed that the specific email existed ("Este email ya está
 *     registrado") — changed to a neutral message to avoid account enumeration (P9).
 *   - phone had only min(6) with no format check — added regex to reject non-phone strings (P4).
 *   - logout() returned 204 without calling signOut() on Supabase, leaving the JWT valid
 *     server-side until natural expiry. Fixed: delegated to authService.logout() which calls
 *     user-scoped signOut() best-effort before responding.
 */

import type { Request, Response } from 'express';
import { z } from 'zod';

import { authService } from '../services/authService.js';
import { isInUruguay, URUGUAY_BOUNDS_DESCRIPTION } from '../utils/uruguayBounds.js';

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
    // P2, P6: lat/lng are required and validated within Uruguay so the map never receives
    // impossible or out-of-territory coordinates. Uruguay bounds replace global ±90/±180 to
    // also prevent inadvertently registering clubs with Buenos Aires-area coordinates.
    lat: z.number(),
    lng: z.number(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmPassword'],
  })
  .refine((d) => isInUruguay(d.lat, d.lng), {
    message: URUGUAY_BOUNDS_DESCRIPTION,
    path: ['lat'],
  });

// ---------------------------------------------------------------------------
// Zod schema for player registration
//
// Decision Context:
// - Why: Player signup is intentionally minimal — only identity + credentials are
//   captured. Extra fields (phone, position, skill level) belong to a later profile
//   completion flow, not the initial signup, per product scope.
// - Password min length: 8 chars (same as club admin) for consistent security floor.
// - Previously fixed bugs: none relevant.
// ---------------------------------------------------------------------------
const RegisterPlayerSchema = z
  .object({
    displayName: z.string().min(2, 'Nombre completo requerido (mínimo 2 caracteres)'),
    email: z.string().email('Email inválido'),
    password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
    confirmPassword: z.string().min(1, 'Confirmá tu contraseña'),
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
   * - Previously fixed bugs: logout() used to return 204 without invalidating the JWT,
   *   leaving the token usable until natural expiry. Fixed by delegating to authService.
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

  /**
   * Player registration: same shape as register() but routes to authService.registerPlayer
   * and uses RegisterPlayerSchema (no club fields). Error-mapping mirrors the club flow so
   * the frontend can use a single error-rendering code path.
   */
  async registerPlayer(req: Request, res: Response): Promise<void> {
    const parsed = RegisterPlayerSchema.safeParse(req.body);

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
      await authService.registerPlayer({
        displayName: parsed.data.displayName,
        email: parsed.data.email,
        password: parsed.data.password,
      });
      res.status(201).json({ message: 'Registro exitoso. Ya podés iniciar sesión.' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Registration failed';
      console.error('[authController.registerPlayer] Failed:', message);

      if (
        message.toLowerCase().includes('already registered') ||
        message.toLowerCase().includes('already been registered')
      ) {
        res
          .status(409)
          .json({ message: 'Datos inválidos', errors: { email: 'Este email ya está registrado' } });
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
