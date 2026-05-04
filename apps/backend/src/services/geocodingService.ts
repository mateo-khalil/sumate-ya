/**
 * Geocoding Service — convert street addresses to lat/lng using OpenStreetMap Nominatim.
 *
 * Decision Context:
 * - Why Nominatim: free, no API key, matches the OSM tile provider already used by the
 *   match map (visual + licensing consistency). Mapbox/Google would add billing setup
 *   and a key-management story we don't need at current scale.
 * - Why server-side: addresses are stored in `clubs.address` and we need to display pins
 *   on /partidos. Geocoding on the client would require shipping each address to the
 *   browser plus dealing with CORS to Nominatim from end-user devices, which is exactly
 *   the abuse pattern Nominatim's policy forbids. The backend can rate-limit + cache.
 * - Persistence path: callers (matchService) write the geocoded result back into
 *   `clubs.lat`/`clubs.lng` so the next read served from DB already has coords. Redis
 *   acts as a short-circuit between the Supabase update and the read of a fresh club row.
 * - Rate limiting: Nominatim's usage policy requires <= 1 request/second from a single
 *   source plus a descriptive User-Agent. We serialize calls through a promise chain so
 *   bursts (e.g. cache-miss on 5 unique clubs) become a controlled trickle. The chain is
 *   per-process — at our current scale a single backend instance is fine; if we scale
 *   horizontally we'll need a Redis-based token bucket.
 * - Cache TTL: 30 days. Addresses don't move and Nominatim explicitly asks for
 *   "aggressive caching". DB persistence dominates anyway — Redis is a safety net for
 *   addresses that fail to persist (e.g. transient Supabase error).
 * - Failure mode: returns `null` on any error so callers can fall through gracefully.
 *   The map already filters clubs without coords, so a failed geocode just keeps the
 *   pre-existing "no pin" behavior. Errors are logged but never propagated.
 * - Dedup: `geocodeAddresses` collapses identical addresses before the network calls so
 *   a list of 50 matches at 3 unique clubs costs at most 3 Nominatim hits.
 * - Country bias: hardcoded to Uruguay (`countrycodes=uy`) because the platform launched
 *   there and ambiguous toponyms (e.g. "Las Acacias") otherwise resolve to the wrong country.
 * - Previously fixed bugs: none relevant.
 */

import { cacheGet, cacheSet, CACHE_PREFIX, CACHE_TTL } from '../config/redis.js';

// =====================================================
// Configuration
// =====================================================

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
// Nominatim policy: identify the application + a contact path. Update if the project
// changes domain — operators may block User-Agents that look generic.
const USER_AGENT = 'SumateYa/1.0 (https://sumateya.app)';
// Slightly above 1s to stay safely under the "max 1 req/s" policy even with clock skew.
const MIN_INTERVAL_MS = 1100;
const REQUEST_TIMEOUT_MS = 5000;
// Country bias: Uruguay only — see Decision Context.
const COUNTRY_CODES = 'uy';

// =====================================================
// Types
// =====================================================

export interface GeoCoords {
  lat: number;
  lng: number;
}

interface NominatimHit {
  lat: string;
  lon: string;
}

// =====================================================
// Rate limiter (per-process serial queue)
// =====================================================

let lastCallAt = 0;
let chain: Promise<unknown> = Promise.resolve();

/**
 * Serialize Nominatim calls and enforce ≥ MIN_INTERVAL_MS between requests.
 * Each call appends to the chain so concurrent callers automatically queue.
 */
function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const next = chain.then(async () => {
    const wait = lastCallAt + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) {
      await new Promise((r) => setTimeout(r, wait));
    }
    try {
      return await task();
    } finally {
      lastCallAt = Date.now();
    }
  });
  // Keep the chain alive even if a task rejects — otherwise a single failure would
  // poison every subsequent enqueue.
  chain = next.catch(() => undefined);
  return next;
}

