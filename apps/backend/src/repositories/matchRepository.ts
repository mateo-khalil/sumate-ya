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
// imageUrl included so list cards (MatchCard) can render the club avatar without a
// second round-trip; the column is small (TEXT, ~100B) and required by every list view.
const CLUB_COLUMNS = `
  id,
  name,
  zone,
  address,
  lat,
  lng,
  "imageUrl"
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
  phone,
  "imageUrl"
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
  imageUrl: string | null;
}

/** Extended club row used only in detail queries — includes phone. */
export interface ClubDetailRow extends ClubRow {
  phone: string | null;
}

export interface MatchWithClub extends MatchRow {
  clubs: ClubRow | null;
  // PostgREST returns relation aggregates as a single-element array shaped `[{ count: N }]`
  // when the SELECT includes `matchParticipants(count)`. Older cached rows (pre-fix) may
  // omit this field — service-layer mappers must default to 0 in that case so list cards
  // don't render NaN slots while the cache warms up.
  matchParticipants?: Array<{ count: number }>;
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
  /**
   * Restrict to matches the given user joined. When set, the query inner-joins
   * matchParticipants on `playerId = participantUserId`. Resolved at the service
   * layer from `MatchFilters.onlyMine + ctx.user.id` — never trusted from the
   * client directly.
   */
  participantUserId?: string;
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

  // Decision Context: "onlyMine" filter via two-step lookup
  // - The repo could inner-join matchParticipants on playerId, but PostgREST then drops the
  //   `matchParticipants(count)` aggregate (you can't request both a filter and a count on
  //   the same relation cleanly). Without the aggregate the list cards would show 0/10
  //   players for past matches the user actually played in.
  // - Two-step approach: (1) fetch the user's participated matchIds, (2) constrain the main
  //   query with `.in('id', ids)`. Keeps `matchParticipants(count)` intact so slot counts
  //   remain accurate. Adds one extra round-trip per request, acceptable at our scale
  //   (< few hundred matches per user, single roundtrip cost is small).
  // - Authorization: the resolver enforces that participantUserId equals ctx.user.id, so
  //   anonymous callers cannot enumerate other users' match history through this path.
  // - Edge case: if the user has zero participations, the IN clause receives an empty array.
  //   Supabase `.in('id', [])` returns an empty result set, which is the correct behavior.
  let participatedMatchIds: string[] | null = null;
  if (filters.participantUserId) {
    const { data: participantRows, error: partError } = await client
      .from('matchParticipants')
      .select('matchId')
      .eq('playerId', filters.participantUserId);
    if (partError) {
      console.error(
        `[matchRepository.getMatchesWithFilters] Failed to fetch participated matchIds for userId=${filters.participantUserId}:`,
        partError.message,
      );
      throw new Error(partError.message);
    }
    participatedMatchIds = (participantRows ?? []).map((row) => row.matchId as string);
    if (participatedMatchIds.length === 0) {
      return [];
    }
  }

  // Standard query without search
  const clubJoin = filters.zone ? `clubs!inner(${CLUB_COLUMNS})` : `clubs(${CLUB_COLUMNS})`;

  // matchParticipants(count) returns a relation aggregate, NOT participant rows — it lets
  // the list query show the correct "filled/total" jugadores ratio without N+1 round-trips
  // and without the egress cost of pulling every participant row.
  let query = client
    .from('matches')
    .select(`${MATCH_COLUMNS}, ${clubJoin}, matchParticipants(count)`);

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

  if (participatedMatchIds) {
    query = query.in('id', participatedMatchIds);
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

  // When filtering by participation, fetch the user's matchIds first and constrain
  // the main queries with `.in('id', ids)`. Same rationale as getMatchesWithFilters —
  // preserves the matchParticipants(count) aggregate for accurate slot counts.
  let participatedMatchIds: string[] | null = null;
  if (filters.participantUserId) {
    const { data: participantRows, error: partError } = await client
      .from('matchParticipants')
      .select('matchId')
      .eq('playerId', filters.participantUserId);
    if (partError) {
      console.error(
        `[matchRepository.getMatchesWithSearch] Failed to fetch participated matchIds for userId=${filters.participantUserId}:`,
        partError.message,
      );
      throw new Error(partError.message);
    }
    participatedMatchIds = (participantRows ?? []).map((row) => row.matchId as string);
    if (participatedMatchIds.length === 0) {
      return [];
    }
  }

  // Query 1: Search in match description
  let descriptionQuery = client
    .from('matches')
    .select(`${MATCH_COLUMNS}, clubs(${CLUB_COLUMNS}), matchParticipants(count)`)
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
  if (participatedMatchIds) {
    descriptionQuery = descriptionQuery.in('id', participatedMatchIds);
  }

  const descriptionQueryWithSearch = descriptionQuery
    .ilike('description', searchTerm)
    .order('scheduledAt', { ascending: true });

  // Query 2: Search in club name (requires inner join)
  let clubQuery = client
    .from('matches')
    .select(`${MATCH_COLUMNS}, clubs!inner(${CLUB_COLUMNS}), matchParticipants(count)`)
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
  if (participatedMatchIds) {
    clubQuery = clubQuery.in('id', participatedMatchIds);
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
      .select(`${MATCH_COLUMNS}, clubs!inner(${CLUB_COLUMNS}), matchParticipants(count)`)
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
    if (participatedMatchIds) {
      descriptionZoneQuery = descriptionZoneQuery.in('id', participatedMatchIds);
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
    .select(`${MATCH_COLUMNS}, clubs(${CLUB_COLUMNS}), matchParticipants(count)`)
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

// Columns for match detail (includes organizerId for ownership context and organizedByClub for badge)
const MATCH_DETAIL_COLUMNS = `
  id,
  "organizerId",
  description,
  "scheduledAt",
  "durationMin",
  format,
  capacity,
  status,
  "createdAt",
  "organizedByClub"
