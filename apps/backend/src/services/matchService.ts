/**
 * Match Service - Business logic for matches
 *
 * Decision Context:
 * - Why: Services own match-domain orchestration: validation, writes, cache invalidation,
 *   and small domain side effects such as system notifications tied to the same mutation.
 * - Caching: All read paths go through `cacheGetOrSet()` (egress-prevention rule). TTL is
 *   `DYNAMIC_DATA` (3 min) because match slots change frequently; single-match lookups use
 *   `SINGLE_ENTITY` (30 min). When mutations land that change match state, invalidate via
 *   `cacheDelete(CACHE_PREFIX.MATCHES_OPEN)` and `cacheDeletePattern(CACHE_PREFIX.MATCHES_LIST + ':*')`.
 * - Schema mapping: Supabase columns `description`, `scheduledAt`, `capacity` are mapped to
 *   GraphQL fields `title`, `startTime`, `totalSlots` because the DB schema predates the
 *   GraphQL contract. Keep this mapping in one place (`toMatchDTO`) so resolvers never see
 *   raw DB rows.
 * - Filter mapping: GraphQL enums (FIVE_VS_FIVE) are mapped to DB values (5v5) via lookup
 *   tables. This keeps the API clean while matching legacy DB schema.
 * - `availableSlots` on list rows = `capacity − matchParticipants(count)`. The repo selects
 *   the relation aggregate `matchParticipants(count)` so list cards render real availability
 *   without an N+1 fan-out on participants. Detail path uses the actual participant list
 *   (already loaded for the team rosters).
 * - `effectiveStatus()` collapses stale 'open'/'full' DB rows whose scheduledAt has passed
 *   into COMPLETED at presentation time. There is no scheduler that flips that column today,
 *   so without this override the list and detail page were rendering past matches as
 *   "Abierto" with a working "Sumarme" button.
 * - List ordering (`listMatches`): future + active (OPEN/FULL) sorted ASC by scheduledAt,
 *   then past/cancelled below sorted DESC (most-recent first). Active matches must dominate
 *   the first screen.
 * - Uses generated GraphQL `Match` type so schema changes break this file at build time.
 * - Geocoding backfill: clubs now store only the street address (lat/lng default to null).
 *   `enrichWithCoords()` runs inside the cache fetcher of every read path that exposes the
 *   club, geocoding missing addresses through Nominatim and persisting results back to the
 *   `clubs` table so subsequent requests skip both the network call and the DB update. This
 *   keeps the existing nullable lat/lng contract — failures (rate limits, unknown address)
 *   leave coords null and the map filters them out, same as before.
 * - Previously fixed bugs: removed ad-hoc console.log debugging that ran on every request —
 *   those were left from initial scaffolding and polluted prod logs.
 */

import { cacheDelete, cacheDeletePattern, cacheGetOrSet, CACHE_PREFIX, CACHE_TTL } from '../config/redis.js';
import {
  MatchFormat,
  MatchStatus,
  MatchTeam,
  MatchUserResult,
  type CreateMatchInput,
  type CreateMatchResult,
  type JoinMatchInput,
  type JoinMatchResult,
  type LeaveMatchInput,
  type LeaveMatchResult,
  type Match,
  type MatchFilters,
  type MatchHistoryConnection,
  type MatchHistoryItem,
} from '../graphql/generated/graphql.js';
import {
  matchRepository,
  type MatchDetailRow,
  type MatchWithClub,
  type MatchFilterOptions,
  type CompletedMatchRow,
} from '../repositories/matchRepository.js';
import { clubSlotRepository } from '../repositories/clubSlotRepository.js';
import { clubRepository } from '../repositories/clubRepository.js';
import { profileRepository } from '../repositories/profileRepository.js';
import { dateToDayOfWeek } from './clubService.js';
import { geocodeAddresses } from './geocodingService.js';
import type { ServiceContext } from '../types/context.js';

// =====================================================
// Enum Mapping (GraphQL <-> Database)
// =====================================================

/** Map GraphQL MatchFormat enum to DB values */
const FORMAT_TO_DB: Record<MatchFormat, string> = {
  [MatchFormat.FiveVsFive]: '5v5',
  [MatchFormat.SevenVsSeven]: '7v7',
  [MatchFormat.TenVsTen]: '10v10',
  [MatchFormat.ElevenVsEleven]: '11v11',
};

/** Map DB format values to GraphQL enum */
const DB_TO_FORMAT: Record<string, MatchFormat> = {
  '5v5': MatchFormat.FiveVsFive,
  '7v7': MatchFormat.SevenVsSeven,
  '10v10': MatchFormat.TenVsTen,
  '11v11': MatchFormat.ElevenVsEleven,
};

/** Map GraphQL MatchStatus enum to DB values */
const STATUS_TO_DB: Record<MatchStatus, string> = {
  [MatchStatus.Open]: 'open',
  [MatchStatus.Full]: 'full',
  [MatchStatus.InProgress]: 'in_progress',
  [MatchStatus.Completed]: 'completed',
  [MatchStatus.Cancelled]: 'cancelled',
};

/** Map DB status values to GraphQL enum */
const DB_TO_STATUS: Record<string, MatchStatus> = {
  open: MatchStatus.Open,
  full: MatchStatus.Full,
  in_progress: MatchStatus.InProgress,
  completed: MatchStatus.Completed,
  cancelled: MatchStatus.Cancelled,
};

