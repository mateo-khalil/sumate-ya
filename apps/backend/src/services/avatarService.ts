/**
 * Avatar Service — upload, replace, and URL management for profile avatars
 *
 * Decision Context:
 * - Why: File upload to Supabase Storage belongs in the service layer (not controller)
 *   so the business rules (bucket validation, old-file cleanup, cache invalidation) are
 *   testable and decoupled from HTTP concerns.
 * - Upload format: the frontend sends a data URL (base64-encoded image). The service
 *   decodes it to a Buffer and uploads via the Supabase Storage JS client. This avoids
 *   adding multer or a multipart parser to the backend while keeping the payload small
 *   (images are compressed client-side to ≤512×512 px before encoding).
 * - Bucket validation: per backend.md egress-prevention rule, we NEVER store a Storage
 *   URL without confirming the bucket exists first. A failed bucket check aborts the
 *   upload rather than writing a broken URL to profiles.
 * - Old-avatar cleanup: after a successful upload we delete the previous object from
 *   Storage so orphaned files don't accumulate. Deletion failure is logged but does not
 *   abort the request — the new URL is already valid and the profile is already updated.
 * - RLS: the user-scoped Supabase client (created from the caller's JWT) is used for
 *   both Storage operations and the profile update. This lets the Storage INSERT/DELETE
 *   policies enforce `(storage.foldername(name))[1] = auth.uid()::text` so a user can
 *   only write to their own folder.
 * - Cache invalidation: the `profile:me:<userId>` Redis key is deleted after the DB
 *   update so the next `myProfile` query reflects the new URL within seconds.
 * - Previously fixed bugs: none relevant.
 */

import { cacheDelete, CACHE_PREFIX } from '../config/redis.js';
import { supabase } from '../config/supabase.js';
import { profileRepository } from '../repositories/profileRepository.js';
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

/**
 * Parses a base64 data URL into its mime type and raw Buffer.
 * Throws if the data URL format is invalid or the mime type is not allowed.
 */
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

/**
 * Extracts the Storage object path from a full public URL.
 * e.g. "https://<host>/storage/v1/object/public/avatars/uid/avatar-123.jpg"
 *       → "uid/avatar-123.jpg"
 * Returns null if the URL does not belong to the avatars bucket.
 */
function extractStoragePath(publicUrl: string): string | null {
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) return null;
  return publicUrl.slice(idx + marker.length);
}

/**
 * Verifies the avatars bucket exists. Throws if it cannot be confirmed.
 * Per backend.md egress-prevention rule, we must confirm the bucket before writing any URL.
 * Uses the service-role singleton because getBucket() is an admin API — user-scoped clients
 * (anon key + JWT) do not have permission to query bucket metadata.
 */
async function assertBucketExists(): Promise<void> {
  const { data, error } = await supabase.storage.getBucket(BUCKET);
  if (error || !data) {
    console.error('[avatarService.assertBucketExists] Bucket check failed:', error?.message ?? 'bucket not found');
    throw new Error(
      'El bucket de almacenamiento no está disponible. Contactá al administrador.',
    );
  }
}

// =====================================================
// Service
// =====================================================

export interface UploadAvatarInput {
  /** Base64 data URL: "data:image/jpeg;base64,..." */
  dataUrl: string;
}

/**
 * Uploads a new avatar image, replaces the old one, and returns the public URL.
 * Requires ctx.userId and ctx.supabase (user-scoped client for RLS enforcement).
 */
export async function uploadAvatar(
  input: UploadAvatarInput,
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

  console.info(`[avatarService.uploadAvatar] userId=${ctx.userId} size=${buffer.byteLength} mime=${mimeType}`);

  // 2. Confirm bucket exists before attempting to write a URL (egress-prevention rule)
  // Uses service-role singleton internally (getBucket is an admin API)
  await assertBucketExists();

  // 3. Fetch current profile to capture the old avatar path for cleanup
  let oldAvatarUrl: string | null = null;
  try {
    const current = await profileRepository.getProfileById(ctx.userId, db);
    oldAvatarUrl = current?.avatarUrl ?? null;
  } catch (err) {
    // Non-fatal: failure to read old URL just means we skip cleanup
    console.warn(`[avatarService.uploadAvatar] Could not fetch current profile for userId=${ctx.userId}:`, err);
  }

  // 4. Generate unique file path scoped to the user's folder (matches Storage INSERT policy)
  const filePath = `${ctx.userId}/avatar-${Date.now()}.${ext}`;

  // 5. Upload to Supabase Storage using the user-scoped client so INSERT policy is enforced
  const { error: uploadError } = await db.storage
    .from(BUCKET)
    .upload(filePath, buffer, {
      contentType: mimeType,
      upsert: false,
    });

  if (uploadError) {
    console.error(
      `[avatarService.uploadAvatar] Storage upload failed for userId=${ctx.userId}:`,
      uploadError.message,
    );
    throw new Error(`Error al subir la imagen: ${uploadError.message}`);
  }

  // 6. Obtain the public URL (bucket is public — no signed URL needed)
  const { data: urlData } = db.storage.from(BUCKET).getPublicUrl(filePath);
  const publicUrl = urlData.publicUrl;

  // 7. Update profiles.avatarUrl using service-role client (singleton default).
  // We intentionally do NOT pass the user-scoped client here: the profiles table has no
  // authenticated-role UPDATE policy because a blanket UPDATE policy would allow users to
  // change sensitive columns (role, matchesPlayed, etc.). Authorization is already enforced
  // at the controller layer via authService.getSession() — ctx.userId is JWT-derived, not
  // from user input, so using service-role for this specific column write is safe.
  await profileRepository.updateAvatarUrl(ctx.userId, publicUrl);
  console.info(`[avatarService.uploadAvatar] Updated avatarUrl for userId=${ctx.userId}`);

  // 8. Delete old avatar to prevent orphaned files (non-fatal)
  if (oldAvatarUrl) {
    const oldPath = extractStoragePath(oldAvatarUrl);
    if (oldPath) {
      const { error: deleteError } = await db.storage.from(BUCKET).remove([oldPath]);
      if (deleteError) {
        console.warn(
          `[avatarService.uploadAvatar] Could not delete old avatar path=${oldPath}:`,
          deleteError.message,
        );
      } else {
        console.info(`[avatarService.uploadAvatar] Deleted old avatar path=${oldPath}`);
      }
    }
  }

  // 9. Invalidate profile cache so next myProfile query returns the updated URL
  await cacheDelete(`${CACHE_PREFIX.PROFILE_ME}${ctx.userId}`);

  return publicUrl;
}

export const avatarService = {
  uploadAvatar,
};