`;

// Participant row joined with the player's profile
const PARTICIPANT_COLUMNS = `
  id,
  team,
  "joinedAt",
  profiles(id, "displayName", "avatarUrl", "preferredPosition", division)
`;

export interface ParticipantProfileRow {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  preferredPosition: string | null;
  division: number;
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
  durationMin: number | null;
  format: string;
  capacity: number;
  status: string;
  createdAt: string;
  organizedByClub: boolean;
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

/**
 * Cancel a match as a system side-effect, preserving the row for audit/history.
 * Uses service-role because the last player leaving is not necessarily the organizer
 * and the organizer-scoped RLS UPDATE policy would reject the transition.
 */
export async function cancelMatchWithReason(
  matchId: string,
  reason: string,
): Promise<void> {
  const { error } = await supabase
    .from('matches')
    .update({ status: 'cancelled', cancellationReason: reason })
    .eq('id', matchId);

  if (error) {
    console.error(`[matchRepository.cancelMatchWithReason] Supabase error matchId=${matchId}:`, error.message);
    throw new Error(error.message);
  }
}

/**
 * Notify the organizer that their match was auto-cancelled after the last player left.
 * Uses service-role for the system-generated notification write.
 */
export async function insertOrganizerAutoCancelNotification(
  organizerId: string,
  matchId: string,
): Promise<void> {
  const { error } = await supabase.from('notifications').insert({
    userId: organizerId,
    title: 'Partido cancelado automaticamente',
    body: 'Tu partido fue cancelado porque no quedan jugadores anotados.',
    type: 'match_auto_cancelled',
    referenceId: matchId,
    isRead: false,
  });

  if (error) {
    console.error(
      `[matchRepository.insertOrganizerAutoCancelNotification] Supabase error matchId=${matchId} organizerId=${organizerId}:`,
      error.message,
    );
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
  // When true the match was created by the club admin, not by a player.
  // The organizer is NOT auto-enrolled in matchParticipants unless the service explicitly does so.
  organizedByClub?: boolean;
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
  organizedByClub: boolean;
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
  "createdAt",
  "organizedByClub"
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
      organizedByClub: input.organizedByClub ?? false,
    })
    .select(NEW_MATCH_COLUMNS)
    .single();

  if (error) {
    console.error('[matchRepository.createMatch] Supabase error:', error.message);
    // 23505 = unique_violation. The partial unique index
    // "matches_active_slot_schedule_unique" guarantees at most one active match per
    // (clubSlotId, scheduledAt). Surface a user-friendly message instead of leaking
    // the raw constraint name (defense-in-depth backstop for the double-booking fix).
    if ((error as { code?: string }).code === '23505') {
      throw new Error('Ya existe un partido en este horario para esa fecha');
    }
    throw new Error(error.message);
  }

  return data as unknown as NewMatchRow;
}

/**
 * Returns true if an active (non-cancelled) match already exists at the given slot and
 * scheduled time. Used by matchService.createMatch as an application-layer guard against
 * double-booking (the partial unique index is the DB-level backstop).
 *
 * Decision Context:
 * - Why a date window instead of exact timestamp equality: scheduledAt is stored as
 *   timestamptz; comparing against a "YYYY-MM-DDTHH:mm:ss" string is timezone-sensitive.
 *   A slot maps to a single start time per calendar day, so "any non-cancelled match for
 *   this slot whose scheduledAt falls on this date" is an unambiguous, tz-robust check.
 * - Excludes 'cancelled' so a slot can be re-booked after a cancellation.
 * - Previously fixed bugs: player path (matchService.createMatch) had NO duplicate check,
 *   allowing N matches on the same slot+date. The club-admin path already guarded this.
 */
export async function hasActiveMatchAtSlotOnDate(
  clubSlotId: string,
  date: string, // YYYY-MM-DD
  client: SupabaseClient = supabase,
): Promise<boolean> {
  const { count, error } = await client
    .from('matches')
    .select('id', { count: 'exact', head: true })
    .eq('clubSlotId', clubSlotId)
    .neq('status', 'cancelled')
    .gte('scheduledAt', `${date}T00:00:00`)
    .lte('scheduledAt', `${date}T23:59:59`);

  if (error) {
    console.error(
      `[matchRepository.hasActiveMatchAtSlotOnDate] Supabase error slot=${clubSlotId} date=${date}:`,
      error.message,
    );
    throw new Error(error.message);
  }

  return (count ?? 0) > 0;
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
// scoreTeamA/scoreTeamB/winningTeam added once "registrar resultado" US is implemented.
const MATCH_HISTORY_COLUMNS = `
  id,
  description,
  "scheduledAt",
  format,
  "organizerId",
  "scoreTeamA",
  "scoreTeamB",
  "winningTeam"
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
  scoreTeamA: number | null;
  scoreTeamB: number | null;
  winningTeam: 'a' | 'b' | 'draw' | null;
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