// =====================================================
// Data Transformation (DB row -> GraphQL contract)
// =====================================================

/**
 * Decide the user-facing status for a match.
 *
 * Why: the DB transitions from 'open' → 'full' on the last join, but it never auto-flips
 * to 'completed' once the scheduled time passes — there is no scheduler doing that today.
 * The match detail and list previously rendered such past matches as "Abierto" with a
 * green "Sumarme" button, even though nobody could actually play them anymore. We override
 * those stale 'open'/'full' rows to COMPLETED here at presentation time so the contract
 * stays correct without needing a background job. CANCELLED, IN_PROGRESS, and explicit
 * COMPLETED rows are passed through untouched.
 */
function effectiveStatus(dbStatus: string, scheduledAt: string): MatchStatus {
  const mapped = DB_TO_STATUS[dbStatus] ?? MatchStatus.Open;
  if (mapped === MatchStatus.Open || mapped === MatchStatus.Full) {
    if (new Date(scheduledAt).getTime() < Date.now()) {
      return MatchStatus.Completed;
    }
  }
  return mapped;
}

function toMatch(row: MatchWithClub): Match {
  // PostgREST returns matchParticipants(count) as a single-element array `[{ count: N }]`.
  // Older cached rows (pre-fix) may not have this field — default to 0 then so the UI
  // doesn't show NaN until the cache rolls over (3-min TTL).
  const participantCount = row.matchParticipants?.[0]?.count ?? 0;
  return {
    id: row.id,
    title: row.description ?? 'Partido sin título',
    startTime: row.scheduledAt,
    format: DB_TO_FORMAT[row.format] ?? MatchFormat.FiveVsFive,
    totalSlots: row.capacity,
    availableSlots: Math.max(0, row.capacity - participantCount),
    status: effectiveStatus(row.status, row.scheduledAt),
    createdAt: row.createdAt,
    club: row.clubs
      ? {
          id: row.clubs.id,
          name: row.clubs.name,
          zone: row.clubs.zone ?? null,
          address: row.clubs.address ?? null,
          lat: row.clubs.lat ?? null,
          lng: row.clubs.lng ?? null,
          imageUrl: row.clubs.imageUrl ?? null,
          // phone is not fetched by CLUB_COLUMNS (list path) — omitted intentionally.
        }
      : null,
  };
}

/**
 * Backfill missing club coordinates by geocoding the stored address and persisting
 * the result back to the `clubs` table.
 *
 * Decision Context:
 * - Why here: the matches list is the canonical surface where pins are rendered. Doing
 *   the lookup inside the cache fetcher means the enriched row is what gets cached, so
 *   subsequent requests skip both the network call AND the DB update.
 * - Why mutate in place: the rows are about to be cached and then mapped to GraphQL —
 *   mutating `row.clubs.lat/lng` keeps the existing toMatch() pipeline unchanged.
 * - Dedup: clubs that share an address (or appear in multiple matches in the same list)
 *   resolve to one Nominatim call via geocodeAddresses().
 * - Best-effort: any failure (network down, Nominatim 503, persist error) leaves
 *   lat/lng null. The map already filters those clubs out, so the worst case is a
 *   missing pin — never a 500 on the matches list.
 * - Egress: we update at most once per club because we only call this when lat/lng are
 *   null. After persistence, future cache misses fetch coords directly from Postgres.
 * - Previously fixed bugs: none relevant.
 */
async function enrichWithCoords<T extends { clubs: { id: string; address: string | null; lat: number | null; lng: number | null } | null }>(
  rows: T[],
): Promise<T[]> {
  const targets = rows
    .map((r) => r.clubs)
    .filter(
      (c): c is NonNullable<T['clubs']> =>
        c !== null && c.lat == null && c.lng == null && !!c.address,
    );

  if (targets.length === 0) return rows;

  const addresses = targets.map((c) => c.address as string);
  const coordsByAddress = await geocodeAddresses(addresses);

  // Track unique clubIds we've persisted in this call to avoid duplicate UPDATEs when
  // the same club appears in many list rows.
  const persisted = new Set<string>();

  for (const row of rows) {
    const club = row.clubs;
    if (!club || club.lat != null || club.lng != null || !club.address) continue;

    const coords = coordsByAddress.get(club.address);
    if (!coords) continue;

    club.lat = coords.lat;
    club.lng = coords.lng;

    if (!persisted.has(club.id)) {
      persisted.add(club.id);
      // Fire-and-await: we already have the coords; the persist is best-effort and
      // logs internally on failure so it's safe to await without try/catch here.
      await clubRepository.updateClubCoords(club.id, coords.lat, coords.lng);
    }
  }

  return rows;
}

/**
 * Convert GraphQL filters to repository filter options.
 *
 * Decision Context:
 * - `onlyMine` (boolean) is resolved against the authenticated `userId` here so the
 *   repository receives a concrete `participantUserId` string. This indirection ensures
 *   anonymous callers cannot enumerate other players' history — the flag is silently
 *   ignored when no userId is available.
 * - We deliberately do NOT trust a client-supplied user id; the only source of truth is
 *   the resolver's `requireAuth` / `ctx.user.id`.
 * - CANCELLED privacy scoping: cancelled matches are private — a user may only ever see
 *   cancelled matches they participated in or organized, never another player's. So when the
 *   resolved status is 'cancelled' we FORCE `participantUserId = userId` regardless of the
 *   `onlyMine` flag. For anonymous callers (no userId) there is no one to scope to, so
 *   `listMatches` short-circuits to an empty list (see the guard there). This is the single
 *   server-side guard that prevents cancelled-match enumeration via the public list path.
 */
