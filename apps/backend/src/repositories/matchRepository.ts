/**
 * Match Repository - Database access layer for matches
 *
 * Decision Context:
 * - Why: Explicit column selection prevents egress costs (backend.md egress-prevention
 *   rules — "NEVER use `select('*')`"). All SELECTed columns are listed in `MATCH_COLUMNS`
 *   / `CLUB_COLUMNS` so adding a column to the DB does not silently grow response size.
 * - JOIN pattern: `clubs(...)` pulls the related row in one round-trip to avoid a
 *   GraphQL-resolver N+1. The relation is many-to-one (`matches.clubId -> clubs.id`), so
 *   Supabase returns `clubs` as a single object, NOT an array — the casts below go through
 *   `unknown` because Supabase's inferred relation type is the conservative array form.
 * - Accepts an optional `client` argument so resolvers can pass a user-scoped Supabase
 *   client for RLS-enforced reads (backend.md "RLS-Aware Database Access").
 * - Schema: Supabase with RLS, uuid IDs, camelCase quoted identifiers.
 * - Previously fixed bugs: a prior revision used `data as MatchWithClub[]` which failed
 *   TS compilation because the inferred relation type did not overlap. Casting via
 *   `unknown` is intentional and documented here; do not remove without fixing the root
 *   cause (generated Supabase types).
 */

import { supabase } from '../config/supabase.js';
import type { SupabaseClient } from '../config/supabase.js';

// =====================================================
// Column Definitions (NEVER use select('*'))
// Matches actual Supabase schema
// =====================================================

const MATCH_COLUMNS = `
  id,
  description,
  "scheduledAt",
  format,
  capacity,
  status,
  "createdAt",
  "clubId"
`;

const CLUB_COLUMNS = `
  id,
  name,
  zone
`;

// =====================================================
// Types
// =====================================================

export interface MatchRow {
  id: string;
  description: string | null;
  scheduledAt: string;
  format: string;
  capacity: number;
  status: string;
  createdAt: string;
  clubId: string | null;
}

export interface ClubRow {
  id: string;
  name: string;
  zone: string | null;
}

export interface MatchWithClub extends MatchRow {
  clubs: ClubRow | null;
}

// =====================================================
// Repository Functions
// =====================================================

/**
 * Get all matches with a specific status, including club data
 */
export async function getMatchesByStatus(
  status: string,
  client: SupabaseClient = supabase
): Promise<MatchWithClub[]> {
  const { data, error } = await client
    .from('matches')
    .select(`${MATCH_COLUMNS}, clubs(${CLUB_COLUMNS})`)
    .eq('status', status)
    .order('scheduledAt', { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch matches: ${error.message}`);
  }

  return (data as unknown as MatchWithClub[]) || [];
}

/**
 * Get a single match by ID with club data
 */
export async function getMatchById(
  id: string,
  client: SupabaseClient = supabase
): Promise<MatchWithClub | null> {
  const { data, error } = await client
    .from('matches')
    .select(`${MATCH_COLUMNS}, clubs(${CLUB_COLUMNS})`)
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null; // Not found
    }
    throw new Error(`Failed to fetch match: ${error.message}`);
  }

  return data as unknown as MatchWithClub;
}

/**
 * Get all open matches (convenience wrapper)
 */
export async function getOpenMatches(
  client: SupabaseClient = supabase
): Promise<MatchWithClub[]> {
  return getMatchesByStatus('open', client);
}

// Export repository as object for consistency
export const matchRepository = {
  getMatchesByStatus,
  getMatchById,
  getOpenMatches,
};
