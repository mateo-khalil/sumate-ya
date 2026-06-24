/**
 * Club REST controller — handles club image upload and future club REST actions
 *
 * Decision Context:
 * - Why REST (not GraphQL): File uploads require binary/base64 payloads that don't
 *   map cleanly to GraphQL mutations — consistent with backend.md REST vs GraphQL table
 *   and the existing profileController pattern for avatar uploads.
 * - Auth pattern: extracts the Bearer token from Authorization header → authService.getSession()
 *   to verify the JWT and obtain userId. Mirrors profileController.uploadAvatar exactly.
 * - Role guard: after session verification, confirms the authenticated user's role is
 *   `club_admin` so non-club users cannot hit this endpoint even with a valid JWT.
 * - Zod validation: guards the JSON body before any business logic runs. The dataUrl
 *   length cap (~3 MB in base64) ensures we don't buffer oversized payloads in memory
 *   before the service-layer size check fires.
 * - Previously fixed bugs: none relevant.
 */

import type { Request, Response } from 'express';
import { z } from 'zod';

import { authService } from '../services/authService.js';
import { clubImageService } from '../services/clubImageService.js';
import { createUserClient } from '../config/supabase.js';

const MAX_DATA_URL_LENGTH = 3_100_000;

const ClubImageUploadSchema = z.object({
  dataUrl: z
    .string()
    .min(10, 'Imagen requerida')
    .max(MAX_DATA_URL_LENGTH, 'La imagen es demasiado grande (máximo 2MB)')
    .refine(
      (v) => /^data:image\/(jpeg|png|webp);base64,/.test(v),
      'Formato no permitido. Solo se aceptan JPG, PNG y WebP.',
    ),
});

export const clubController = {
  /**
   * POST /api/club/image
   * Uploads and replaces the authenticated club_admin's club profile image.
   * Expects JSON body: { dataUrl: string } (base64 data URL)
   * Returns: { imageUrl: string }
   */
  async uploadClubImage(req: Request, res: Response): Promise<void> {
    // 1. Authenticate
    const authHeader = req.headers.authorization;
    const accessToken =
      authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

    if (!accessToken) {
      res.status(401).json({ error: 'No autenticado' });
      return;
    }

    let userId: string;
    let userRole: string;
    try {
      const user = await authService.getSession(accessToken);
      userId = user.id;
      userRole = user.role;
    } catch (error) {
      console.warn('[clubController.uploadClubImage] Invalid token:', error);
      res.status(401).json({ error: 'Sesión inválida o expirada' });
      return;
    }

    if (userRole !== 'club_admin') {
      res.status(403).json({ error: 'Solo los administradores de club pueden subir imágenes de club.' });
      return;
    }

    // 2. Validate body
    const parsed = ClubImageUploadSchema.safeParse(req.body);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0]?.message ?? 'Datos inválidos';
      res.status(400).json({ error: firstIssue });
      return;
    }

    // 3. Upload via service using user-scoped client (enforces Storage RLS policies)
    try {
      const userClient = createUserClient(accessToken);
      const imageUrl = await clubImageService.uploadClubImage(
        { dataUrl: parsed.data.dataUrl },
        { userId, supabase: userClient },
      );

      console.info(`[clubController.uploadClubImage] Success userId=${userId}`);
      res.status(200).json({ imageUrl });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Error al subir la imagen';
      console.error(`[clubController.uploadClubImage] Failed for userId=${userId}:`, error);
      res.status(500).json({ error: message });
    }
  },
};