function toFilterOptions(
  filters?: MatchFilters | null,
  userId?: string,
): MatchFilterOptions {
  if (!filters) return { status: 'open' };

  const status = filters.status ? STATUS_TO_DB[filters.status] : 'open';
  const scopeToSelf = status === 'cancelled' || Boolean(filters.onlyMine);

  return {
    status,
    format: filters.format ? FORMAT_TO_DB[filters.format] : undefined,
    zone: filters.zone ?? undefined,
    dateFrom: filters.dateFrom ?? undefined,
    dateTo: filters.dateTo ?? undefined,
    search: filters.search ?? undefined,
    participantUserId: scopeToSelf && userId ? userId : undefined,
  };
}

/**
 * Generate cache key from filters.
 *
 * Decision Context:
 * - `participantUserId` enters the key when present so two users with different
 *   "Solo los míos" results never collide on a shared cache slot. The non-mine path
 *   keeps its previous global key, so the public listing still benefits from a single
 *   shared cache entry across all anonymous and authenticated callers.
 */
function getFiltersCacheKey(filters: MatchFilterOptions): string {
  const parts = [
    `status:${filters.status || 'open'}`,
    filters.format ? `format:${filters.format}` : '',
    filters.zone ? `zone:${filters.zone}` : '',
    filters.dateFrom ? `from:${filters.dateFrom}` : '',
    filters.dateTo ? `to:${filters.dateTo}` : '',
    filters.search ? `search:${filters.search}` : '',
    filters.participantUserId ? `mine:${filters.participantUserId}` : '',
  ].filter(Boolean);

  return `${CACHE_PREFIX.MATCHES_LIST}:${parts.join('|')}`;
}

// =====================================================
// Service Functions
// =====================================================

/**
 * List matches with filters. Public endpoint - no auth required.
 *
 * Decision Context:
 * - Why: Central entry point for match listing with any combination of filters.
 * - Caching: Uses dynamic cache key based on filter combination.
 * - Previously fixed bugs: none relevant.
 */
export async function listMatches(
  ctx: ServiceContext,
  filters?: MatchFilters | null,
): Promise<Match[]> {
  const filterOptions = toFilterOptions(filters, ctx.userId);

  // CANCELLED privacy guard: cancelled matches are only ever visible to a user who was tied
  // to them. toFilterOptions forces participantUserId for the cancelled status; if the caller
  // is anonymous there is no scope to apply, so return empty rather than leaking every
  // cancelled match. (See toFilterOptions Decision Context.)
  if (filterOptions.status === 'cancelled' && !filterOptions.participantUserId) {
    return [];
  }

  const cacheKey = getFiltersCacheKey(filterOptions);

  const matches = await cacheGetOrSet<MatchWithClub[]>(
    cacheKey,
    async () => {
      const rows = await matchRepository.getMatchesWithFilters(filterOptions);
      // Geocode + persist coords for clubs missing lat/lng so map pins render.
      // Runs inside the cache fetcher so the enriched rows are what get cached.
      return enrichWithCoords(rows);
    },
    CACHE_TTL.DYNAMIC_DATA,
  );

  // Prioritize active matches (still joinable, in the future) over past/cancelled ones.
  //
  // Decision Context:
  // - Why: a stale 'open' DB row whose scheduledAt is in the past is rendered as COMPLETED
  //   by toMatch (see effectiveStatus). Without this sort it would still appear at the top
  //   of the list ordered by scheduledAt ASC, displacing real upcoming matches. The user
  //   reported this as a UX bug — old games drowning out the active ones.
  // - Sort key: (isActive desc, scheduledAt asc-for-active / desc-for-past). Active matches
  //   are ordered soonest-first; past matches are ordered most-recent-first so users still
  //   see context but they sit at the bottom of the list.
  const mapped = matches.map(toMatch);
  return mapped.sort((a, b) => {
    const aActive = a.status === MatchStatus.Open || a.status === MatchStatus.Full;
    const bActive = b.status === MatchStatus.Open || b.status === MatchStatus.Full;
    if (aActive !== bActive) return aActive ? -1 : 1;
    const aTime = new Date(a.startTime).getTime();
    const bTime = new Date(b.startTime).getTime();
    return aActive ? aTime - bTime : bTime - aTime;
  });
}

/**
 * List open matches. Public endpoint - no auth required.
 */
export async function listOpenMatches(_ctx: ServiceContext): Promise<Match[]> {
  return listMatches(_ctx, { status: MatchStatus.Open });
}

/**
 * List matches by status.
 */
export async function listMatchesByStatus(_ctx: ServiceContext, status: string): Promise<Match[]> {
  const gqlStatus = DB_TO_STATUS[status] ?? MatchStatus.Open;
  return listMatches(_ctx, { status: gqlStatus });
}

/**
 * Get a single match by id.
 */
