/**
 * Redis cache configuration and helpers
 *
 * Decision Context:
 * - Why: Egress prevention requires caching all read-heavy paths per backend.md rules.
 * - Pattern: Service layer uses cacheGetOrSet(), invalidates on mutations.
 * - TTL Guidelines: list queries 1h, single entities 30m, dynamic data 2-3m.
 * - Previously fixed bugs: none relevant.
 */

import { Redis } from 'ioredis';
import { logger } from '../observability/logger.js';
import {
  recordRedisCacheOperation,
  recordRedisCacheRequest,
  setRedisAvailability,
} from '../observability/metrics.js';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

let redis: Redis | null = null;
let redisAvailable = false;

// Only try to connect if REDIS_URL is explicitly set
if (process.env.REDIS_URL) {
  const redisClient = new Redis(redisUrl, {
    maxRetriesPerRequest: 1,
    connectTimeout: 3000,
    lazyConnect: false,
  });

  redis = redisClient;

  redisClient.on('error', (err: Error) => {
    logger.warn({ event: 'redis_connection_error', err }, 'Redis connection error; caching disabled');
    redisAvailable = false;
    setRedisAvailability(false);
  });

  redisClient.on('connect', () => {
    logger.info({ event: 'redis_connected' }, 'Redis connected successfully');
    redisAvailable = true;
    setRedisAvailability(true);
  });
} else {
  logger.info({ event: 'redis_disabled' }, 'REDIS_URL not set, caching disabled');
}

// =====================================================
// Cache Key Prefixes
// =====================================================

export const CACHE_PREFIX = {
  MATCHES_LIST: 'matches:list',
  MATCHES_OPEN: 'matches:open',
  MATCH_DETAIL: 'match:',
  // match:participants:{id} — richer cache entry that includes participant list.
  // Shorter TTL (DYNAMIC_DATA) than MATCH_DETAIL because team rosters change on every join.
  MATCH_PARTICIPANTS: 'match:participants:',
  TOURNAMENTS_LIST: 'tournaments:list',
  CLUBS_LIST: 'clubs:list',
  CLUB_DETAIL: 'club:',
  // `profile:me:<userId>` — scoped to the owner because RLS differs per-user.
  // Invalidate on profile mutations (updatePosition, stat recompute, etc.).
  PROFILE_ME: 'profile:me:',
  // `user:matches:<userId>:page:<page>:size:<pageSize>` — per-user history pagination.
  // Invalidate when a match this user participated in transitions to 'completed'.
  USER_MATCHES: 'user:matches:',
  // `geocode:<normalizedAddress>` — Nominatim geocoding result cache.
  // Long TTL (GEOCODING) because addresses rarely move and Nominatim usage policy
  // requires aggressive caching. See geocodingService for details.
  GEOCODE: 'geocode:',
  // team:{teamId} — equipo permanente con miembros. Invalidar en createTeam, updateTeam, leaveTeam, etc.
  TEAM_DETAIL: 'team:',
  // teams:list — lista pública de equipos activos.
  TEAMS_LIST: 'teams:list',
  // user:teams:{userId} — equipos donde el usuario es miembro o capitán.
  USER_TEAMS: 'user:teams:',
  // team:availability:{teamId} — matriz de disponibilidad del equipo.
  TEAM_AVAILABILITY: 'team:availability:',
  // leaderboard:{limit} — ranking público de jugadores por winrate.
  // Read-heavy y estable (las stats sólo cambian al cerrarse un partido), cacheado a LIST_QUERIES.
  LEADERBOARD: 'leaderboard:',
  // notifications:{userId} — lista + contador de no leídas de la campana, scoped al dueño (RLS).
  // TTL corto (DYNAMIC_DATA) e invalidado al crear/leer/borrar notificaciones de ese usuario.
  NOTIFICATIONS: 'notifications:',
  // notifPrefs:{userId} — preferencias de notificación del usuario. Invalidar al actualizar.
  NOTIF_PREFS: 'notifPrefs:',
} as const;

// =====================================================
// Cache TTL (in seconds)
// =====================================================

export const CACHE_TTL = {
  LIST_QUERIES: 3600, // 1 hour for stable lists
  SINGLE_ENTITY: 1800, // 30 minutes for individual items
  DYNAMIC_DATA: 180, // 3 minutes for frequently changing data (match slots)
  USER_DATA: 300, // 5 minutes for user-specific data
  // 30 days. Geocoding results from Nominatim are stable (street addresses rarely move)
  // and OSM's usage policy requires aggressive caching to avoid hammering the public
  // service. We also persist the result back to clubs.lat/lng, so this cache is mostly
  // a guard against repeated misses across cold restarts of the same address.
  GEOCODING: 60 * 60 * 24 * 30,
} as const;

