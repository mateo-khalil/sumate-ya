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
 * - Filter pattern: Dynamic WHERE clause building for flexible match queries. Each filter
 *   is applied conditionally using Supabase's fluent query builder.
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

/**
 * Filter options for querying matches
 */
export interface MatchFilterOptions {
  status?: string;
  format?: string;
  zone?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

// =====================================================
// Repository Functions
// =====================================================

/**
 * Get matches with dynamic filters
 *
 * Decision Context:
 * - Why: Flexible filtering allows frontend to pass any combination of filters.
 * - Pattern: Build query conditionally using Supabase's fluent builder. Each filter
 *   is optional and only applied if provided.
 * - Zone filter uses inner join on clubs table via the `!inner` modifier.
 * - Search filter: When searching, we run two queries (one for description, one for
 *   club name) and merge results. This is because Supabase's PostgREST doesn't support
 *   OR filters across related tables directly. Results are deduplicated by match ID.
 * - Previously fixed bugs: Supabase .or() doesn't work with related table columns,
 *   so we use a two-query approach instead.
 */
export async function getMatchesWithFilters(
  filters: MatchFilterOptions = {},
  client: SupabaseClient = supabase,
): Promise<MatchWithClub[]> {
  // If search is provided, we need to run parallel queries and merge
  if (filters.search) {
    return getMatchesWithSearch(filters, client);
  }

  // Standard query without search
  const clubJoin = filters.zone ? `clubs!inner(${CLUB_COLUMNS})` : `clubs(${CLUB_COLUMNS})`;

  let query = client.from('matches').select(`${MATCH_COLUMNS}, ${clubJoin}`);

  // Apply status filter (default to 'open' if not provided)
  const statusFilter = filters.status || 'open';
  query = query.eq('status', statusFilter);

  // Apply format filter
  if (filters.format) {
    query = query.eq('format', filters.format);
  }

  // Apply zone filter (requires inner join on clubs)
  if (filters.zone) {
    query = query.eq('clubs.zone', filters.zone);
  }

  // Apply date range filters
  if (filters.dateFrom) {
    query = query.gte('scheduledAt', filters.dateFrom);
  }
  if (filters.dateTo) {
    query = query.lte('scheduledAt', filters.dateTo);
  }

  // Order by scheduled date
  query = query.order('scheduledAt', { ascending: true });

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch matches: ${error.message}`);
  }

  return (data as unknown as MatchWithClub[]) || [];
}

/**
 * Search matches by description OR club name
 *
 * Decision Context:
 * - Why: Supabase PostgREST doesn't support OR filters across related tables.
 * - Pattern: Run two parallel queries (description search + club name search),
 *   merge results, deduplicate by ID, and sort by scheduledAt.
 * - Performance: Two small queries are still fast; could be optimized with a
 *   PostgreSQL function/view if performance becomes an issue.
 * - Previously fixed bugs: none relevant.
 */
async function getMatchesWithSearch(
  filters: MatchFilterOptions,
  client: SupabaseClient,
): Promise<MatchWithClub[]> {
  const searchTerm = `%${filters.search}%`;

  // Query 1: Search in match description
  let descriptionQuery = client
    .from('matches')
    .select(`${MATCH_COLUMNS}, clubs(${CLUB_COLUMNS})`)
    .eq('status', filters.status || 'open');

  if (filters.format) {
    descriptionQuery = descriptionQuery.eq('format', filters.format);
  }
  if (filters.dateFrom) {
    descriptionQuery = descriptionQuery.gte('scheduledAt', filters.dateFrom);
  }
  if (filters.dateTo) {
    descriptionQuery = descriptionQuery.lte('scheduledAt', filters.dateTo);
  }

  const descriptionQueryWithSearch = descriptionQuery
    .ilike('description', searchTerm)
    .order('scheduledAt', { ascending: true });

  // Query 2: Search in club name (requires inner join)
  let clubQuery = client
    .from('matches')
    .select(`${MATCH_COLUMNS}, clubs!inner(${CLUB_COLUMNS})`)
    .eq('status', filters.status || 'open');

  if (filters.format) {
    clubQuery = clubQuery.eq('format', filters.format);
  }
  if (filters.dateFrom) {
    clubQuery = clubQuery.gte('scheduledAt', filters.dateFrom);
  }
  if (filters.dateTo) {
    clubQuery = clubQuery.lte('scheduledAt', filters.dateTo);
  }

  const clubQueryWithSearch = clubQuery
    .ilike('clubs.name', searchTerm)
    .order('scheduledAt', { ascending: true });

  // Apply zone filter if present
  let q1 = descriptionQueryWithSearch;
  let q2 = clubQueryWithSearch;
  if (filters.zone) {
    // For description query, need to filter on clubs.zone but clubs might be null
    // So we use inner join version for zone filtering
    let descriptionZoneQuery = client
      .from('matches')
      .select(`${MATCH_COLUMNS}, clubs!inner(${CLUB_COLUMNS})`)
      .eq('status', filters.status || 'open');

    if (filters.format) {
      descriptionZoneQuery = descriptionZoneQuery.eq('format', filters.format);
    }
    if (filters.dateFrom) {
      descriptionZoneQuery = descriptionZoneQuery.gte('scheduledAt', filters.dateFrom);
    }
    if (filters.dateTo) {
      descriptionZoneQuery = descriptionZoneQuery.lte('scheduledAt', filters.dateTo);
    }

    q1 = descriptionZoneQuery
      .ilike('description', searchTerm)
      .eq('clubs.zone', filters.zone)
      .order('scheduledAt', { ascending: true });

    q2 = clubQueryWithSearch.eq('clubs.zone', filters.zone);
  }

  // Run both queries in parallel
  const [descResult, clubResult] = await Promise.all([q1, q2]);

  if (descResult.error) {
    throw new Error(`Failed to fetch matches by description: ${descResult.error.message}`);
  }
  if (clubResult.error) {
    throw new Error(`Failed to fetch matches by club: ${clubResult.error.message}`);
  }

  // Merge and deduplicate by ID
  const matchMap = new Map<string, MatchWithClub>();

  for (const match of (descResult.data as unknown as MatchWithClub[]) || []) {
    matchMap.set(match.id, match);
  }
  for (const match of (clubResult.data as unknown as MatchWithClub[]) || []) {
    if (!matchMap.has(match.id)) {
      matchMap.set(match.id, match);
    }
  }

  // Convert to array and sort by scheduledAt
  const merged = Array.from(matchMap.values());
  merged.sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());

  return merged;
}

/**
 * Get all matches with a specific status, including club data
 */
export async function getMatchesByStatus(
  status: string,
  client: SupabaseClient = supabase,
): Promise<MatchWithClub[]> {
  return getMatchesWithFilters({ status }, client);
}

/**
 * Get a single match by ID with club data
 */
export async function getMatchById(
  id: string,
  client: SupabaseClient = supabase,
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
export async function getOpenMatches(client: SupabaseClient = supabase): Promise<MatchWithClub[]> {
  return getMatchesWithFilters({ status: 'open' }, client);
}

// Export repository as object for consistency
export const matchRepository = {
  getMatchesWithFilters,
  getMatchesByStatus,
  getMatchById,
  getOpenMatches,
};