export async function getMatchById(_ctx: ServiceContext, id: string): Promise<Match | null> {
  const cacheKey = `${CACHE_PREFIX.MATCH_DETAIL}${id}`;
  const match = await cacheGetOrSet<MatchWithClub | null>(
    cacheKey,
    async () => {
      const row = await matchRepository.getMatchById(id);
      if (!row) return null;
      const [enriched] = await enrichWithCoords([row]);
      return enriched ?? row;
    },
    CACHE_TTL.SINGLE_ENTITY,
  );
  return match ? toMatch(match) : null;
}

// =====================================================
// Match Detail (with participants)
// =====================================================

/**
 * Convert a MatchDetailRow (with participant list) to the GraphQL Match type.
 * Computes per-team counts, available spots, and auth-context flags.
 *
 * Decision Context:
 * - Why separate from toMatch(): toMatch() handles the cheap list-query path (no participants).
 *   This variant is only called for single-match detail and after joinMatch. Keeping them
 *   separate prevents accidental participant loading on list queries.
 * - userId is optional — when null (unauthenticated), isCurrentUserJoined = false, canJoin = false.
 * - canJoin does NOT check player role: that check belongs in the joinMatch mutation so the
 *   flag stays accurate even before the user authenticates. The mutation enforces role server-side.
 * - canJoin requires !!userId so unauthenticated callers always get false (P2 audit fix).
 *   Without this, open matches with available spots returned canJoin=true for anonymous users,
 *   which was semantically incorrect per the field's documented contract.
 * - Previously fixed bugs:
 *   - canJoin returned true for unauthenticated users — fixed by adding !!userId guard.
 */
function toMatchDetail(row: MatchDetailRow, userId?: string): Match {
  const teamA = row.matchParticipants
    .filter((p) => p.team === 'a')
    .map((p) => ({
      id: p.profiles.id,
      displayName: p.profiles.displayName,
      avatarUrl: p.profiles.avatarUrl ?? null,
      preferredPosition: p.profiles.preferredPosition ?? null,
      division: p.profiles.division,
    }));

  const teamB = row.matchParticipants
    .filter((p) => p.team === 'b')
    .map((p) => ({
      id: p.profiles.id,
      displayName: p.profiles.displayName,
      avatarUrl: p.profiles.avatarUrl ?? null,
      preferredPosition: p.profiles.preferredPosition ?? null,
      division: p.profiles.division,
    }));

  const spotsPerTeam = Math.floor(row.capacity / 2);
  const totalCount = teamA.length + teamB.length;
  const isCurrentUserJoined = userId
    ? row.matchParticipants.some((p) => p.profiles.id === userId)
    : false;

  const userParticipant = userId
    ? row.matchParticipants.find((p) => p.profiles.id === userId)
    : null;
  const currentUserTeam = userParticipant
    ? (userParticipant.team === 'a' ? MatchTeam.A : MatchTeam.B)
    : null;

  // effectiveStatus collapses stale 'open'/'full' DB rows whose scheduledAt has already
  // passed into COMPLETED — see the helper docstring. canJoin must mirror that override
  // so the detail page never shows a join button for a match that is effectively over.
  const status = effectiveStatus(row.status, row.scheduledAt);
  const isPlayable = status === MatchStatus.Open;

  return {
    id: row.id,
    title: row.description ?? 'Partido sin título',
    startTime: row.scheduledAt,
    // durationMin powers the frontend end-of-match gate; null falls back to 60 client-side.
    durationMin: row.durationMin ?? null,
    format: DB_TO_FORMAT[row.format] ?? MatchFormat.FiveVsFive,
    totalSlots: row.capacity,
    availableSlots: Math.max(0, row.capacity - totalCount),
    status,
    createdAt: row.createdAt,
    description: row.description ?? null,
    organizerId: row.organizerId ?? null,
    currentUserTeam,
    club: row.clubs
      ? {
          id: row.clubs.id,
          name: row.clubs.name,
          zone: row.clubs.zone ?? null,
          address: row.clubs.address ?? null,
          lat: row.clubs.lat ?? null,
          lng: row.clubs.lng ?? null,
          phone: row.clubs.phone ?? null,
          imageUrl: row.clubs.imageUrl ?? null,
        }
      : null,
    participants: {
      teamA,
      teamB,
      teamACount: teamA.length,
      teamBCount: teamB.length,
      totalCount,
      spotsLeftA: Math.max(0, spotsPerTeam - teamA.length),
      spotsLeftB: Math.max(0, spotsPerTeam - teamB.length),
    },
    isCurrentUserJoined,
    canJoin: !!userId && isPlayable && !isCurrentUserJoined && totalCount < row.capacity,
    organizedByClub: row.organizedByClub ?? false,
  };
}

/**
 * Get a single match with participant data (for the detail page).
 * Caches the raw DB row separately from the basic match cache so the
 * list queries continue using the lightweight MATCH_DETAIL cache.
 */
export async function getMatchDetail(ctx: ServiceContext, id: string): Promise<Match | null> {
  const cacheKey = `${CACHE_PREFIX.MATCH_PARTICIPANTS}${id}`;

  const row = await cacheGetOrSet<MatchDetailRow | null>(
    cacheKey,
    async () => {
      const fetched = await matchRepository.getMatchWithParticipants(id);
      if (!fetched) return null;
      const [enriched] = await enrichWithCoords([fetched]);
      return enriched ?? fetched;
    },
    CACHE_TTL.DYNAMIC_DATA,
  );

  if (!row) return null;
  return toMatchDetail(row, ctx.userId);
}

