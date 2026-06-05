/**
 * Profile Service — business logic for player profiles and privacy settings
 *
 * Decision Context:
 * - Privacy model (getProfile): when requesterId !== profileId, the service applies
 *   field-level filtering based on the profile owner's privacy flags:
 *     · isPublic=false  → only id, displayName, avatarUrl, role; isPrivate=true
 *     · showStats=false → matchesPlayed, matchesWon, winrate all return null
 *     · showPosition=false → preferredPosition returns null
 *     · showDivision=false → division returns null
 *   The owner always sees all fields (requesterId === profileId path bypasses filtering).
 * - Why filter in the service and not via RLS: PostgreSQL RLS cannot filter individual
 *   columns, only rows. A row-level filter on isPublic would let visitors infer privacy
 *   from a missing row. The backend column-filter approach prevents that information leak.
 * - Caching: profile:me:<userId> is cached at TTL.USER_DATA (5 min). When privacy
 *   settings change, we invalidate both the me-cache and the public profile cache.
 * - updatePrivacy: validates at service layer (Zod), writes with the user-scoped client
 *   so the RLS UPDATE policy enforces auth.uid() = id. Records an audit log entry after
 *   a successful update. Invalidates Redis caches so stale data is not served.
 * - winrate computation: moved into a shared helper to keep both toOwnProfile and
 *   toPublicProfile consistent.
 * - Previously fixed bugs: none relevant.
 */

import { z } from 'zod';
import {
  cacheDelete,
  cacheGetOrSet,
  CACHE_PREFIX,
  CACHE_TTL,
} from '../config/redis.js';
import { supabase } from '../config/supabase.js';
import {
  PlayerPosition,
  UserRole,
  type LeaderboardEntry,
  type PrivacySettings,
  type Profile,
} from '../graphql/generated/graphql.js';
import {
  profileRepository,
  type LeaderboardRow,
  type ProfileRow,
  type ProfileWithPrivacyRow,
  type PrivacySettingsRow,
  type UpdatePrivacyFields,
} from '../repositories/profileRepository.js';
import type { ServiceContext } from '../types/context.js';

// =====================================================
// Validation
// =====================================================

const UpdatePrivacySchema = z
  .object({
    isPublic: z.boolean().optional(),
    showStats: z.boolean().optional(),
    showHistory: z.boolean().optional(),
    showPosition: z.boolean().optional(),
    showDivision: z.boolean().optional(),
  })
  .refine(
    (data) => Object.values(data).some((v) => v !== undefined),
    { message: 'Debés proporcionar al menos un campo para actualizar' },
  );

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
// Data Transformation Helpers
// =====================================================

function computeWinrate(matchesWon: number, matchesPlayed: number): number | null {
  if (matchesPlayed <= 0) return null;
  return Number(((matchesWon / matchesPlayed) * 100).toFixed(2));
}

function toOwnProfile(row: ProfileRow): Profile {
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
    isPrivate: false,
  };
}

function toPublicProfile(row: ProfileWithPrivacyRow): Profile {
  if (!row.isPublic) {
    return {
      id: row.id,
      displayName: row.displayName,
      avatarUrl: row.avatarUrl,
      role: DB_TO_ROLE[row.role] ?? UserRole.Player,
      preferredPosition: null,
      division: null,
      matchesPlayed: null,
      matchesWon: null,
      winrate: null,
      isPrivate: true,
    };
  }

  return {
    id: row.id,
    displayName: row.displayName,
    avatarUrl: row.avatarUrl,
    role: DB_TO_ROLE[row.role] ?? UserRole.Player,
    preferredPosition: row.showPosition && row.preferredPosition
      ? (DB_TO_POSITION[row.preferredPosition] ?? null)
      : null,
    division: row.showDivision ? row.division : null,
    matchesPlayed: row.showStats ? row.matchesPlayed : null,
    matchesWon: row.showStats ? row.matchesWon : null,
    winrate: row.showStats ? computeWinrate(row.matchesWon, row.matchesPlayed) : null,
    isPrivate: false,
  };
}

function toLeaderboardEntry(row: LeaderboardRow, index: number): LeaderboardEntry {
  return {
    rank: index + 1,
    id: row.id,
    displayName: row.displayName,
    avatarUrl: row.avatarUrl,
    preferredPosition: row.preferredPosition
      ? (DB_TO_POSITION[row.preferredPosition] ?? null)
      : null,
    division: row.division,
    matchesPlayed: row.matchesPlayed,
    matchesWon: row.matchesWon,
    // RPC returns numeric (string-or-number depending on driver); coerce defensively.
    winrate: Number(row.winrate),
  };
}

function toPrivacySettings(row: PrivacySettingsRow): PrivacySettings {
  return {
    isPublic: row.isPublic,
    showStats: row.showStats,
    showHistory: row.showHistory,
    showPosition: row.showPosition,
    showDivision: row.showDivision,
  };
}

// =====================================================
// Service Functions
// =====================================================

/**
 * Returns the authenticated user's own profile (all fields, no privacy filtering).
 */
export async function getMyProfile(ctx: ServiceContext): Promise<Profile> {
  if (!ctx.userId) {
    console.warn('[profileService.getMyProfile] Called without userId');
    throw new Error('Autenticación requerida');
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
      console.warn(`[profileService.getMyProfile] Profile not found for userId=${ctx.userId}`);
      throw new Error('Perfil no encontrado');
    }

    return toOwnProfile(row);
  } catch (error) {
    console.error(`[profileService.getMyProfile] Failed for userId=${ctx.userId}:`, error);
    throw error instanceof Error ? error : new Error('Error al obtener el perfil');
  }
}

