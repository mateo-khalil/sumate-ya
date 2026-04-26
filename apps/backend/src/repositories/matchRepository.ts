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

// Used by list queries (matches, search) — omits phone to keep egress minimal.
const CLUB_COLUMNS = `
  id,
  name,
  zone,
  address,
  lat,
  lng
`;

// Used only by the detail query — adds phone for the ClubLocationCard.
// Kept separate so list queries don't pay the phone egress cost.
const CLUB_DETAIL_COLUMNS = `
  id,
  name,
  zone,
  address,
  lat,
  lng,
  phone
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
  address: string | null;
  lat: number | null;
  lng: number | null;
}

/** Extended club row used only in detail queries — includes phone. */
export interface ClubDetailRow extends ClubRow {
  phone: string | null;
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

// =====================================================
// Match Detail with Participants
// =====================================================

// Columns for match detail (includes organizerId for ownership context)
const MATCH_DETAIL_COLUMNS = `
  id,
  "organizerId",
  description,
  "scheduledAt",
  format,
  capacity,
  status,
  "createdAt"
`;

// Participant row joined with the player's profile
const PARTICIPANT_COLUMNS = `
  id,
  team,
  "joinedAt",
  profiles(id, "displayName", "avatarUrl", "preferredPosition")
`;

export interface ParticipantProfileRow {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  preferredPosition: string | null;
}

export interface ParticipantRow {
  id: string;
  team: 'a' | 'b';
  joinedAt: string;
  profiles: ParticipantProfileRow;
}

export interface MatchDetailRow {
  id: string;
  organizerId: string;
  description: string | null;
  scheduledAt: string;
  format: string;
  capacity: number;
  status: string;
  createdAt: string;
  clubs: ClubDetailRow | null;
  matchParticipants: ParticipantRow[];
}

/**
 * Get a single match with club data AND participant list (profiles included).
 * Used for the match detail page and after joinMatch to return updated state.
 *
 * Decision Context:
 * - Why: The list query intentionally omits participants to avoid expensive joins.
 *   This function is only called for the single-match detail route.
 * - Participant profiles are joined via the matchParticipants.playerId → profiles.id FK.
 *   PostgREST auto-resolves the FK because it is the only FK from matchParticipants to profiles.
 * - Result is not cached here — caching happens in the service layer where the key and
 *   TTL decisions live (backend.md "Cache at the service layer" rule).
 * - Previously fixed bugs: none relevant.
 */
export async function getMatchWithParticipants(
  id: string,
  client: SupabaseClient = supabase,
): Promise<MatchDetailRow | null> {
  const { data, error } = await client
    .from('matches')
    .select(`${MATCH_DETAIL_COLUMNS}, clubs(${CLUB_DETAIL_COLUMNS}), matchParticipants(${PARTICIPANT_COLUMNS})`)
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    console.error(`[matchRepository.getMatchWithParticipants] Supabase error matchId=${id}:`, error.message);
    throw new Error(error.message);
  }

  return data as unknown as MatchDetailRow;
}

/**
 * Update match status (used to set 'full' when capacity is reached, or 'cancelled', etc.).
 * Uses the service-role singleton because this is a system-triggered status transition,
 * not a user action — the player filling the last slot is not the match organizer, so
 * the organizer-scoped RLS UPDATE policy would reject it.
 *
 * Decision Context:
 * - Why service role: RLS `matches_organizer_update` only allows auth.uid() = organizerId.
 *   When the last non-organizer player joins, their user-scoped client cannot UPDATE the
 *   match status. Using service role here is intentional and documented.
 * - Previously fixed bugs: none relevant.
 */
export async function updateMatchStatus(
  matchId: string,
  status: 'open' | 'full' | 'in_progress' | 'completed' | 'cancelled',
): Promise<void> {
  const { error } = await supabase
    .from('matches')
    .update({ status })
    .eq('id', matchId);

  if (error) {
    console.error(`[matchRepository.updateMatchStatus] Supabase error matchId=${matchId}:`, error.message);
    throw new Error(error.message);
  }
}

// =====================================================
// Match Creation Types & Functions
// =====================================================

export interface CreateMatchInput {
  organizerId: string;
  clubId: string;
  courtId: string;
  clubSlotId: string;
  format: string; // DB enum value: '5v5' | '7v7' | '10v10' | '11v11'
  capacity: number;
  scheduledAt: string; // ISO 8601 timestamp
  description?: string | null;
}

export interface NewMatchRow {
  id: string;
  organizerId: string;
  clubId: string;
  courtId: string | null;
  clubSlotId: string | null;
  format: string;
  capacity: number;
  scheduledAt: string;
  status: string;
  description: string | null;
  createdAt: string;
}

const NEW_MATCH_COLUMNS = `
  id,
  "organizerId",
  "clubId",
  "courtId",
  "clubSlotId",
  format,
  capacity,
  "scheduledAt",
  status,
  description,
  "createdAt"
