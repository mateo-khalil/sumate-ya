/**
 * Club Service — business logic for club listing and slot availability
 *
 * Decision Context:
 * - Why: Services return data only; caching and enum mapping live here, not in resolvers.
 * - Caching: clubs list uses LIST_QUERIES (1 h) — clubs rarely change. Slot availability
 *   uses DYNAMIC_DATA (3 min) — slots can become blocked when a match is created, so a
 *   short TTL keeps the list fresh without hammering the DB on every wizard interaction.
 * - Day-of-week mapping: clubSlots store `dayOfWeek` as a DB enum ('monday'…'sunday').
 *   The GraphQL argument `date` (YYYY-MM-DD) is converted to a day name here in the service
 *   layer, keeping the repository focused on DB access only.
 * - Timezone: parsing "YYYY-MM-DD" with time set to noon avoids the day-shift bug that
 *   occurs when JavaScript treats the string as UTC midnight and `getDay()` returns the
 *   previous local day for timezones behind UTC (e.g. UTC-3 for Argentina).
 * - CourtSurface enum mapping: DB values ('grass', 'synthetic', …) → GraphQL enum strings
 *   ('GRASS', 'SYNTHETIC', …) to match the generated codegen contract.
 * - MatchFormat enum mapping: same pattern as existing matchService.ts FORMAT mappings.
 * - Previously fixed bugs: none relevant.
 */

import { cacheGetOrSet, CACHE_PREFIX, CACHE_TTL } from '../config/redis.js';
import { supabase } from '../config/supabase.js';
import { CourtSurface, MatchFormat, type ClubDetail, type ClubSlot } from '../graphql/generated/graphql.js';
import { clubRepository, type ClubDetailRow } from '../repositories/clubRepository.js';
import { clubSlotRepository, type ClubSlotRow } from '../repositories/clubSlotRepository.js';
import type { ServiceContext } from '../types/context.js';

// =====================================================
// Day-of-Week Mapping (JS getDay() → DB enum)
// =====================================================

const JS_DAY_TO_DB: Record<number, string> = {
  0: 'sunday',
  1: 'monday',
  2: 'tuesday',
  3: 'wednesday',
  4: 'thursday',
  5: 'friday',
  6: 'saturday',
};

/** Convert "YYYY-MM-DD" date string to the DB dayOfWeek enum value. */
export function dateToDayOfWeek(dateStr: string): string {
  // Use T12:00:00 to avoid timezone-shift issues (see Decision Context above).
  const d = new Date(`${dateStr}T12:00:00`);
  const dayIdx = d.getDay();
  const dayName = JS_DAY_TO_DB[dayIdx];
  if (!dayName) throw new Error(`Invalid date: ${dateStr}`);
  return dayName;
}

// =====================================================
// Enum Mapping (DB → GraphQL)
// =====================================================

const DB_TO_SURFACE: Record<string, CourtSurface> = {
  grass: CourtSurface.Grass,
  synthetic: CourtSurface.Synthetic,
  concrete: CourtSurface.Concrete,
  indoor: CourtSurface.Indoor,
};

const DB_TO_FORMAT: Record<string, MatchFormat> = {
  '5v5': MatchFormat.FiveVsFive,
  '7v7': MatchFormat.SevenVsSeven,
  '10v10': MatchFormat.TenVsTen,
  '11v11': MatchFormat.ElevenVsEleven,
};

// =====================================================
// Data Transformation (DB rows → GraphQL types)
// =====================================================

function toClubDetail(row: ClubDetailRow): ClubDetail {
  return {
    id: row.id,
    name: row.name,
    zone: row.zone,
    address: row.address,
    phone: row.phone,
    description: row.description,
    imageUrl: row.imageUrl,
  };
}

function toClubSlot(row: ClubSlotRow): ClubSlot {
  return {
    id: row.id,
    clubId: row.clubId,
    dayOfWeek: row.dayOfWeek,
    startTime: row.startTime,
    endTime: row.endTime,
    priceArs: row.priceArs,
    court: {
      id: row.courts.id,
      name: row.courts.name,
      maxFormat: DB_TO_FORMAT[row.courts.maxFormat] ?? MatchFormat.ElevenVsEleven,
      surface: DB_TO_SURFACE[row.courts.surface] ?? CourtSurface.Synthetic,
      isIndoor: row.courts.isIndoor,
    },
  };
}

// =====================================================
// Service Functions
// =====================================================

/**
 * List all clubs. Public endpoint.
 * Cached for 1 hour — club data changes infrequently.
 */
export async function listClubs(_ctx: ServiceContext): Promise<ClubDetail[]> {
  const db = supabase; // public read — service-role singleton is fine

  const rows = await cacheGetOrSet<ClubDetailRow[]>(
    CACHE_PREFIX.CLUBS_LIST,
    () => clubRepository.listClubs(db),
    CACHE_TTL.LIST_QUERIES,
  );

  return rows.map(toClubDetail);
}

/**
 * Return non-blocked slots for a club on a given calendar date (YYYY-MM-DD).
 * Filters by the day of week derived from the date. Requires auth (called from a
 * protected wizard step), but reads are public so the singleton client is safe.
 *
 * Cache key includes clubId + date so different date queries don't collide.
 * TTL = DYNAMIC_DATA (3 min) to pick up slot blockages quickly after a match is created.
 */
export async function getClubSlots(
  _ctx: ServiceContext,
  clubId: string,
  date: string,
): Promise<ClubSlot[]> {
  const dayOfWeek = dateToDayOfWeek(date);
  const cacheKey = `clubSlots:${clubId}:${date}`;

  const rows = await cacheGetOrSet<ClubSlotRow[]>(
    cacheKey,
    () => clubSlotRepository.getSlotsByClubAndDay(clubId, dayOfWeek),
    CACHE_TTL.DYNAMIC_DATA,
  );

  return rows.map(toClubSlot);
}

export const clubService = { listClubs, getClubSlots };