// =====================================================
// joinMatch
// =====================================================

/**
 * Join a match as a player.
 *
 * Decision Context:
 * - Validation order (fail-fast):
 *   1. Auth check — userId and user-scoped client must be present.
 *   2. Role check — only players (not club_admin) can join matches.
 *   3. Match existence — return clear 404-style error if not found.
 *   4. Status check — only 'open' matches accept new participants.
 *   5. Duplicate check — UNIQUE constraint in DB is the final guard, but we check
 *      explicitly here to return a friendly message instead of a DB error.
 *   6. Team capacity check — capacity/2 spots per team.
 *   7. INSERT — uses user-scoped client so RLS (playerId = auth.uid()) is enforced.
 *   8. Full check — if (existing + 1) === capacity, update status to 'full' via service role.
 *   9. Cache invalidation — both participant cache and list caches are cleared.
 *  10. Return updated match detail for immediate UI re-render.
 * - Race condition: two simultaneous requests can pass the capacity check before either
 *   inserts. The UNIQUE(matchId, playerId) constraint prevents double-joins for the same
 *   player; the capacity check is eventually-consistent (at most 1 over-quota in a burst).
 *   A future improvement could use a DB transaction + advisory lock.
 * - Previously fixed bugs: none relevant.
 */
export async function joinMatch(
  input: JoinMatchInput,
  ctx: ServiceContext,
): Promise<JoinMatchResult> {
  if (!ctx.userId) throw new Error('Authentication required');
  const db = ctx.supabase;
  if (!db) throw new Error('User-scoped client required for write operations');

  // 1. Role check
  const profile = await profileRepository.getProfileById(ctx.userId);
  if (!profile) throw new Error('Perfil no encontrado');
  if (profile.role !== 'player') {
    throw new Error('Solo los jugadores pueden sumarse a partidos');
  }

  // 2. Fetch match with current participants (service-role read is fine here)
  const matchRow = await matchRepository.getMatchWithParticipants(input.matchId);
  if (!matchRow) throw new Error('Partido no encontrado');

  // 3. Status check
  if (matchRow.status !== 'open') {
    throw new Error('El partido ya no acepta inscripciones');
  }

  // 4. Duplicate check
  const alreadyJoined = matchRow.matchParticipants.some((p) => p.profiles.id === ctx.userId);
  if (alreadyJoined) throw new Error('Ya estás inscripto en este partido');

  // 5. Team capacity check
  const spotsPerTeam = Math.floor(matchRow.capacity / 2);
  const dbTeam = input.team === MatchTeam.A ? 'a' : 'b';
  const teamCount = matchRow.matchParticipants.filter((p) => p.team === dbTeam).length;
  if (teamCount >= spotsPerTeam) {
    const teamLabel = input.team === MatchTeam.A ? 'A' : 'B';
    throw new Error(`No hay cupos disponibles en el Equipo ${teamLabel}`);
  }

  // 6. Insert participant (user-scoped → RLS: playerId = auth.uid())
  await matchRepository.createMatchParticipant(input.matchId, ctx.userId, dbTeam, db);
  console.info(
    `[matchService.joinMatch] userId=${ctx.userId} joined matchId=${input.matchId} team=${dbTeam}`,
  );

  // 7. If now full, update match status (service-role — see repository comment)
  const totalAfterJoin = matchRow.matchParticipants.length + 1;
  if (totalAfterJoin >= matchRow.capacity) {
    await matchRepository.updateMatchStatus(input.matchId, 'full');
    await cacheDelete(CACHE_PREFIX.MATCHES_OPEN);
    await cacheDeletePattern(`${CACHE_PREFIX.MATCHES_LIST}:*`);
    console.info(`[matchService.joinMatch] matchId=${input.matchId} is now full`);
  }

  // 8. Invalidate participant + detail caches
  await cacheDelete(`${CACHE_PREFIX.MATCH_PARTICIPANTS}${input.matchId}`);
  await cacheDelete(`${CACHE_PREFIX.MATCH_DETAIL}${input.matchId}`);

  // 9. Return updated match with participants
  const updatedMatch = await getMatchDetail({ userId: ctx.userId }, input.matchId);
  return { success: true, message: null, match: updatedMatch ?? null };
}

// =====================================================
// leaveMatch
// =====================================================

