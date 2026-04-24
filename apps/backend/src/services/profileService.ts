/**
 * Profile Service — business logic for player profiles
 *
 * Decision Context:
 * - Why: Services return data only (backend.md). Winrate is computed here, not in the DB,
 *   because `matchesWon` / `matchesPlayed` counters already live on the row and a DB
 *   generated column would not gracefully represent the null-when-zero case.
 * - Caching: TTL = USER_DATA (5 min) matches backend.md guidance "player profiles 5m".
 *   Cache key is scoped per user (`profile:me:<userId>`) so each JWT gets its own entry.
 *   When a mutation lands that updates stats (join match, record result), it MUST call
 *   `cacheDelete(${CACHE_PREFIX.PROFILE_ME}${userId})` to avoid stale stats.
 * - RLS: the service uses `ctx.supabase ?? supabase` so the user-scoped client (created in
 *   the resolver from the caller's JWT) is used for DB reads. The fallback to the singleton
 *   is defensive — `myProfile` always requires auth and the resolver always passes
 *   `ctx.supabase`, but backend.md mandates the pattern for consistency with future services.
 * - Winrate formula: (won / played) * 100, rounded to 2 decimals, or null when played = 0.
 *   Rounding uses Number(fixed(2)) so GraphQL Float stays numeric instead of a string.
 * - Previously fixed bugs: none relevant.
 */

import { cacheGetOrSet, CACHE_PREFIX, CACHE_TTL } from '../config/redis.js';
import { supabase } from '../config/supabase.js';
import {
  PlayerPosition,
  UserRole,
  type Profile,
} from '../graphql/generated/graphql.js';
import { profileRepository, type ProfileRow } from '../repositories/profileRepository.js';
import type { ServiceContext } from '../types/context.js';

// =====================================================
// Enum Mapping (DB -> GraphQL)
// =====================================================

const DB_TO_ROLE: Record<string, UserRole> = {
  player: UserRole.Player,
  club_admin: UserRole.ClubAdmin,
};

const DB_TO_POSITION: Record<string, PlayerPosition> = {
  goalkeeper: PlayerPosition.Goalkeeper,
  defender: PlayerPosition.Defender,
  midfielder: PlayerPosition.Midfielder,
  forward: PlayerPosition.Forward,
};

// =====================================================
// Data Transformation
// =====================================================

function computeWinrate(matchesWon: number, matchesPlayed: number): number | null {
  if (matchesPlayed <= 0) return null;
  const rate = (matchesWon / matchesPlayed) * 100;
  return Number(rate.toFixed(2));
}

function toProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    displayName: row.displayName,
    avatarUrl: row.avatarUrl,
    role: DB_TO_ROLE[row.role] ?? UserRole.Player,
    preferredPosition: row.preferredPosition
      ? (DB_TO_POSITION[row.preferredPosition] ?? null)
      : null,
    division: row.division,
    matchesPlayed: row.matchesPlayed,
    matchesWon: row.matchesWon,
    winrate: computeWinrate(row.matchesWon, row.matchesPlayed),
  };
}

// =====================================================
// Service Functions
// =====================================================

/**
 * Returns the authenticated user's profile. Requires `ctx.userId` and should be called
 * with a user-scoped Supabase client for RLS enforcement.
 */
export async function getMyProfile(ctx: ServiceContext): Promise<Profile> {
  if (!ctx.userId) {
    console.warn('[profileService.getMyProfile] Called without userId');
    throw new Error('Authentication required');
  }

  const db = ctx.supabase ?? supabase;
  const cacheKey = `${CACHE_PREFIX.PROFILE_ME}${ctx.userId}`;

  try {
    const row = await cacheGetOrSet<ProfileRow | null>(
      cacheKey,
      () => profileRepository.getProfileById(ctx.userId as string, db),
      CACHE_TTL.USER_DATA,
    );

    if (!row) {
      console.warn(
        `[profileService.getMyProfile] Profile not found for userId=${ctx.userId}`,
      );
      throw new Error('Profile not found');
    }

    return toProfile(row);
  } catch (error) {
    console.error(
      `[profileService.getMyProfile] Failed for userId=${ctx.userId}:`,
      error,
    );
    throw error instanceof Error ? error : new Error('Failed to fetch profile');
  }
}

export const profileService = {
  getMyProfile,
};
