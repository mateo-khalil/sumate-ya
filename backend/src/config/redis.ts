/**
 * Redis cache configuration and helpers
 *
 * Decision Context:
 * - Why: Egress prevention requires caching all read-heavy paths per backend.md rules.
 * - Pattern: Service layer uses cacheGetOrSet(), invalidates on mutations.
 * - TTL Guidelines: list queries 1h, single entities 30m, dynamic data 2-3m.
 * - Previously fixed bugs: none relevant.
 */

import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

let redis: Redis | null = null;
let redisAvailable = false;

// Only try to connect if REDIS_URL is explicitly set
if (process.env.REDIS_URL) {
  redis = new Redis(redisUrl, {
    maxRetriesPerRequest: 1,
    retryDelayOnFailover: 100,
    connectTimeout: 3000,
    lazyConnect: false,
  });

  redis.on('error', (err) => {
    console.warn('[Redis] Connection error (caching disabled):', err.message);
    redisAvailable = false;
  });

  redis.on('connect', () => {
    console.log('[Redis] Connected successfully');
    redisAvailable = true;
  });
} else {
  console.log('[Redis] REDIS_URL not set, caching disabled');
}

// =====================================================
// Cache Key Prefixes
// =====================================================

export const CACHE_PREFIX = {
  MATCHES_LIST: 'matches:list',
  MATCHES_OPEN: 'matches:open',
  MATCH_DETAIL: 'match:',
  CLUBS_LIST: 'clubs:list',
  CLUB_DETAIL: 'club:',
} as const;

// =====================================================
// Cache TTL (in seconds)
// =====================================================

export const CACHE_TTL = {
  LIST_QUERIES: 3600,      // 1 hour for stable lists
  SINGLE_ENTITY: 1800,     // 30 minutes for individual items
  DYNAMIC_DATA: 180,       // 3 minutes for frequently changing data (match slots)
  USER_DATA: 300,          // 5 minutes for user-specific data
} as const;

// =====================================================
// Cache Helpers
// =====================================================

/**
 * Get cached value
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  if (!redis || !redisAvailable) return null;
  
  try {
    const cached = await redis.get(key);
    if (cached) {
      return JSON.parse(cached) as T;
    }
    return null;
  } catch (error) {
    console.error(`[Redis] cacheGet error for key ${key}:`, error);
    return null;
  }
}

/**
 * Set cached value with TTL
 */
export async function cacheSet<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  if (!redis || !redisAvailable) return;
  
  try {
    await redis.setex(key, ttlSeconds, JSON.stringify(value));
  } catch (error) {
    console.error(`[Redis] cacheSet error for key ${key}:`, error);
  }
}

/**
 * Get cached value or fetch and cache
 * Primary caching pattern for read-heavy paths
 */
export async function cacheGetOrSet<T>(
  key: string,
  fetchFn: () => Promise<T>,
  ttlSeconds: number
): Promise<T> {
  try {
    const cached = await cacheGet<T>(key);
    if (cached !== null) {
      console.log(`[Redis] Cache HIT: ${key}`);
      return cached;
    }

    console.log(`[Redis] Cache MISS: ${key}`);
    const fresh = await fetchFn();
    await cacheSet(key, fresh, ttlSeconds);
    return fresh;
  } catch (error) {
    // If Redis fails, still return fresh data
    console.error(`[Redis] cacheGetOrSet error for key ${key}:`, error);
    return fetchFn();
  }
}

/**
 * Delete a specific cache key
 */
export async function cacheDelete(key: string): Promise<void> {
  if (!redis || !redisAvailable) return;
  
  try {
    await redis.del(key);
    console.log(`[Redis] Deleted key: ${key}`);
  } catch (error) {
    console.error(`[Redis] cacheDelete error for key ${key}:`, error);
  }
}

/**
 * Delete all keys matching a pattern
 * Use for invalidating related caches (e.g., all match lists)
 */
export async function cacheDeletePattern(pattern: string): Promise<void> {
  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
      console.log(`[Redis] Deleted ${keys.length} keys matching: ${pattern}`);
    }
  } catch (error) {
    console.error(`[Redis] cacheDeletePattern error for pattern ${pattern}:`, error);
  }
}