`;

/**
 * Insert a new match row.
 * Must be called with a user-scoped client so the INSERT RLS policy (`organizerId = auth.uid()`)
 * is satisfied. Using the service-role singleton here would bypass that check.
 *
 * Decision Context:
 * - Why user-scoped: INSERT RLS on matches requires `auth.uid() = organizerId`. If we used
 *   the service-role singleton the policy would be bypassed — a bug that would allow any
 *   authenticated user's token to create matches on behalf of any other user.
 * - `status` defaults to 'open' in the DB; `resultStatus` defaults to 'pending'. We do not
 *   pass those columns so the DB defaults apply and we don't hard-code enum strings here.
 * - Previously fixed bugs: none relevant.
 */
export async function createMatch(
  input: CreateMatchInput,
  client: SupabaseClient = supabase,
): Promise<NewMatchRow> {
  const { data, error } = await client
    .from('matches')
    .insert({
      organizerId: input.organizerId,
      clubId: input.clubId,
      courtId: input.courtId,
      clubSlotId: input.clubSlotId,
      format: input.format,
      capacity: input.capacity,
      scheduledAt: input.scheduledAt,
      description: input.description ?? null,
    })
    .select(NEW_MATCH_COLUMNS)
    .single();

  if (error) {
    console.error('[matchRepository.createMatch] Supabase error:', error.message);
    throw new Error(error.message);
  }

  return data as unknown as NewMatchRow;
}

/**
 * Insert a row into matchParticipants to register a player on a team.
 * Called immediately after createMatch to add the organizer to team A.
 *
 * Decision Context:
 * - Uses user-scoped client so the INSERT RLS policy on matchParticipants is enforced.
 * - If this insert fails after the match is already created, the match still exists but has
 *   0 participants — a recoverable state. We log the error and re-throw so the service can
 *   surface a clear message. A future improvement could wrap both inserts in a DB transaction.
 * - Previously fixed bugs: none relevant.
 */
export async function createMatchParticipant(
  matchId: string,
  playerId: string,
  team: 'a' | 'b',
  client: SupabaseClient = supabase,
): Promise<void> {
  const { error } = await client
    .from('matchParticipants')
    .insert({ matchId, playerId, team });

  if (error) {
    console.error(
      `[matchRepository.createMatchParticipant] Supabase error matchId=${matchId} playerId=${playerId}:`,
      error.message,
    );
    throw new Error(error.message);
  }
}

// =====================================================
// Leave Match — remove participant, count, delete
// =====================================================

/**
 * Remove a single participant from matchParticipants.
 * MUST be called with a user-scoped client so the DELETE RLS policy
 * `participants_player_delete: USING (auth.uid() = "playerId")` is enforced.
 * Using service-role here would bypass RLS and let any user remove any participant.
 *
 * Decision Context:
 * - Why user-scoped: RLS DELETE requires auth.uid() = playerId. A service-role call would
 *   silently succeed for any playerId, which is a privilege-escalation risk.
 * - Returns true when a row was deleted, false when the participant was not found.
 *   The service uses this to surface "No estás inscripto en este partido".
 * - Previously fixed bugs: none relevant.
 */
export async function removeParticipant(
  matchId: string,
  playerId: string,
  client: SupabaseClient,
): Promise<boolean> {
  const { error, count } = await client
    .from('matchParticipants')
    .delete({ count: 'exact' })
    .eq('matchId', matchId)
    .eq('playerId', playerId);

  if (error) {
    console.error(
      `[matchRepository.removeParticipant] Supabase error matchId=${matchId} playerId=${playerId}:`,
      error.message,
    );
    throw new Error(error.message);
  }

  return (count ?? 0) > 0;
}

/**
 * Count the number of remaining participants for a match.
 * Called after removeParticipant to decide whether to auto-delete or update status.
 *
 * Decision Context:
 * - Uses service-role for a plain count read — no user-specific data is exposed.
 * - head:true fetches only the count without returning rows (egress prevention).
 * - Previously fixed bugs: none relevant.
 */
export async function countParticipants(matchId: string): Promise<number> {
  const { count, error } = await supabase
    .from('matchParticipants')
    .select('id', { count: 'exact', head: true })
    .eq('matchId', matchId);

  if (error) {
    console.error(
      `[matchRepository.countParticipants] Supabase error matchId=${matchId}:`,
      error.message,
    );
    throw new Error(error.message);
  }

  return count ?? 0;
}

/**
 * Permanently delete a match and all its related rows (cascade).
 * Uses service-role because there is no DELETE RLS policy on matches — this is
 * a system-triggered auto-elimination, not a user-initiated delete action.
 *
 * Decision Context:
 * - Why service-role: no DELETE policy exists on matches. This function is only called
 *   when countParticipants returns 0, so business-logic authorization happens in the
 *   service before this is invoked.
 * - Cascade: matchParticipants, matchResultSubmissions, matchResultVotes all cascade
 *   on match delete (per initial schema migration). Courts and club slots are not deleted.
 * - Previously fixed bugs: none relevant.
 */
export async function deleteMatch(matchId: string): Promise<void> {
  const { error } = await supabase
    .from('matches')
    .delete()
    .eq('id', matchId);

  if (error) {
    console.error(
      `[matchRepository.deleteMatch] Supabase error matchId=${matchId}:`,
      error.message,
    );
    throw new Error(error.message);
  }
}

// =====================================================
// Match History — completed matches for a specific player
// =====================================================

// Minimal columns selected for the history card — no capacity/createdAt/clubSlotId needed.
const MATCH_HISTORY_COLUMNS = `
  id,
  description,
  "scheduledAt",
  format,
  "organizerId"
