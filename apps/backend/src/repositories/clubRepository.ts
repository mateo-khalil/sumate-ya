/**
 * Club Repository — DB access for the `clubs` table
 *
 * Decision Context:
 * - Explicit column list (CLUB_DETAIL_COLUMNS) per backend.md egress-prevention rule.
 * - lat/lng are excluded from CLUB_DETAIL_COLUMNS because the GraphQL ClubDetail type
 *   doesn't expose them — selecting them would be pure egress waste.
 * - `client` param allows the caller to pass a user-scoped client for RLS-enforced reads
 *   (consistent with all other repositories in this codebase).
 * - Previously fixed bugs: none relevant.
 */

import { supabase, type SupabaseClient } from '../config/supabase.js';

// =====================================================
// Column Definitions
// =====================================================

const CLUB_DETAIL_COLUMNS = `
  id,
  name,
  zone,
  address,
  phone,
  description,
  "imageUrl"
`;

// =====================================================
// Types
// =====================================================

export interface ClubDetailRow {
  id: string;
  name: string;
  zone: string | null;
  address: string;
  phone: string | null;
  description: string | null;
  imageUrl: string | null;
}

// =====================================================
// Repository Functions
// =====================================================

export async function listClubs(client: SupabaseClient = supabase): Promise<ClubDetailRow[]> {
  const { data, error } = await client
    .from('clubs')
    .select(CLUB_DETAIL_COLUMNS)
    .order('name', { ascending: true });

  if (error) {
    console.error('[clubRepository.listClubs] Supabase error:', error.message);
    throw new Error(error.message);
  }

  return (data as unknown as ClubDetailRow[]) ?? [];
}

export async function getClubById(
  id: string,
  client: SupabaseClient = supabase,
): Promise<ClubDetailRow | null> {
  const { data, error } = await client
    .from('clubs')
    .select(CLUB_DETAIL_COLUMNS)
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    console.error(`[clubRepository.getClubById] Supabase error for clubId=${id}:`, error.message);
    throw new Error(error.message);
  }

  return data as unknown as ClubDetailRow;
}

/**
 * Update the imageUrl for a club.
 *
 * Decision Context:
 * - Called from clubImageService after a successful Storage upload.
 * - Uses user-scoped client (default falls back to service-role) so RLS can enforce
 *   clubs.ownerId = auth.uid() when the caller passes a user-scoped client.
 * - The `imageUrl` column is camelCase in the DB; the Supabase JS SDK maps the JS
 *   property name directly, matching the PostgREST column resolution.
 * - DB update intentionally uses the service-role default (same rationale as
 *   profileRepository.updateAvatarUrl): no authenticated-role UPDATE policy exists
 *   for individual columns; authorization is enforced at the controller layer.
 * - Previously fixed bugs: none relevant.
 */
export async function updateClubImageUrl(
  clubId: string,
  imageUrl: string,
  client: SupabaseClient = supabase,
): Promise<void> {
  const { error } = await client
    .from('clubs')
    .update({ imageUrl })
    .eq('id', clubId);

  if (error) {
    console.error(
      `[clubRepository.updateClubImageUrl] Supabase error for clubId=${clubId}:`,
      error.message,
    );
    throw new Error(error.message);
  }
}

/**
 * Persist geocoded coordinates for a club.
 *
 * Decision Context:
 * - Why service-role: this is a backfill-on-read driven by geocodingService and runs in
 *   read-path resolvers where no user-scoped client is guaranteed (the matches list is
 *   public). Coordinates are derived from a public address, not a sensitive write — RLS
 *   would only complicate the read path without protecting anything new.
 * - Best-effort: errors are logged but never thrown. A failed persist just means the
 *   next request will re-geocode (Redis cache still avoids the network hit) — that's
 *   strictly better than poisoning the read path.
 * - Idempotent: callers only invoke this when lat/lng are null on read; concurrent
 *   updates with the same value are safe.
 */
export async function updateClubCoords(
  clubId: string,
  lat: number,
  lng: number,
  client: SupabaseClient = supabase,
): Promise<void> {
  const { error } = await client
    .from('clubs')
    .update({ lat, lng })
    .eq('id', clubId);

  if (error) {
    console.error(
      `[clubRepository.updateClubCoords] Failed to persist coords for clubId=${clubId}:`,
      error.message,
    );
    // Intentionally do not throw — see Decision Context above.
  }
}

/**
 * Return the ownerId (club_admin user) of a club, or null if the club doesn't exist.
 *
 * Decision Context:
 * - Used to authorize "club tournaments": a club_admin may create a tournament for the
 *   club they own (clubs.ownerId = auth.uid()), in addition to the legacy captain path.
 * - ownerId is intentionally NOT part of CLUB_DETAIL_COLUMNS (it isn't exposed via the
 *   public ClubDetail GraphQL type), so it gets its own minimal projection here to keep
 *   egress tight.
 * - Defaults to the service-role client because this is an authorization read in the write
 *   path; the caller has already authenticated. RLS on clubs (public SELECT) would allow it
 *   either way, but service-role avoids depending on the user client being present.
 * - Previously fixed bugs: none relevant.
 */
export async function getClubOwnerId(
  id: string,
  client: SupabaseClient = supabase,
): Promise<string | null> {
  const { data, error } = await client
    .from('clubs')
    .select('"ownerId"')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    console.error(`[clubRepository.getClubOwnerId] Supabase error for clubId=${id}:`, error.message);
    throw new Error(error.message);
  }

  return (data as unknown as { ownerId: string | null })?.ownerId ?? null;
}

export const clubRepository = { listClubs, getClubById, updateClubCoords, getClubOwnerId, updateClubImageUrl };