/**
 * Returns another user's profile, applying privacy filtering.
 * If requesterId === profileId, returns all fields (same as myProfile).
 */
export async function getProfile(
  profileId: string,
  requesterId: string | null,
): Promise<Profile | null> {
  try {
    if (requesterId === profileId) {
      const row = await profileRepository.getProfileById(profileId);
      if (!row) return null;
      return toOwnProfile(row);
    }

    const cacheKey = `profile:public:${profileId}`;
    const row = await cacheGetOrSet<ProfileWithPrivacyRow | null>(
      cacheKey,
      () => profileRepository.getProfileWithPrivacy(profileId),
      CACHE_TTL.USER_DATA,
    );

    if (!row) return null;
    return toPublicProfile(row);
  } catch (error) {
    console.error(
      `[profileService.getProfile] Failed for profileId=${profileId}, requesterId=${requesterId}:`,
      error,
    );
    throw error instanceof Error ? error : new Error('Error al obtener el perfil');
  }
}

/**
 * Returns the privacy settings for the authenticated user.
 */
export async function getMySettings(ctx: ServiceContext): Promise<PrivacySettings> {
  if (!ctx.userId) {
    throw new Error('Autenticación requerida');
  }

  const db = ctx.supabase ?? supabase;

  try {
    const row = await profileRepository.getPrivacySettings(ctx.userId, db);
    if (!row) {
      throw new Error('Configuración de privacidad no encontrada');
    }
    return toPrivacySettings(row);
  } catch (error) {
    console.error(`[profileService.getMySettings] Failed for userId=${ctx.userId}:`, error);
    throw error instanceof Error ? error : new Error('Error al obtener la configuración');
  }
}

/**
 * Updates the authenticated user's privacy settings.
 * Validates input with Zod, writes with user-scoped client for RLS enforcement,
 * records an audit log entry, and invalidates Redis caches.
 */
export async function updatePrivacy(
  input: UpdatePrivacyFields,
  ctx: ServiceContext,
): Promise<PrivacySettings> {
  if (!ctx.userId) {
    throw new Error('Autenticación requerida');
  }

  const parsed = UpdatePrivacySchema.safeParse(input);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? 'Datos de privacidad inválidos';
    throw new Error(msg);
  }

  const db = ctx.supabase ?? supabase;

  try {
    // Fetch current settings for audit log (before snapshot)
    const previousRow = await profileRepository.getPrivacySettings(ctx.userId, db);
    if (!previousRow) {
      throw new Error('Perfil no encontrado');
    }

    // Apply the update
    await profileRepository.updatePrivacyFields(ctx.userId, parsed.data, db);

    // Fetch the updated settings
    const updatedRow = await profileRepository.getPrivacySettings(ctx.userId, db);
    if (!updatedRow) {
      throw new Error('Error al verificar la actualización');
    }

    // Record audit log (non-blocking failure)
    await profileRepository.insertPrivacyAuditLog(ctx.userId, previousRow, updatedRow);

    // Invalidate caches
    await Promise.all([
      cacheDelete(`${CACHE_PREFIX.PROFILE_ME}${ctx.userId}`),
      cacheDelete(`profile:public:${ctx.userId}`),
      // Invalidate match history cache if showHistory changed
      ...(parsed.data.showHistory !== undefined
        ? [cacheDelete(`${CACHE_PREFIX.USER_MATCHES}${ctx.userId}`)]
        : []),
    ]);

    console.info(`[profileService.updatePrivacy] Privacy updated for userId=${ctx.userId}`);
    return toPrivacySettings(updatedRow);
  } catch (error) {
    console.error(`[profileService.updatePrivacy] Failed for userId=${ctx.userId}:`, error);
    throw error instanceof Error ? error : new Error('Error al actualizar la privacidad');
  }
}

/**
 * Returns the public player leaderboard ranked by winrate.
 *
 * Decision Context:
 * - Public (no auth): consumed by the static /leaderboard page hydrated client-side.
 *   The RPC only exposes already-public data, so there is no session to scope.
 * - limit defaults to 50, clamped to [1,100] here AND in the RPC (defense in depth so a
 *   crafted request can never widen the result set / egress).
 * - Caching: leaderboard:<limit> at LIST_QUERIES TTL (1h). Stats only change when a match
 *   is closed (a rare, write-side event), so a 1h stale window is an acceptable tradeoff
 *   for keeping this read-heavy path off the DB. No explicit invalidation is wired on
 *   stat updates yet — the 1h TTL bounds staleness; revisit if real-time ranks are needed.
 * - Rank is assigned from the already-sorted RPC output (1-based), not stored, so it stays
 *   correct regardless of how many rows the limit returns.
 * - Previously fixed bugs: none relevant.
 */
export async function getLeaderboard(limit?: number | null): Promise<LeaderboardEntry[]> {
  const safeLimit = Math.min(Math.max(Math.floor(limit ?? 50), 1), 100);
  const cacheKey = `${CACHE_PREFIX.LEADERBOARD}${safeLimit}`;

  try {
    const rows = await cacheGetOrSet<LeaderboardRow[]>(
      cacheKey,
      () => profileRepository.getLeaderboard(safeLimit),
      CACHE_TTL.LIST_QUERIES,
    );

    return rows.map(toLeaderboardEntry);
  } catch (error) {
    console.error(`[profileService.getLeaderboard] Failed for limit=${safeLimit}:`, error);
    throw error instanceof Error ? error : new Error('Error al obtener el ranking');
  }
}

export const profileService = {
  getMyProfile,
  getProfile,
  getMySettings,
  updatePrivacy,
  getLeaderboard,
};
