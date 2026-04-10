/**
 * Match Service - Business logic for matches
 *
 * Decision Context:
 * - Why: Services return data only (no side effects) per backend.md rules.
 * - Pattern: Uses cacheGetOrSet() for read-heavy paths with 3min TTL for dynamic data.
 * - Join with clubs done at repository level to prevent N+1.
 * - Previously fixed bugs: Adapted to actual Supabase schema (description, scheduledAt, capacity).
 */

import { cacheGetOrSet, CACHE_PREFIX, CACHE_TTL } from '../config/redis.js';
import { matchRepository, type MatchWithClub } from '../repositories/matchRepository.js';
import type { ServiceContext } from '../types/context.js';

// =====================================================
// Types for GraphQL response
// Maps DB schema to GraphQL schema for frontend compatibility
// =====================================================

export interface MatchDTO {
  id: string;
  title: string;          // mapped from description
  startTime: string;      // mapped from scheduledAt
  format: string;
  totalSlots: number;     // mapped from capacity
  availableSlots: number; // capacity (no participant count yet)
  status: string;
  createdAt: string;
  club: {
    id: string;
    name: string;
    zone: string | null;
  } | null;
}

// =====================================================
// Data Transformation
// =====================================================

function toMatchDTO(row: MatchWithClub): MatchDTO {
  return {
    id: row.id,
    title: row.description || 'Partido sin título',  // map description → title
    startTime: row.scheduledAt,                       // map scheduledAt → startTime
    format: row.format,
    totalSlots: row.capacity,                         // map capacity → totalSlots
    availableSlots: row.capacity,                     // TODO: subtract participant count
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
 * List open matches with caching
 * Public endpoint - no auth required
 */
export async function listOpenMatches(_ctx: ServiceContext): Promise<MatchDTO[]> {
  const cacheKey = CACHE_PREFIX.MATCHES_OPEN;

  try {
    const matches = await cacheGetOrSet<MatchWithClub[]>(
      cacheKey,
      async () => {
        console.log('[MatchService] Fetching open matches from DB...');
        const result = await matchRepository.getOpenMatches();
        console.log('[MatchService] Got matches:', JSON.stringify(result, null, 2));
        return result;
      },
      CACHE_TTL.DYNAMIC_DATA // 3 minutes - slots change frequently
    );

    console.log('[MatchService] Transforming', matches.length, 'matches');
    return matches.map(toMatchDTO);
  } catch (error) {
    console.error('[MatchService] Error in listOpenMatches:', error);
    throw error;
  }
}

/**
 * List matches by status with caching
 */
export async function listMatchesByStatus(
  _ctx: ServiceContext,
  status: string
): Promise<MatchDTO[]> {
  const cacheKey = `${CACHE_PREFIX.MATCHES_LIST}:${status}`;

  const matches = await cacheGetOrSet<MatchWithClub[]>(
    cacheKey,
    () => matchRepository.getMatchesByStatus(status),
    CACHE_TTL.DYNAMIC_DATA
  );

  return matches.map(toMatchDTO);
}

/**
 * Get single match by ID with caching
 */
export async function getMatchById(
  _ctx: ServiceContext,
  id: string
): Promise<MatchDTO | null> {
  const cacheKey = `${CACHE_PREFIX.MATCH_DETAIL}${id}`;

  const match = await cacheGetOrSet<MatchWithClub | null>(
    cacheKey,
    () => matchRepository.getMatchById(id),
    CACHE_TTL.SINGLE_ENTITY // 30 minutes
  );

  return match ? toMatchDTO(match) : null;
}

// Export service as object
export const matchService = {
  listOpenMatches,
  listMatchesByStatus,
  getMatchById,
};