/** Basic UUID format check — avoids a round-trip for obviously invalid IDs. */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Leave a match as a player, with optional auto-cancellation when the last participant exits.
 *
 * Decision Context:
 * - Validation order (fail-fast):
 *   1. Auth + user-scoped client — user identity and RLS client must both be present.
 *   2. UUID format — catch malformed IDs before a DB round-trip (Spanish error message).
 *   3. Match existence — clear 404-style message.
 *   4. Status check — 'cancelled' matches block further participant changes to preserve
 *      audit history. 'completed', 'in_progress', 'full', and 'open' matches allow leaving:
 *      leaving a 'full' match re-opens it, which is intentional (frees a spot).
 *   5. Membership check — explicit "not enrolled" error instead of a silent 0-row DELETE.
 *   6. DELETE via user-scoped client — RLS enforces auth.uid() = playerId.
 *   7. Count remaining participants.
 *   8. If 0 → cancelMatchWithReason() via service-role, notify organizer, invalidate list caches.
 *   9. If was 'full' → updateMatchStatus('open') via service-role + invalidate list caches.
 *  10. Invalidate participant + detail caches regardless.
 *  11. Return { match: cancelled/updatedMatch, matchDeleted: false }.
 *
 * Caso A — organizador se sale:
 *   The match keeps the organizerId FK pointing to the player who left, but they no longer
 *   appear in matchParticipants. This is intentional: removing organizerId would require a
 *   schema migration or a "transfer organizer" flow that is out of scope for this US.
 *   The match remains playable; the organizerId is used for UPDATE RLS only.
 *
 * Caso B — último participante:
 *   countParticipants() reads after the DELETE to get the authoritative count.
 *   Race condition: two players leaving simultaneously when each is the last would both
 *   read count=0; the status UPDATE is idempotent enough for the user-facing state, and the
 *   match remains preserved as cancelled rather than being deleted.
 *
 * Caso C — partido full → open:
 *   The service-role update is required because the organizer-scoped RLS UPDATE policy
 *   would reject updates by a non-organizer player.
 *
 * Caso D — menos de 1 hora para el partido:
 *   Not blocked server-side — the UI shows a warning dialog but leaving is always allowed.
 *   Blocking at the API level would require timezone-aware slot queries that are out of scope.
 *
 * Previously fixed bugs: none relevant.
 */
export async function leaveMatch(
  input: LeaveMatchInput,
  ctx: ServiceContext,
): Promise<LeaveMatchResult> {
  if (!ctx.userId) throw new Error('Authentication required');
  const db = ctx.supabase;
  if (!db) throw new Error('User-scoped client required for write operations');

  // 1. UUID validation
  if (!UUID_REGEX.test(input.matchId)) {
    throw new Error('ID de partido inválido');
  }

  // 2. Fetch match with participants
  const matchRow = await matchRepository.getMatchWithParticipants(input.matchId);
  if (!matchRow) throw new Error('Partido no encontrado');

  // 3. Status check — cancelled matches are locked
  if (matchRow.status === 'cancelled') {
    throw new Error('El partido ya fue cancelado');
  }

  // 4. Membership check — must be enrolled before we can leave
  const isEnrolled = matchRow.matchParticipants.some((p) => p.profiles.id === ctx.userId);
  if (!isEnrolled) {
    throw new Error('No estás inscripto en este partido');
  }

  const wasFull = matchRow.status === 'full';

  // 5. DELETE participant (user-scoped → RLS: auth.uid() = playerId)
  await matchRepository.removeParticipant(input.matchId, ctx.userId, db);
  console.info(
    `[matchService.leaveMatch] userId=${ctx.userId} left matchId=${input.matchId}`,
  );

  // 6. Count remaining participants
  const remaining = await matchRepository.countParticipants(input.matchId);

  // 7. Auto-cancel if no participants left (Caso B)
  if (remaining === 0) {
    await matchRepository.cancelMatchWithReason(
      input.matchId,
      'Cancelado automaticamente porque no quedan jugadores anotados',
    );
    await matchRepository.insertOrganizerAutoCancelNotification(
      matchRow.organizerId,
      input.matchId,
    );
    await cacheDelete(`${CACHE_PREFIX.MATCH_PARTICIPANTS}${input.matchId}`);
    await cacheDelete(`${CACHE_PREFIX.MATCH_DETAIL}${input.matchId}`);
    await cacheDelete(CACHE_PREFIX.MATCHES_OPEN);
    await cacheDeletePattern(`${CACHE_PREFIX.MATCHES_LIST}:*`);
    console.info(
      `[matchService.leaveMatch] matchId=${input.matchId} auto-cancelled (0 participants)`,
    );
    const cancelledMatch = await getMatchDetail({ userId: ctx.userId }, input.matchId);
    return { match: cancelledMatch ?? null, matchDeleted: false };
  }

  // 8. Re-open if was full (Caso C)
  if (wasFull) {
    await matchRepository.updateMatchStatus(input.matchId, 'open');
    await cacheDelete(CACHE_PREFIX.MATCHES_OPEN);
    await cacheDeletePattern(`${CACHE_PREFIX.MATCHES_LIST}:*`);
    console.info(
      `[matchService.leaveMatch] matchId=${input.matchId} re-opened (was full, now ${remaining} participants)`,
    );
  }

  // 9. Invalidate participant + detail caches
  await cacheDelete(`${CACHE_PREFIX.MATCH_PARTICIPANTS}${input.matchId}`);
  await cacheDelete(`${CACHE_PREFIX.MATCH_DETAIL}${input.matchId}`);

  // 10. Return updated match
  const updatedMatch = await getMatchDetail({ userId: ctx.userId }, input.matchId);
  return { match: updatedMatch ?? null, matchDeleted: false };
}

// =====================================================
// Format Validation Helpers
// =====================================================

/** Numeric ordering for format comparison (lower = smaller pitch) */
const FORMAT_ORDER: Record<string, number> = {
  '5v5': 1,
  '7v7': 2,
  '10v10': 3,
  '11v11': 4,
};

