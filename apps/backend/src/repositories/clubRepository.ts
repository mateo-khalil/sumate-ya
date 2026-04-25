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
  zone: string;
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

export const clubRepository = { listClubs, getClubById };
