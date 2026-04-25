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
  type CreateMatchInput,
  type CreateMatchResult,
  type Match,
  type MatchFilters,
} from '../graphql/generated/graphql.js';
import {
  matchRepository,
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
  createMatch,
};