`;

// Club columns for history — no lat/lng/phone, only display fields needed.
const CLUB_HISTORY_COLUMNS = `
  id,
  name,
  zone
`;

export interface HistoryClubRow {
  id: string;
  name: string;
  zone: string | null;
}

export interface HistoryParticipantRow {
  team: 'a' | 'b';
}

export interface CompletedMatchRow {
  id: string;
  description: string | null;
  scheduledAt: string;
  format: string;
  organizerId: string;
  clubs: HistoryClubRow | null;
  matchParticipants: HistoryParticipantRow[];
}

export interface CompletedMatchesResult {
  rows: CompletedMatchRow[];
  total: number;
}

/**
 * Get paginated completed matches for a specific player.
 * Queries from the `matches` side so we can order by scheduledAt DESC.
 * The !inner join on matchParticipants filters to only matches where the player participated.
 *
 * Decision Context:
 * - Why from `matches` (not `matchParticipants`): querying from the `matches` side lets us
 *   ORDER BY "scheduledAt" DESC directly, which gives the user their history newest-first.
 *   Querying from `matchParticipants` would only allow ordering by `joinedAt`, which is a
 *   proxy for scheduledAt but not exact.
 * - !inner on matchParticipants: ensures the outer WHERE clause (status = 'completed') and
 *   the join filter (matchParticipants.playerId = userId) are both applied as INNER JOIN
 *   conditions, so only matches the player participated in appear.
 * - matchParticipants result array: with the !inner + playerId filter, PostgREST returns
 *   only the participant row for this specific player — exactly one item per match.
 * - count: 'exact' adds a Content-Range header with the total rows (pre-pagination).
 *   Used by the service to compute hasMore.
 * - Service-role client: reads are safe with service-role since match history is auth-gated
 *   at the resolver layer. The user-scoped client could also be used but is not required.
 * - Previously fixed bugs: none relevant.
 */
export async function getCompletedMatchesByUser(
  userId: string,
  page: number,
  pageSize: number,
  client: SupabaseClient = supabase,
): Promise<CompletedMatchesResult> {
  const offset = (page - 1) * pageSize;

  const { data, error, count } = await client
    .from('matches')
    .select(
      `${MATCH_HISTORY_COLUMNS}, clubs(${CLUB_HISTORY_COLUMNS}), matchParticipants!inner(team)`,
      { count: 'exact' },
    )
    .eq('status', 'completed')
    .eq('matchParticipants.playerId', userId)
    .order('scheduledAt', { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (error) {
    console.error(
      `[matchRepository.getCompletedMatchesByUser] Supabase error userId=${userId}:`,
      error.message,
    );
    throw new Error(error.message);
  }

  return {
    rows: (data as unknown as CompletedMatchRow[]) ?? [],
    total: count ?? 0,
  };
}

// Export repository as object for consistency
export const matchRepository = {
  getMatchesWithFilters,
  getMatchesByStatus,
  getMatchById,
  getOpenMatches,
  getMatchWithParticipants,
  updateMatchStatus,
  removeParticipant,
  countParticipants,
  deleteMatch,
  createMatch,
  createMatchParticipant,
  getCompletedMatchesByUser,
};