// =====================================================
// Available Slots for Club Match Creation
// =====================================================

const AVAILABLE_SLOT_COLUMNS = `
  id,
  "courtId",
  "dayOfWeek",
  "startTime",
  "endTime",
  duration,
  "priceArs",
  "isBlocked",
  "isActive",
  "allowOnlineBooking"
`;

export interface AvailableSlotRow {
  id: string;
  courtId: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  duration: number;
  priceArs: number | null;
  isBlocked: boolean;
  isActive: boolean;
  allowOnlineBooking: boolean;
}

export interface SlotAvailabilityFilter {
  clubId: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  courtIds?: string[];
}

export interface SlotWithDate {
  slotId: string;
  courtId: string;
  courtName: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  duration: number;
  priceArs: number | null;
  date: string; // concrete YYYY-MM-DD for this occurrence
  scheduledAt: string; // ISO timestamp combining date + startTime
  hasMatch: boolean;
  allowOnlineBooking: boolean;
}

/**
 * Returns available slots for a club within a date range, annotated with
 * whether each date occurrence already has an active match.
 *
 * Decision Context:
 * - Why repository-level: joining slots × date range × existing matches is a multi-step
 *   operation. The service calls this then filters to find truly available slots.
 * - Two queries: (1) all active slots for the club; (2) existing non-cancelled matches
 *   in the date range. The service/caller is responsible for expanding weekly slots
 *   into concrete dates and filtering out already-matched occurrences.
 * - courtIds filter: optional; if omitted returns all courts.
 * - Previously fixed bugs: none relevant (new feature).
 */
export async function getClubSlotsAndMatches(
  filter: SlotAvailabilityFilter,
  client: SupabaseClient = supabase,
): Promise<{ slots: AvailableSlotRow[]; matchedSlotIds: Set<string> }> {
  // Query 1: active, non-blocked slots for the club
  let slotQuery = client
    .from('clubSlots')
    .select(AVAILABLE_SLOT_COLUMNS)
    .eq('clubId', filter.clubId)
    .eq('isActive', true)
    .eq('isBlocked', false);

  if (filter.courtIds?.length) {
    slotQuery = slotQuery.in('courtId', filter.courtIds);
  }

  const { data: slotsData, error: slotsError } = await slotQuery;
  if (slotsError) {
    console.error('[matchRepository.getClubSlotsAndMatches] slots error:', slotsError.message);
    throw new Error(slotsError.message);
  }

  // Query 2: existing non-cancelled matches in date range for this club
  const { data: matchesData, error: matchesError } = await client
    .from('matches')
    .select('clubSlotId, scheduledAt')
    .eq('clubId', filter.clubId)
    .neq('status', 'cancelled')
    .gte('scheduledAt', `${filter.startDate}T00:00:00Z`)
    .lte('scheduledAt', `${filter.endDate}T23:59:59Z`)
    .not('clubSlotId', 'is', null);

  if (matchesError) {
    console.error('[matchRepository.getClubSlotsAndMatches] matches error:', matchesError.message);
    throw new Error(matchesError.message);
  }

  // Build a set of slotIds that already have a match in the range
  const matchedSlotIds = new Set<string>(
    (matchesData ?? []).map((m) => (m as { clubSlotId: string }).clubSlotId),
  );

  return {
    slots: (slotsData ?? []) as AvailableSlotRow[],
    matchedSlotIds,
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
  cancelMatchWithReason,
  insertOrganizerAutoCancelNotification,
  removeParticipant,
  countParticipants,
  deleteMatch,
  createMatch,
  hasActiveMatchAtSlotOnDate,
  createMatchParticipant,
  getCompletedMatchesByUser,
  getClubSlotsAndMatches,
};
