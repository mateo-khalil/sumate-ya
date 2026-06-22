/**
 * Court Repository — CRUD for club admin court management
 *
 * Decision Context:
 * - Why a dedicated repo: courts were previously only read indirectly (via the dashboard /
 *   slot management joins). The Canchas admin feature needs first-class CRUD plus referencing
 *   counts (slots, upcoming matches, reservations) to power badges and the delete guard.
 * - All writes go through the user-scoped client so the new courts RLS policies
 *   (courts_admin_insert/update/delete, scoped to clubs.ownerId = auth.uid()) are enforced.
 * - Egress prevention: explicit column constants, never select('*').
 * - Counts are fetched club-wide in one query each and aggregated in JS (avoids N+1 per court).
 * - deleteCourt removes the dependent courtPricing row first (FK) — only ever reached when the
 *   service has already verified there are no slots/matches/reservations referencing the court.
 * - Previously fixed bugs: none relevant (new repository).
 */

import { supabase, type SupabaseClient } from '../config/supabase.js';

// =====================================================
// Column definitions (egress prevention)
// =====================================================

const COURT_COLUMNS = `id, "clubId", name, surface, "isIndoor", "maxFormat", "createdAt"`;

// =====================================================
// Types
// =====================================================

export interface CourtRow {
  id: string;
  clubId: string;
  name: string;
  surface: string;
  isIndoor: boolean;
  maxFormat: string;
  createdAt: string;
}

export interface CreateCourtData {
  clubId: string;
  name: string;
  surface: string;
  isIndoor: boolean;
  maxFormat: string;
}

export interface UpdateCourtData {
  name?: string;
  surface?: string;
  isIndoor?: boolean;
  maxFormat?: string;
}

export interface CourtReferenceCounts {
  slots: number;
  upcomingMatches: number;
  reservations: number;
}

// =====================================================
// Read operations
// =====================================================

/** List all courts for a club, alphabetical by name. */
export async function getCourtsByClubId(
  clubId: string,
  client: SupabaseClient = supabase,
): Promise<CourtRow[]> {
  const { data, error } = await client
    .from('courts')
    .select(COURT_COLUMNS)
    .eq('clubId', clubId)
    .order('name', { ascending: true });

  if (error) {
    console.error(
      `[courtRepository.getCourtsByClubId] Supabase error for clubId=${clubId}:`,
      error.message,
    );
    throw new Error(error.message);
  }

  return (data as unknown as CourtRow[]) ?? [];
}

/** Fetch a single court by id (post-mutation response / ownership validation). */
export async function getCourtById(
  courtId: string,
  client: SupabaseClient = supabase,
): Promise<CourtRow | null> {
  const { data, error } = await client
    .from('courts')
    .select(COURT_COLUMNS)
    .eq('id', courtId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    console.error(
      `[courtRepository.getCourtById] Supabase error for courtId=${courtId}:`,
      error.message,
    );
    throw new Error(error.message);
  }

  return data as unknown as CourtRow;
}

/**
 * Returns per-court slot counts (total and active) for a club, keyed by courtId.
 * One query, aggregated in JS to avoid an N+1 per court.
 */
export async function getSlotCountsByClub(
  clubId: string,
  client: SupabaseClient = supabase,
): Promise<Record<string, { total: number; active: number }>> {
  const { data, error } = await client
    .from('clubSlots')
    .select('"courtId", "isActive"')
    .eq('clubId', clubId);

  if (error) {
    console.error(
      `[courtRepository.getSlotCountsByClub] Supabase error for clubId=${clubId}:`,
      error.message,
    );
    throw new Error(error.message);
  }

  const counts: Record<string, { total: number; active: number }> = {};
  for (const row of (data ?? []) as Array<{ courtId: string; isActive: boolean }>) {
    if (!counts[row.courtId]) counts[row.courtId] = { total: 0, active: 0 };
    counts[row.courtId].total += 1;
    if (row.isActive) counts[row.courtId].active += 1;
  }
  return counts;
}

/**
 * Returns per-court count of future non-cancelled matches for a club, keyed by courtId.
 */
