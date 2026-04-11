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
 * - `availableSlots` is currently `capacity` — participant counting is a TODO that requires
 *   joining `matchPlayers`. Do NOT ship join logic without adding RLS policies for that table.
 * - Uses generated GraphQL `Match` type so schema changes break this file at build time.
 * - Previously fixed bugs: removed ad-hoc console.log debugging that ran on every request —
 *   those were left from initial scaffolding and polluted prod logs.
 */

import { cacheGetOrSet, CACHE_PREFIX, CACHE_TTL } from '../config/redis.js';
import type { Match } from '../graphql/generated/graphql.js';
import { matchRepository, type MatchWithClub } from '../repositories/matchRepository.js';
import type { ServiceContext } from '../types/context.js';

// =====================================================
// Data Transformation (DB row -> GraphQL contract)
// =====================================================

function toMatch(row: MatchWithClub): Match {
  return {
    id: row.id,
    title: row.description ?? 'Partido sin título',
    startTime: row.scheduledAt,
    format: row.format,
    totalSlots: row.capacity,
    // TODO: subtract `matchPlayers` count once participants are modelled
    availableSlots: row.capacity,
    status: row.status,
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

// =====================================================
// Service Functions
// =====================================================

/**
 * List open matches. Public endpoint - no auth required.
 */
export async function listOpenMatches(_ctx: ServiceContext): Promise<Match[]> {
  const matches = await cacheGetOrSet<MatchWithClub[]>(
    CACHE_PREFIX.MATCHES_OPEN,
    () => matchRepository.getOpenMatches(),
    CACHE_TTL.DYNAMIC_DATA,
  );
  return matches.map(toMatch);
}

/**
 * List matches by status.
 */
export async function listMatchesByStatus(
  _ctx: ServiceContext,
  status: string,
): Promise<Match[]> {
  const cacheKey = `${CACHE_PREFIX.MATCHES_LIST}:${status}`;
  const matches = await cacheGetOrSet<MatchWithClub[]>(
    cacheKey,
    () => matchRepository.getMatchesByStatus(status),
    CACHE_TTL.DYNAMIC_DATA,
  );
  return matches.map(toMatch);
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
  listOpenMatches,
  listMatchesByStatus,
  getMatchById,
};
