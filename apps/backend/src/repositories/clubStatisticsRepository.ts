/**
 * Club Statistics Repository — read-only aggregation source for the Estadísticas page
 *
 * Decision Context:
 * - Pure reads over existing tables (matches, matchParticipants, clubSlots, reservations).
 *   No writes, so a public/service-role or user-scoped client both work; the service passes the
 *   user-scoped client so RLS still applies (matches/clubSlots are publicly readable; the join
 *   stays consistent with the rest of the admin surface).
 * - Egress prevention: explicit columns only, never select('*').
 * - Each method is a single club-wide query over the date range; the service does the
 *   bucketing/aggregation in memory (clearer than many grouped SQL round-trips, and the row
 *   counts here are bounded by one club's activity in a ≤365-day window).
 * - Previously fixed bugs: none relevant (new repository).
 */

import { supabase, type SupabaseClient } from '../config/supabase.js';

export interface StatMatchRow {
  id: string;
  status: string;
  scheduledAt: string;
  courtId: string | null;
  clubSlotId: string | null;
}

export interface StatReservationRow {
  status: string;
  courtId: string | null;
  priceArs: number | null;
  reservedAt: string;
}

/** Matches for a club within [startISO, endISO] (all statuses). */
export async function getMatchesInRange(
  clubId: string,
  startISO: string,
  endISO: string,
  client: SupabaseClient = supabase,
): Promise<StatMatchRow[]> {
  const { data, error } = await client
    .from('matches')
    .select('id, status, "scheduledAt", "courtId", "clubSlotId"')
    .eq('clubId', clubId)
    .gte('scheduledAt', startISO)
    .lte('scheduledAt', endISO);

  if (error) {
    console.error(
      `[clubStatisticsRepository.getMatchesInRange] Supabase error for clubId=${clubId}:`,
      error.message,
    );
    throw new Error(error.message);
  }

  return (data as unknown as StatMatchRow[]) ?? [];
}

/** Map of clubSlotId → priceArs for the given slot ids (for revenue). */
export async function getSlotPrices(
  slotIds: string[],
  client: SupabaseClient = supabase,
): Promise<Record<string, number>> {
  if (slotIds.length === 0) return {};

  const { data, error } = await client
    .from('clubSlots')
    .select('id, "priceArs"')
    .in('id', slotIds);

  if (error) {
    console.error('[clubStatisticsRepository.getSlotPrices] Supabase error:', error.message);
    throw new Error(error.message);
  }

  const prices: Record<string, number> = {};
  for (const row of (data ?? []) as Array<{ id: string; priceArs: number | null }>) {
    prices[row.id] = row.priceArs ?? 0;
  }
  return prices;
}

/** Distinct player ids participating in the given matches (unique-player metric). */
export async function getParticipantPlayerIds(
  matchIds: string[],
  client: SupabaseClient = supabase,
): Promise<string[]> {
  if (matchIds.length === 0) return [];

  const { data, error } = await client
    .from('matchParticipants')
    .select('"playerId"')
    .in('matchId', matchIds);

  if (error) {
    console.error(
      '[clubStatisticsRepository.getParticipantPlayerIds] Supabase error:',
      error.message,
    );
    throw new Error(error.message);
  }

  return [...new Set((data ?? []).map((r: { playerId: string }) => r.playerId))];
}

/** Reservations for a club within [startISO, endISO] (all statuses). */
export async function getReservationsInRange(
  clubId: string,
  startISO: string,
  endISO: string,
  client: SupabaseClient = supabase,
): Promise<StatReservationRow[]> {
  const { data, error } = await client
    .from('reservations')
    .select('status, "courtId", "priceArs", "reservedAt"')
    .eq('clubId', clubId)
    .gte('reservedAt', startISO)
    .lte('reservedAt', endISO);

  if (error) {
    console.error(
      `[clubStatisticsRepository.getReservationsInRange] Supabase error for clubId=${clubId}:`,
      error.message,
    );
    throw new Error(error.message);
  }

  return (data as unknown as StatReservationRow[]) ?? [];
}

export const clubStatisticsRepository = {
  getMatchesInRange,
  getSlotPrices,
  getParticipantPlayerIds,
  getReservationsInRange,
};
