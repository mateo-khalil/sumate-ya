/**
 * Club Image Service — upload, replace, and URL management for club profile images
 *
 * Decision Context:
 * - Why: Mirrors avatarService.ts but for the Club entity. Club images are stored in the
 *   same `avatars` bucket under the owner's folder (`{ownerId}/club-{clubId}-image-{ts}.ext`)
 *   so the existing Storage INSERT policy (`(foldername(name))[1] = auth.uid()`) continues
 *   to enforce ownership without requiring a new bucket or additional RLS policies.
 * - Ownership resolution: `getClubByOwnerId(ctx.userId)` resolves the club before upload;
 *   returns 403-equivalent error if the authenticated user owns no club.
 * - Auth for Storage: uses user-scoped client (ctx.supabase) for the Storage upload so the
 *   INSERT policy is enforced. The DB update uses service-role (same rationale as
 *   avatarService — clubs has no safe partial-column UPDATE policy for authenticated role).
 * - Cache invalidation: both `clubs:list` and `club:{clubId}` Redis keys are deleted after
 *   the DB update so subsequent reads reflect the new image URL within seconds.
 * - Old-image cleanup: previous Storage object is deleted after a successful update.
 *   Deletion failure is logged but does not abort the request — the new URL is valid.
 * - Previously fixed bugs: none relevant.
 */

import { cacheDelete, CACHE_PREFIX } from '../config/redis.js';
import { supabase } from '../config/supabase.js';
import { clubRepository } from '../repositories/clubRepository.js';
import { getClubByOwnerId } from '../repositories/clubSlotManagementRepository.js';
import type { ServiceContext } from '../types/context.js';

// =====================================================
// Constants
// =====================================================

const BUCKET = 'avatars';
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB

const ALLOWED_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

// =====================================================
// Helpers
// =====================================================

function parseDataUrl(dataUrl: string): { mimeType: string; buffer: Buffer; ext: string } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/s);
  if (!match) {
    throw new Error('Formato de imagen inválido. Usá JPG, PNG o WebP.');
  }
  const mimeType = match[1].toLowerCase();
  const ext = ALLOWED_MIME[mimeType];
  if (!ext) {
    throw new Error('Formato no permitido. Solo se aceptan JPG, PNG y WebP.');
  }
  const buffer = Buffer.from(match[2], 'base64');
  return { mimeType, buffer, ext };
}

function extractStoragePath(publicUrl: string): string | null {
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) return null;
  return publicUrl.slice(idx + marker.length);
}

/**
 * Verifies the avatars bucket exists before any upload.
 * Uses service-role because getBucket() is an admin API.
 */
async function assertBucketExists(): Promise<void> {
  const { data, error } = await supabase.storage.getBucket(BUCKET);
  if (error || !data) {
    console.error(
      '[clubImageService.assertBucketExists] Bucket check failed:',
      error?.message ?? 'bucket not found',
    );
    throw new Error(
      'El bucket de almacenamiento no está disponible. Contactá al administrador.',
    );
  }
}

// =====================================================
// Service
// =====================================================

export interface UploadClubImageInput {
  /** Base64 data URL: "data:image/jpeg;base64,..." */
  dataUrl: string;
}

/**
 * Uploads a new club image, replaces the old one, and returns the public URL.
 * Requires ctx.userId and ctx.supabase (user-scoped client for RLS enforcement).
 */
export async function uploadClubImage(
  input: UploadClubImageInput,
  ctx: ServiceContext,
): Promise<string> {
  if (!ctx.userId) {
    throw new Error('Authentication required');
  }

  const db = ctx.supabase ?? supabase;

  // 1. Parse and validate the data URL
  const { mimeType, buffer, ext } = parseDataUrl(input.dataUrl);

  if (buffer.byteLength > MAX_BYTES) {
    throw new Error('La imagen supera el límite de 2MB. Reducí el tamaño e intentá de nuevo.');
  }

  console.info(
    `[clubImageService.uploadClubImage] userId=${ctx.userId} size=${buffer.byteLength} mime=${mimeType}`,
  );

  // 2. Confirm bucket exists before attempting to write a URL (egress-prevention rule)
  await assertBucketExists();

  // 3. Resolve the club owned by this user
  const club = await getClubByOwnerId(ctx.userId, db);
  if (!club) {
    throw new Error('No se encontró un club asociado a este usuario.');
  }
  const clubId = club.id;

  // 4. Capture current imageUrl for cleanup after upload
  let oldImageUrl: string | null = null;
  try {
    const current = await clubRepository.getClubById(clubId, db);
    oldImageUrl = current?.imageUrl ?? null;
  } catch (err) {
    console.warn(
      `[clubImageService.uploadClubImage] Could not fetch current club for clubId=${clubId}:`,
      err,
    );
  }

  // 5. Upload under owner's folder so Storage INSERT policy (`foldername[1] = auth.uid()`) passes
  const filePath = `${ctx.userId}/club-${clubId}-image-${Date.now()}.${ext}`;

  const { error: uploadError } = await db.storage.from(BUCKET).upload(filePath, buffer, {
    contentType: mimeType,
    upsert: false,
  });

  if (uploadError) {
    console.error(
      `[clubImageService.uploadClubImage] Storage upload failed for clubId=${clubId}:`,
      uploadError.message,
    );
    throw new Error(`Error al subir la imagen: ${uploadError.message}`);
  }

  // 6. Obtain the public URL (bucket is public — no signed URL needed)
  const { data: urlData } = db.storage.from(BUCKET).getPublicUrl(filePath);
  const publicUrl = urlData.publicUrl;

  // 7. Update clubs.imageUrl — uses service-role default (no safe authenticated UPDATE policy)
  await clubRepository.updateClubImageUrl(clubId, publicUrl);
  console.info(`[clubImageService.uploadClubImage] Updated imageUrl for clubId=${clubId}`);

  // 8. Delete old image to prevent orphaned Storage objects (non-fatal)
  if (oldImageUrl) {
    const oldPath = extractStoragePath(oldImageUrl);
    if (oldPath) {
      const { error: deleteError } = await db.storage.from(BUCKET).remove([oldPath]);
      if (deleteError) {
        console.warn(
          `[clubImageService.uploadClubImage] Could not delete old image path=${oldPath}:`,
          deleteError.message,
        );
      } else {
        console.info(`[clubImageService.uploadClubImage] Deleted old image path=${oldPath}`);
      }
    }
  }

  // 9. Invalidate both clubs:list and club:{clubId} so reads pick up the new URL
  await Promise.all([
    cacheDelete(CACHE_PREFIX.CLUBS_LIST),
    cacheDelete(`${CACHE_PREFIX.CLUB_DETAIL}${clubId}`),
  ]);

  return publicUrl;
}

export const clubImageService = { uploadClubImage };
