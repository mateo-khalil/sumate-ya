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

export const clubRepository = { listClubs, getClubById, updateClubCoords };