/** Default capacity per format (both teams combined) */
const FORMAT_CAPACITY: Record<MatchFormat, number> = {
  [MatchFormat.FiveVsFive]: 10,
  [MatchFormat.SevenVsSeven]: 14,
  [MatchFormat.TenVsTen]: 20,
  [MatchFormat.ElevenVsEleven]: 22,
};

// =====================================================
// createMatch
// =====================================================

/**
 * Create a new match and register the organizer as the first participant (team A).
 *
 * Decision Context:
 * - Why: Central service function orchestrates all business-rule checks before any write
 *   so that no partial state is committed when a validation fails.
 * - Validation order (fail-fast):
 *   1. Role check — profile must be 'player' (fetched with service-role client to avoid
 *      an extra RLS policy on profile reads).
 *   2. Slot check — slot must exist and not be blocked (re-validated at write time to
 *      guard against the race condition where the slot was open during the list query
 *      but gets blocked before the mutation).
 *   3. Court/format check — the chosen format must fit the court's maxFormat.
 *   4. Capacity check — must be >= 2 and <= the format's maximum.
 *   5. Date/day check — the given date's day of week must match the slot's dayOfWeek.
 * - scheduledAt is computed as "${date}T${startTime}" — the DB interprets this in its
 *   configured timezone. For a future improvement, append the club's explicit UTC offset.
 * - Cache invalidation: the open-match list is invalidated so the new match appears
 *   immediately in the /partidos listing.
 * - Uses ctx.supabase (user-scoped) for writes so RLS policies on matches and
 *   matchParticipants can verify auth.uid() == organizerId / playerId.
 * - Previously fixed bugs: none relevant.
 */
export async function createMatch(
  input: CreateMatchInput,
  ctx: ServiceContext,
): Promise<CreateMatchResult> {
  if (!ctx.userId) {
    throw new Error('Authentication required');
  }

  const db = ctx.supabase;
  if (!db) throw new Error('User-scoped client required for write operations');

  // 1. Role check: only players can create matches
  const profile = await profileRepository.getProfileById(ctx.userId);
  if (!profile) throw new Error('Perfil no encontrado');
  if (profile.role !== 'player') {
    throw new Error('Solo los jugadores pueden crear partidos');
  }

  // 2. Slot check (re-validated at write time for race-condition safety)
  // Decision Context:
  // - isActive=false means the slot was soft-deleted by the club admin; players must not
  //   be able to book it even if they know the UUID (prevents stale deep-links).
  // - allowOnlineBooking=false is the club admin's flag to restrict online booking (e.g.
  //   phone-only reservations). The player-facing API filters these out, but a direct API
  //   call with the slotId must also be blocked here as defense-in-depth (P3+P4 audit fix).
  // - Previously fixed bugs: isActive and allowOnlineBooking were not checked, allowing
  //   soft-deleted or phone-only slots to accept matches via direct API calls.
  const slot = await clubSlotRepository.getSlotById(input.slotId);
  if (!slot) throw new Error('El horario seleccionado no existe');
  if (!slot.isActive) throw new Error('El horario fue eliminado y no está disponible.');
  if (slot.isBlocked) throw new Error('El horario ya está bloqueado. Elegí otro horario.');
  if (!slot.allowOnlineBooking) {
    throw new Error('Este horario no permite reservas online. Contactá al club para reservar.');
  }
  if (slot.clubId !== input.clubId) {
    throw new Error('El horario no pertenece al club seleccionado');
  }
  if (slot.courtId !== input.courtId) {
    throw new Error('La cancha no corresponde al horario seleccionado');
  }

  // 3. Format compatibility check
  const dbFormat = FORMAT_TO_DB[input.format];
  if (!dbFormat) throw new Error('Formato de partido inválido');

  const courtMaxFormat = slot.courts.maxFormat;
  if ((FORMAT_ORDER[dbFormat] ?? 0) > (FORMAT_ORDER[courtMaxFormat] ?? 0)) {
    throw new Error(
      `Esta cancha soporta hasta ${courtMaxFormat}. El formato ${dbFormat} no es compatible.`,
    );
  }

  // 4. Capacity check
  const maxCapacity = FORMAT_CAPACITY[input.format];
  if (input.capacity < 2 || input.capacity > maxCapacity) {
    throw new Error(
      `La capacidad para ${dbFormat} debe estar entre 2 y ${maxCapacity} jugadores.`,
    );
  }

  // 5. Date/day-of-week check (guard against frontend sending mismatched date)
  const expectedDay = dateToDayOfWeek(input.date);
  if (slot.dayOfWeek !== expectedDay) {
    throw new Error(
      `El horario seleccionado es para ${slot.dayOfWeek}, pero la fecha elegida es ${expectedDay}`,
    );
  }

  // 5b. Double-booking guard: reject if an active match already exists at this slot+date.
  // Decision Context:
  // - Why: a clubSlot is a recurring weekly template; booking it for a date must be exclusive.
  //   isBlocked alone did NOT prevent a second player from booking the same slot+date, so the
  //   same physical court/time could be sold twice. The club-admin path already guarded this;
  //   the player path did not (the bug this fixes).
  // - Defense-in-depth: the DB partial unique index "matches_active_slot_schedule_unique" is the
  //   authoritative backstop (handles the race between this check and the insert); this app-layer
  //   check produces a clean message in the common case.
  // - Previously fixed bugs: player createMatch allowed N matches on one slot+date.
  const alreadyBooked = await matchRepository.hasActiveMatchAtSlotOnDate(input.slotId, input.date, db);
  if (alreadyBooked) {
    throw new Error('Ya existe un partido en este horario para esa fecha');
  }

  // 6. Compute scheduledAt = "YYYY-MM-DDTHH:MM:SS"
  const scheduledAt = `${input.date}T${slot.startTime}`;

  // 7. Insert match (user-scoped client enforces INSERT RLS: organizerId = auth.uid())
  console.info(
    `[matchService.createMatch] userId=${ctx.userId} format=${dbFormat} scheduledAt=${scheduledAt}`,
  );

  const newMatch = await matchRepository.createMatch(
    {
      organizerId: ctx.userId,
      clubId: input.clubId,
      courtId: input.courtId,
      clubSlotId: input.slotId,
      format: dbFormat,
      capacity: input.capacity,
      scheduledAt,
      description: input.description,
    },
    db,
  );

  // 8. Register organizer as first participant on team A
  await matchRepository.createMatchParticipant(newMatch.id, ctx.userId, 'a', db);

  console.info(`[matchService.createMatch] Match created matchId=${newMatch.id}`);

  // 9. Invalidate open match list cache so new match is visible immediately
  await cacheDelete(CACHE_PREFIX.MATCHES_OPEN);
  await cacheDeletePattern(`${CACHE_PREFIX.MATCHES_LIST}:*`);

  return { success: true, matchId: newMatch.id, message: null };
}

