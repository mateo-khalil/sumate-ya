/**
 * Match Service - Business logic for matches
 *
 * Decision Context:
 * - Why: Services return data only (no side effects) per backend.md rules. Side effects
 *   (broadcasts, notifications) must stay in resolvers, not here.
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
 * - `availableSlots` is currently `capacity` — participant counting is a TODO that requires
 *   joining `matchPlayers`. Do NOT ship join logic without adding RLS policies for that table.
 * - Uses generated GraphQL `Match` type so schema changes break this file at build time.
 * - Previously fixed bugs: removed ad-hoc console.log debugging that ran on every request —
 *   those were left from initial scaffolding and polluted prod logs.
 */

import { cacheDelete, cacheDeletePattern, cacheGetOrSet, CACHE_PREFIX, CACHE_TTL } from '../config/redis.js';
import {
  MatchFormat,
  MatchStatus,
  MatchTeam,
  type CreateMatchInput,
  type CreateMatchResult,
  type JoinMatchInput,
  type JoinMatchResult,
  type Match,
  type MatchFilters,
} from '../graphql/generated/graphql.js';
import {
  matchRepository,
  type MatchDetailRow,
  type MatchWithClub,
  type MatchFilterOptions,
} from '../repositories/matchRepository.js';
import { clubSlotRepository } from '../repositories/clubSlotRepository.js';
import { profileRepository } from '../repositories/profileRepository.js';
import { dateToDayOfWeek } from './clubService.js';
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

function toMatch(row: MatchWithClub): Match {
  return {
    id: row.id,
    title: row.description ?? 'Partido sin título',
    startTime: row.scheduledAt,
    format: DB_TO_FORMAT[row.format] ?? MatchFormat.FiveVsFive,
    totalSlots: row.capacity,
    // TODO: subtract `matchPlayers` count once participants are modelled
    availableSlots: row.capacity,
    status: DB_TO_STATUS[row.status] ?? MatchStatus.Open,
    createdAt: row.createdAt,
    club: row.clubs
      ? {
          id: row.clubs.id,
          name: row.clubs.name,
          zone: row.clubs.zone ?? null,
          address: row.clubs.address ?? null,
          lat: row.clubs.lat ?? null,
          lng: row.clubs.lng ?? null,
        }
      : null,
  };
}

/**
 * Convert GraphQL filters to repository filter options
 */
function toFilterOptions(filters?: MatchFilters | null): MatchFilterOptions {
  if (!filters) return { status: 'open' };

  return {
    status: filters.status ? STATUS_TO_DB[filters.status] : 'open',
    format: filters.format ? FORMAT_TO_DB[filters.format] : undefined,
    zone: filters.zone ?? undefined,
    dateFrom: filters.dateFrom ?? undefined,
    dateTo: filters.dateTo ?? undefined,
    search: filters.search ?? undefined,
  };
}

/**
 * Generate cache key from filters
 */
function getFiltersCacheKey(filters: MatchFilterOptions): string {
  const parts = [
    `status:${filters.status || 'open'}`,
    filters.format ? `format:${filters.format}` : '',
    filters.zone ? `zone:${filters.zone}` : '',
    filters.dateFrom ? `from:${filters.dateFrom}` : '',
    filters.dateTo ? `to:${filters.dateTo}` : '',
    filters.search ? `search:${filters.search}` : '',
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
  _ctx: ServiceContext,
  filters?: MatchFilters | null,
): Promise<Match[]> {
  const filterOptions = toFilterOptions(filters);
  const cacheKey = getFiltersCacheKey(filterOptions);

  const matches = await cacheGetOrSet<MatchWithClub[]>(
    cacheKey,
    () => matchRepository.getMatchesWithFilters(filterOptions),
    CACHE_TTL.DYNAMIC_DATA,
  );

  return matches.map(toMatch);
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
    () => matchRepository.getMatchById(id),
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
 * - Previously fixed bugs: none relevant.
 */
function toMatchDetail(row: MatchDetailRow, userId?: string): Match {
  const teamA = row.matchParticipants
    .filter((p) => p.team === 'a')
    .map((p) => ({ id: p.profiles.id, displayName: p.profiles.displayName, avatarUrl: p.profiles.avatarUrl ?? null }));

  const teamB = row.matchParticipants
    .filter((p) => p.team === 'b')
    .map((p) => ({ id: p.profiles.id, displayName: p.profiles.displayName, avatarUrl: p.profiles.avatarUrl ?? null }));

  const spotsPerTeam = Math.floor(row.capacity / 2);
  const totalCount = teamA.length + teamB.length;
  const isCurrentUserJoined = userId
    ? row.matchParticipants.some((p) => p.profiles.id === userId)
    : false;

  return {
    id: row.id,
    title: row.description ?? 'Partido sin título',
    startTime: row.scheduledAt,
    format: DB_TO_FORMAT[row.format] ?? MatchFormat.FiveVsFive,
    totalSlots: row.capacity,
    availableSlots: row.capacity - totalCount,
    status: DB_TO_STATUS[row.status] ?? MatchStatus.Open,
    createdAt: row.createdAt,
    description: row.description ?? null,
    club: row.clubs
      ? {
          id: row.clubs.id,
          name: row.clubs.name,
          zone: row.clubs.zone ?? null,
          address: row.clubs.address ?? null,
          lat: row.clubs.lat ?? null,
          lng: row.clubs.lng ?? null,
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
    canJoin: row.status === 'open' && !isCurrentUserJoined && totalCount < row.capacity,
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
    () => matchRepository.getMatchWithParticipants(id),
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
  const slot = await clubSlotRepository.getSlotById(input.slotId);
  if (!slot) throw new Error('El horario seleccionado no existe');
  if (slot.isBlocked) throw new Error('El horario ya está bloqueado. Elegí otro horario.');
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

export const matchService = {
  listMatches,
  listOpenMatches,
  listMatchesByStatus,
  getMatchById,
  getMatchDetail,
  joinMatch,
  createMatch,
};