// =====================================================
// Helpers
// =====================================================

function normalizeAddress(address: string): string {
  return address.trim().toLowerCase().replace(/\s+/g, ' ');
}

function geocodeCacheKey(address: string): string {
  // Short, stable, URL-safe encoding of the normalized address.
  // Base64url keeps Redis keys human-readable enough for ops while bounding length.
  const normalized = normalizeAddress(address);
  return `${CACHE_PREFIX.GEOCODE}${Buffer.from(normalized).toString('base64url')}`;
}

async function callNominatim(address: string): Promise<GeoCoords | null> {
  const url = new URL(NOMINATIM_URL);
  url.searchParams.set('format', 'json');
  url.searchParams.set('q', address);
  url.searchParams.set('limit', '1');
  url.searchParams.set('countrycodes', COUNTRY_CODES);
  url.searchParams.set('addressdetails', '0');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn(
        `[geocodingService.callNominatim] Non-OK response status=${res.status} address="${address}"`,
      );
      return null;
    }
    const json = (await res.json()) as NominatimHit[];
    const hit = json[0];
    if (!hit) return null;
    const lat = Number(hit.lat);
    const lng = Number(hit.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  } catch (error) {
    console.warn(
      `[geocodingService.callNominatim] Fetch failed for address="${address}":`,
      error instanceof Error ? error.message : String(error),
    );
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// =====================================================
// Public API
// =====================================================

/**
 * Geocode a single address. Returns `null` on missing input or network failure so
 * callers can fall through without throwing.
 */
export async function geocodeAddress(address: string | null | undefined): Promise<GeoCoords | null> {
  if (!address || !address.trim()) return null;

  const key = geocodeCacheKey(address);
  const cached = await cacheGet<GeoCoords | null>(key);
  if (cached !== null) return cached;

  const coords = await enqueue(() => callNominatim(address));

  // Cache both hits and explicit misses. Caching the miss avoids re-hitting Nominatim
  // every 3 minutes (matches list TTL) for an address that doesn't resolve. We use a
  // shorter TTL on misses so a fixed/refined address gets picked up within a day.
  if (coords) {
    await cacheSet(key, coords, CACHE_TTL.GEOCODING);
  } else {
    await cacheSet(key, null, CACHE_TTL.SINGLE_ENTITY);
  }

  return coords;
}

/**
 * Geocode multiple addresses, deduplicating identical ones so the network/rate-limit
 * cost scales with the unique-address count instead of the input length.
 *
 * Returns a Map keyed by the original (un-normalized) input string the caller passed in,
 * so callers can map back without re-running normalizeAddress.
 */
export async function geocodeAddresses(
  addresses: ReadonlyArray<string | null | undefined>,
): Promise<Map<string, GeoCoords | null>> {
  const result = new Map<string, GeoCoords | null>();
  const uniques = new Map<string, string>(); // normalized -> original

  for (const a of addresses) {
    if (!a || !a.trim()) continue;
    const norm = normalizeAddress(a);
    if (!uniques.has(norm)) {
      uniques.set(norm, a);
    }
  }

  // Resolve each unique address sequentially through the rate-limited queue.
  // Promise.all is fine: enqueue() serializes the actual network calls internally.
  const entries = await Promise.all(
    Array.from(uniques.values()).map(async (original) => {
      const coords = await geocodeAddress(original);
      return [original, coords] as const;
    }),
  );

  // Map back to ALL inputs (preserves duplicates pointing to the same coords).
  const normToCoords = new Map<string, GeoCoords | null>();
  for (const [original, coords] of entries) {
    normToCoords.set(normalizeAddress(original), coords);
  }
  for (const a of addresses) {
    if (!a || !a.trim()) continue;
    const norm = normalizeAddress(a);
    result.set(a, normToCoords.get(norm) ?? null);
  }

  return result;
}

export const geocodingService = {
  geocodeAddress,
  geocodeAddresses,
};