// =====================================================
// Cache Helpers
// =====================================================

/**
 * Get cached value
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  const prefix = cacheMetricPrefix(key);

  if (!redis || !redisAvailable) {
    recordRedisCacheOperation('get', 'disabled', prefix);
    return null;
  }

  try {
    const cached = await redis.get(key);
    recordRedisCacheOperation('get', 'ok', prefix);
    recordRedisCacheRequest(cached ? 'hit' : 'miss', prefix);
    if (cached) {
      return JSON.parse(cached) as T;
    }
    return null;
  } catch (error) {
    recordRedisCacheOperation('get', 'error', prefix);
    logger.error({ event: 'redis_cache_get_error', err: error, key }, 'Redis cacheGet error');
    return null;
  }
}

/**
 * Set cached value with TTL
 */
export async function cacheSet<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  const prefix = cacheMetricPrefix(key);

  if (!redis || !redisAvailable) {
    recordRedisCacheOperation('set', 'disabled', prefix);
    return;
  }

  try {
    await redis.setex(key, ttlSeconds, JSON.stringify(value));
    recordRedisCacheOperation('set', 'ok', prefix);
  } catch (error) {
    recordRedisCacheOperation('set', 'error', prefix);
    logger.error({ event: 'redis_cache_set_error', err: error, key }, 'Redis cacheSet error');
  }
}

/**
 * Get cached value or fetch and cache
 * Primary caching pattern for read-heavy paths
 */
export async function cacheGetOrSet<T>(
  key: string,
  fetchFn: () => Promise<T>,
  ttlSeconds: number,
): Promise<T> {
  try {
    const cached = await cacheGet<T>(key);
    if (cached !== null) {
      logger.debug({ event: 'redis_cache_hit', key }, 'Redis cache hit');
      return cached;
    }

    logger.debug({ event: 'redis_cache_miss', key }, 'Redis cache miss');
    const fresh = await fetchFn();
    await cacheSet(key, fresh, ttlSeconds);
    return fresh;
  } catch (error) {
    // If Redis fails, still return fresh data
    logger.error({ event: 'redis_cache_get_or_set_error', err: error, key }, 'Redis cacheGetOrSet error');
    return fetchFn();
  }
}

/**
 * Delete a specific cache key
 */
export async function cacheDelete(key: string): Promise<void> {
  const prefix = cacheMetricPrefix(key);

  if (!redis || !redisAvailable) {
    recordRedisCacheOperation('delete', 'disabled', prefix);
    return;
  }

  try {
    await redis.del(key);
    recordRedisCacheOperation('delete', 'ok', prefix);
    logger.debug({ event: 'redis_cache_delete', key }, 'Redis cache key deleted');
  } catch (error) {
    recordRedisCacheOperation('delete', 'error', prefix);
    logger.error({ event: 'redis_cache_delete_error', err: error, key }, 'Redis cacheDelete error');
  }
}

/**
 * Delete all keys matching a pattern.
 * Use for invalidating related caches (e.g., all match lists).
 *
 * NOTE: Must null-check `redis` FIRST — when REDIS_URL is unset, `redis` is null and
 * calling `.keys()` on it would crash the request path. Previously fixed bug: an early
 * revision omitted this guard and any mutation handler that invalidated cache in a
 * Redis-less dev environment would 500.
 */
export async function cacheDeletePattern(pattern: string): Promise<void> {
  const prefix = cacheMetricPrefix(pattern);

  if (!redis || !redisAvailable) {
    recordRedisCacheOperation('delete_pattern', 'disabled', prefix);
    return;
  }

  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
    recordRedisCacheOperation('delete_pattern', 'ok', prefix);
  } catch (error) {
    recordRedisCacheOperation('delete_pattern', 'error', prefix);
    logger.error(
      { event: 'redis_cache_delete_pattern_error', err: error, pattern },
      'Redis cacheDeletePattern error',
    );
  }
}

function cacheMetricPrefix(key: string): string {
  const keyWithoutWildcard = key.replace(/\*+$/g, '');
  const segments = keyWithoutWildcard.split(':').filter(Boolean);

  if (segments.length === 0) return 'unknown';
  if (segments[0] === 'match' && segments[1] === 'participants') return 'match:participants';
  if (segments[0] === 'matches' && segments[1] === 'list') return 'matches:list';
  if (segments[0] === 'user' && segments[1] === 'matches') return 'user:matches';
  if (segments[0] === 'user' && segments[1] === 'teams') return 'user:teams';
  if (segments[0] === 'team' && segments[1] === 'availability') return 'team:availability';

  return segments.length > 1 ? `${segments[0]}:${segments[1]}` : segments[0];
}
