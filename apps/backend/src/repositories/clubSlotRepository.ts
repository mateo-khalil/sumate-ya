/**
 * ClubSlot Repository — DB access for `clubSlots` and the related `courts` table
 *
 * Decision Context:
 * - Why joined query: the frontend wizard step needs `court.maxFormat` immediately to
 *   disable incompatible format options. A join avoids a second round-trip and prevents
 *   N+1 resolvers on the ClubSlot.court field.
 * - `dayOfWeek` is filtered using the DB enum string value ('monday', 'tuesday', …).
 *   The service layer converts a calendar date to the matching enum value before calling
 *   this function. Keeping the conversion in the service means the repo stays DB-focused.
 * - Only non-blocked slots are returned because blocked slots must never be bookable.
 *   The calling service still validates `isBlocked = false` again at create time to guard
 *   against race conditions between the list query and the mutation.
 * - Previously fixed bugs: none relevant.
 */

import { supabase, type SupabaseClient } from '../config/supabase.js';

// =====================================================
// Column Definitions
// =====================================================

const COURT_COLUMNS = `id, name, "maxFormat", surface, "isIndoor"`;

const SLOT_COLUMNS = `
  id,
  "clubId",
  "courtId",
  "dayOfWeek",
  "startTime",
  "endTime",
  "priceArs",
  "isBlocked"
`;

// =====================================================
// Types
// =====================================================

export interface CourtRow {
  id: string;
  name: string;
  maxFormat: string; // DB enum value: '5v5' | '7v7' | '10v10' | '11v11'
  surface: string;
  isIndoor: boolean;
}

export interface ClubSlotRow {
  id: string;
  clubId: string;
  courtId: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  priceArs: number | null;
  isBlocked: boolean;
  courts: CourtRow;
}

// =====================================================
// Repository Functions
// =====================================================

/**
 * Returns non-blocked slots for a club on a given day of week, including court details.
 * `dayOfWeek` must be one of: 'monday'|'tuesday'|'wednesday'|'thursday'|'friday'|'saturday'|'sunday'
 */
export async function getSlotsByClubAndDay(
  clubId: string,
  dayOfWeek: string,
  client: SupabaseClient = supabase,
): Promise<ClubSlotRow[]> {
  const { data, error } = await client
    .from('clubSlots')
    .select(`${SLOT_COLUMNS}, courts(${COURT_COLUMNS})`)
    .eq('clubId', clubId)
    .eq('dayOfWeek', dayOfWeek)
    .eq('isBlocked', false)
    .order('startTime', { ascending: true });

  if (error) {
    console.error(
      `[clubSlotRepository.getSlotsByClubAndDay] Supabase error clubId=${clubId} day=${dayOfWeek}:`,
      error.message,
    );
    throw new Error(error.message);
  }

  return (data as unknown as ClubSlotRow[]) ?? [];
}

/**
 * Fetch a single slot by ID including court details.
 * Used by createMatch service to validate slot state at write time.
 */
export async function getSlotById(
  id: string,
  client: SupabaseClient = supabase,
): Promise<ClubSlotRow | null> {
  const { data, error } = await client
    .from('clubSlots')
    .select(`${SLOT_COLUMNS}, courts(${COURT_COLUMNS})`)
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    console.error(`[clubSlotRepository.getSlotById] Supabase error for slotId=${id}:`, error.message);
    throw new Error(error.message);
  }

  return data as unknown as ClubSlotRow;
}

export const clubSlotRepository = { getSlotsByClubAndDay, getSlotById };
