/**
 * Profile REST controller — handles avatar upload and future profile REST actions
 *
 * Decision Context:
 * - Why REST (not GraphQL): File uploads require multipart/form-data or binary payloads
 *   that do not map cleanly to GraphQL mutations. REST is the documented choice for
 *   infrastructure operations (uploads, payments, webhooks) per backend.md.
 * - Auth pattern: extracts the Bearer token from Authorization header, then calls
 *   authService.getSession() to verify the JWT and obtain the user's ID. This mirrors
 *   the session endpoint pattern already in authController so there is no new auth path.
 * - Zod validation: guards the JSON body before any business logic runs. The dataUrl
 *   length cap (~3 MB in base64) ensures we don't buffer oversized payloads in memory
 *   before the service-layer size check fires.
 * - Error mapping: service errors are caught and surfaced as structured JSON so the
 *   React component can display user-friendly messages without string-parsing.
 * - Previously fixed bugs: none relevant.
 */

import type { Request, Response } from 'express';
import { z } from 'zod';

import { authService } from '../services/authService.js';
import { avatarService } from '../services/avatarService.js';
import { createUserClient } from '../config/supabase.js';

// ~3 MB base64 ceiling (actual max after decode is validated to 2 MB in the service)
const MAX_DATA_URL_LENGTH = 3_100_000;

const AvatarUploadSchema = z.object({
  dataUrl: z
    .string()
    .min(10, 'Imagen requerida')
    .max(MAX_DATA_URL_LENGTH, 'La imagen es demasiado grande (máximo 2MB)')
    .refine(
      (v) => /^data:image\/(jpeg|png|webp);base64,/.test(v),
      'Formato no permitido. Solo se aceptan JPG, PNG y WebP.',
    ),
});

export const profileController = {
  /**
   * POST /api/profile/avatar
   * Uploads and replaces the authenticated user's profile avatar.
   * Expects JSON body: { dataUrl: string } (base64 data URL)
   * Returns: { avatarUrl: string }
   */
  async uploadAvatar(req: Request, res: Response): Promise<void> {
    // 1. Authenticate
    const authHeader = req.headers.authorization;
    const accessToken =
      authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

    if (!accessToken) {
      res.status(401).json({ error: 'No autenticado' });
      return;
    }

    let userId: string;
    try {
      const user = await authService.getSession(accessToken);
      userId = user.id;
    } catch (error) {
      console.warn('[profileController.uploadAvatar] Invalid token:', error);
      res.status(401).json({ error: 'Sesión inválida o expirada' });
      return;
    }

    // 2. Validate body
    const parsed = AvatarUploadSchema.safeParse(req.body);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0]?.message ?? 'Datos inválidos';
      res.status(400).json({ error: firstIssue });
      return;
    }

    // 3. Upload via service using user-scoped client (enforces Storage RLS policies)
    try {
      const userClient = createUserClient(accessToken);
      const avatarUrl = await avatarService.uploadAvatar(
        { dataUrl: parsed.data.dataUrl },
        { userId, supabase: userClient },
      );

      console.info(`[profileController.uploadAvatar] Success userId=${userId}`);
      res.status(200).json({ avatarUrl });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Error al subir la imagen';
      console.error(`[profileController.uploadAvatar] Failed for userId=${userId}:`, error);
      res.status(500).json({ error: message });
    }
  },
};