// =====================================================
// Match History
// =====================================================

/**
 * Convert a completed-match DB row into a MatchHistoryItem GraphQL type.
 *
 * Decision Context:
 * - userResult is derived from winningTeam vs the player's team:
 *     WON  → winningTeam === userTeam (lowercase)
 *     LOST → winningTeam is the other team
 *     DRAW → winningTeam === 'draw'
 *     PENDING → winningTeam is null (result not yet confirmed)
 * - scoreA/scoreB map from DB scoreTeamA/scoreTeamB (null until result is confirmed).
 * - isOrganizer is derived from `row.organizerId === userId` (no extra DB round-trip).
 * - matchParticipants[0] always exists because getCompletedMatchesByUser uses !inner
 *   join filtered by playerId — guarantees exactly one participant entry per row.
 * - Previously fixed bugs: scoreA/scoreB were always null before "registrar resultado" US.
 */
function toMatchHistoryItem(row: CompletedMatchRow, userId: string): MatchHistoryItem {
  const userTeam = row.matchParticipants[0]?.team === 'a' ? 'A' : 'B';

  let userResult: MatchUserResult = MatchUserResult.Pending;
  if (row.winningTeam) {
    if (row.winningTeam === 'draw') {
      userResult = MatchUserResult.Draw;
    } else if (row.winningTeam === userTeam.toLowerCase()) {
      userResult = MatchUserResult.Won;
    } else {
      userResult = MatchUserResult.Lost;
    }
  }

  return {
    id: row.id,
    title: row.description ?? 'Partido sin título',
    startTime: row.scheduledAt,
    format: DB_TO_FORMAT[row.format] ?? MatchFormat.FiveVsFive,
    club: row.clubs
      ? { id: row.clubs.id, name: row.clubs.name, zone: row.clubs.zone ?? null }
      : null,
    userTeam,
    userResult,
    scoreA: row.scoreTeamA ?? null,
    scoreB: row.scoreTeamB ?? null,
    isOrganizer: row.organizerId === userId,
  };
}

/**
 * Return the authenticated player's completed match history, paginated.
 *
 * Decision Context:
 * - Caching: keyed by userId + page + pageSize with USER_DATA TTL (5 min).
 *   Per-user key prevents cross-user cache pollution. The 5-min TTL balances
 *   freshness (match completions happen infrequently) against repeated queries.
 * - Cache invalidation: currently not wired to the "completed" transition because
 *   there is no explicit "mark completed" mutation yet. When that mutation is added,
 *   invalidate `${CACHE_PREFIX.USER_MATCHES}${userId}*` for all participants.
 * - hasMore: computed as offset + pageSize < total, which is the total count of
 *   ALL matching rows returned by the count query (pre-pagination).
 * - Previously fixed bugs: none relevant.
 */
export async function getMyMatches(
  ctx: ServiceContext,
  page: number,
  pageSize: number,
): Promise<MatchHistoryConnection> {
  if (!ctx.userId) throw new Error('Authentication required');

  const offset = (page - 1) * pageSize;
  const cacheKey = `${CACHE_PREFIX.USER_MATCHES}${ctx.userId}:page:${page}:size:${pageSize}`;
  const userId = ctx.userId;

  return cacheGetOrSet(
    cacheKey,
    async () => {
      const result = await matchRepository.getCompletedMatchesByUser(userId, page, pageSize);
      const items = result.rows.map((row) => toMatchHistoryItem(row, userId));
      return {
        items,
        total: result.total,
        page,
        pageSize,
        hasMore: offset + pageSize < result.total,
      };
    },
    CACHE_TTL.USER_DATA,
  );
}

export const matchService = {
  listMatches,
  listOpenMatches,
  listMatchesByStatus,
  getMatchById,
  getMatchDetail,
  joinMatch,
  leaveMatch,
  createMatch,
  getMyMatches,
};
