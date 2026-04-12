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

import { cacheGetOrSet, CACHE_PREFIX, CACHE_TTL } from '../config/redis.js';
import type { Match, MatchFormat, MatchStatus, MatchFilters } from '../graphql/generated/graphql.js';
import { matchRepository, type MatchWithClub, type MatchFilterOptions } from '../repositories/matchRepository.js';
import type { ServiceContext } from '../types/context.js';

// =====================================================
// Enum Mapping (GraphQL <-> Database)
// =====================================================

/** Map GraphQL MatchFormat enum to DB values */
const FORMAT_TO_DB: Record<MatchFormat, string> = {
  FIVE_VS_FIVE: '5v5',
  SEVEN_VS_SEVEN: '7v7',
  TEN_VS_TEN: '10v10',
  ELEVEN_VS_ELEVEN: '11v11',
};

/** Map DB format values to GraphQL enum */
const DB_TO_FORMAT: Record<string, MatchFormat> = {
  '5v5': 'FIVE_VS_FIVE',
  '7v7': 'SEVEN_VS_SEVEN',
  '10v10': 'TEN_VS_TEN',
  '11v11': 'ELEVEN_VS_ELEVEN',
};

/** Map GraphQL MatchStatus enum to DB values */
const STATUS_TO_DB: Record<MatchStatus, string> = {
  OPEN: 'open',
  FULL: 'full',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

/** Map DB status values to GraphQL enum */
const DB_TO_STATUS: Record<string, MatchStatus> = {
  open: 'OPEN',
  full: 'FULL',
  in_progress: 'IN_PROGRESS',
  completed: 'COMPLETED',
  cancelled: 'CANCELLED',
};

// =====================================================
// Data Transformation (DB row -> GraphQL contract)
// =====================================================

function toMatch(row: MatchWithClub): Match {
  return {
    id: row.id,
    title: row.description ?? 'Partido sin título',
    startTime: row.scheduledAt,
    format: DB_TO_FORMAT[row.format] ?? 'FIVE_VS_FIVE',
    totalSlots: row.capacity,
    // TODO: subtract `matchPlayers` count once participants are modelled
    availableSlots: row.capacity,
    status: DB_TO_STATUS[row.status] ?? 'OPEN',
    createdAt: row.createdAt,
    club: row.clubs
      ? {
          id: row.clubs.id,
          name: row.clubs.name,
          zone: row.clubs.zone,
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
  return listMatches(_ctx, { status: 'OPEN' });
}

/**
 * List matches by status.
 */
export async function listMatchesByStatus(
  _ctx: ServiceContext,
  status: string,
): Promise<Match[]> {
  const gqlStatus = DB_TO_STATUS[status] ?? 'OPEN';
  return listMatches(_ctx, { status: gqlStatus });
}

/**
 * Get a single match by id.
 */
export async function getMatchById(
  _ctx: ServiceContext,
  id: string,
): Promise<Match | null> {
  const cacheKey = `${CACHE_PREFIX.MATCH_DETAIL}${id}`;
  const match = await cacheGetOrSet<MatchWithClub | null>(
    cacheKey,
    () => matchRepository.getMatchById(id),
    CACHE_TTL.SINGLE_ENTITY,
  );
  return match ? toMatch(match) : null;
}

export const matchService = {
  listMatches,
  listOpenMatches,
  listMatchesByStatus,
  getMatchById,
};