export async function getUpcomingMatchCountsByClub(
  clubId: string,
  client: SupabaseClient = supabase,
): Promise<Record<string, number>> {
  const { data, error } = await client
    .from('matches')
    .select('"courtId"')
    .eq('clubId', clubId)
    .not('courtId', 'is', null)
    .neq('status', 'cancelled')
    .gte('scheduledAt', new Date().toISOString());

  if (error) {
    console.error(
      `[courtRepository.getUpcomingMatchCountsByClub] Supabase error for clubId=${clubId}:`,
      error.message,
    );
    throw new Error(error.message);
  }

  const counts: Record<string, number> = {};
  for (const row of (data ?? []) as Array<{ courtId: string | null }>) {
    if (!row.courtId) continue;
    counts[row.courtId] = (counts[row.courtId] ?? 0) + 1;
  }
  return counts;
}

/**
 * Counts every kind of row that references a court — used by the delete guard.
 * `upcomingMatches` only counts future non-cancelled matches; past/cancelled matches still
 * carry a FK so the court is never hard-deleted while any match references it (we count all).
 */
export async function getCourtReferenceCounts(
  courtId: string,
  client: SupabaseClient = supabase,
): Promise<CourtReferenceCounts> {
  const [slots, matches, reservations] = await Promise.all([
    client.from('clubSlots').select('id', { count: 'exact', head: true }).eq('courtId', courtId),
    client.from('matches').select('id', { count: 'exact', head: true }).eq('courtId', courtId),
    client.from('reservations').select('id', { count: 'exact', head: true }).eq('courtId', courtId),
  ]);

  for (const [label, res] of [
    ['clubSlots', slots],
    ['matches', matches],
    ['reservations', reservations],
  ] as const) {
    if (res.error) {
      console.error(
        `[courtRepository.getCourtReferenceCounts] Supabase error (${label}) courtId=${courtId}:`,
        res.error.message,
      );
      throw new Error(res.error.message);
    }
  }

  return {
    slots: slots.count ?? 0,
    upcomingMatches: matches.count ?? 0,
    reservations: reservations.count ?? 0,
  };
}

// =====================================================
// Write operations
// =====================================================

/** Insert a new court. User-scoped client → RLS enforces club ownership. */
export async function createCourt(
  data: CreateCourtData,
  client: SupabaseClient = supabase,
): Promise<CourtRow> {
  const { data: inserted, error } = await client
    .from('courts')
    .insert({
      clubId: data.clubId,
      name: data.name,
      surface: data.surface,
      isIndoor: data.isIndoor,
      maxFormat: data.maxFormat,
    })
    .select(COURT_COLUMNS)
    .single();

  if (error) {
    console.error(
      `[courtRepository.createCourt] Supabase error for clubId=${data.clubId}:`,
      error.message,
    );
    throw new Error(error.message);
  }

  return inserted as unknown as CourtRow;
}

/** Update mutable court fields. User-scoped client → RLS enforces club ownership. */
export async function updateCourt(
  courtId: string,
  updates: UpdateCourtData,
  client: SupabaseClient = supabase,
): Promise<CourtRow> {
  const { data, error } = await client
    .from('courts')
    .update({ ...updates, updatedAt: new Date().toISOString() })
    .eq('id', courtId)
    .select(COURT_COLUMNS)
    .single();

  if (error) {
    console.error(
      `[courtRepository.updateCourt] Supabase error for courtId=${courtId}:`,
      error.message,
    );
    throw new Error(error.message);
  }

  return data as unknown as CourtRow;
}

/**
 * Hard-delete a court. Removes the dependent courtPricing row first (FK constraint).
 * The service guarantees no slots/matches/reservations reference the court before calling.
 */
export async function deleteCourt(
  courtId: string,
  client: SupabaseClient = supabase,
): Promise<void> {
  const { error: pricingError } = await client
    .from('courtPricing')
    .delete()
    .eq('courtId', courtId);

  if (pricingError) {
    console.error(
      `[courtRepository.deleteCourt] Supabase error deleting courtPricing for courtId=${courtId}:`,
      pricingError.message,
    );
    throw new Error(pricingError.message);
  }

  const { error } = await client.from('courts').delete().eq('id', courtId);

  if (error) {
    console.error(
      `[courtRepository.deleteCourt] Supabase error for courtId=${courtId}:`,
      error.message,
    );
    throw new Error(error.message);
  }
}

export const courtRepository = {
  getCourtsByClubId,
  getCourtById,
  getSlotCountsByClub,
  getUpcomingMatchCountsByClub,
  getCourtReferenceCounts,
  createCourt,
  updateCourt,
  deleteCourt,
};
