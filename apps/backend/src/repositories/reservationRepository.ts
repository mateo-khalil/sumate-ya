/**
 * Reservation Repository — CRUD for club admin manual court bookings (Reservas)
 *
 * Decision Context:
 * - New table `reservations` (migration create_reservations_table). All access goes through the
 *   user-scoped client so the reservations RLS policies (scoped to clubs.ownerId = auth.uid())
 *   are the real gate. Egress prevention: explicit column constants, never select('*').
 * - courts(name) is joined so the list returns a denormalised court name for the UI.
 * - Overlap detection: getActiveReservationsForCourtInRange returns candidate rows; the service
 *   computes the actual overlap using reservedAt + durationMin (interval math is clearer in JS
 *   than in a PostgREST filter). The window is widened by a day on the low side so a long
 *   reservation starting before the target window is still considered.
 * - Previously fixed bugs: none relevant (new repository).
 */

import { supabase, type SupabaseClient } from '../config/supabase.js';

// =====================================================
// Column definitions (egress prevention)
// =====================================================

const RESERVATION_COLUMNS = `
  id,
  "clubId",
  "courtId",
  "reservedAt",
  "durationMin",
  status,
  "playerId",
  "contactName",
  "contactPhone",
  "priceArs",
  notes,
  "createdAt",
  "updatedAt"
`;

// =====================================================
// Types
// =====================================================

export interface ReservationRow {
  id: string;
  clubId: string;
  courtId: string;
  reservedAt: string;
  durationMin: number;
  status: string;
  playerId: string | null;
  contactName: string | null;
  contactPhone: string | null;
  priceArs: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  courts: { name: string } | null;
}

export interface ReservationListFilters {
  startISO?: string;
  endISO?: string;
  courtId?: string;
  status?: string;
}

export interface CreateReservationData {
  clubId: string;
  courtId: string;
  reservedAt: string;
  durationMin: number;
  playerId: string | null;
  contactName: string | null;
  contactPhone: string | null;
  priceArs: number | null;
  notes: string | null;
  createdBy: string;
}

export interface UpdateReservationData {
  courtId?: string;
  reservedAt?: string;
  durationMin?: number;
  playerId?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  status?: string;
  priceArs?: number | null;
  notes?: string | null;
}

export interface OverlapCandidateRow {
  id: string;
  reservedAt: string;
  durationMin: number;
}

// =====================================================
// Read operations
// =====================================================

/** List reservations for a club, newest first, with optional filters. */
export async function listByClub(
  clubId: string,
  filters: ReservationListFilters,
  client: SupabaseClient = supabase,
): Promise<ReservationRow[]> {
  let query = client
    .from('reservations')
    .select(`${RESERVATION_COLUMNS}, courts(name)`)
    .eq('clubId', clubId);

  if (filters.startISO) query = query.gte('reservedAt', filters.startISO);
  if (filters.endISO) query = query.lte('reservedAt', filters.endISO);
  if (filters.courtId) query = query.eq('courtId', filters.courtId);
  if (filters.status) query = query.eq('status', filters.status);

  const { data, error } = await query.order('reservedAt', { ascending: false });

  if (error) {
    console.error(
      `[reservationRepository.listByClub] Supabase error for clubId=${clubId}:`,
      error.message,
    );
    throw new Error(error.message);
  }

  return (data as unknown as ReservationRow[]) ?? [];
}

/** Fetch a single reservation by id. */
export async function getById(
  reservationId: string,
  client: SupabaseClient = supabase,
): Promise<ReservationRow | null> {
  const { data, error } = await client
    .from('reservations')
    .select(`${RESERVATION_COLUMNS}, courts(name)`)
    .eq('id', reservationId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    console.error(
      `[reservationRepository.getById] Supabase error for reservationId=${reservationId}:`,
      error.message,
    );
    throw new Error(error.message);
  }

  return data as unknown as ReservationRow;
}

/**
 * Return non-cancelled reservations on a court within a datetime window (for overlap checks).
 * The caller passes a window already widened to capture reservations that start before but
 * extend into the target slot.
 */
export async function getActiveReservationsForCourtInRange(
  courtId: string,
  fromISO: string,
  toISO: string,
  client: SupabaseClient = supabase,
): Promise<OverlapCandidateRow[]> {
  const { data, error } = await client
    .from('reservations')
    .select('id, "reservedAt", "durationMin"')
    .eq('courtId', courtId)
    .neq('status', 'cancelled')
    .gte('reservedAt', fromISO)
    .lte('reservedAt', toISO);

  if (error) {
    console.error(
      `[reservationRepository.getActiveReservationsForCourtInRange] Supabase error courtId=${courtId}:`,
      error.message,
    );
    throw new Error(error.message);
  }

  return (data as unknown as OverlapCandidateRow[]) ?? [];
}

// =====================================================
// Write operations
// =====================================================

export async function create(
  data: CreateReservationData,
  client: SupabaseClient = supabase,
): Promise<ReservationRow> {
  const { data: inserted, error } = await client
    .from('reservations')
    .insert({
      clubId: data.clubId,
      courtId: data.courtId,
      reservedAt: data.reservedAt,
      durationMin: data.durationMin,
      playerId: data.playerId,
      contactName: data.contactName,
      contactPhone: data.contactPhone,
      priceArs: data.priceArs,
      notes: data.notes,
      createdBy: data.createdBy,
    })
    .select(`${RESERVATION_COLUMNS}, courts(name)`)
    .single();

  if (error) {
    console.error(
      `[reservationRepository.create] Supabase error for clubId=${data.clubId}:`,
      error.message,
    );
    throw new Error(error.message);
  }

  return inserted as unknown as ReservationRow;
}

export async function update(
  reservationId: string,
  updates: UpdateReservationData,
  client: SupabaseClient = supabase,
): Promise<ReservationRow> {
  const { data, error } = await client
    .from('reservations')
    .update({ ...updates, updatedAt: new Date().toISOString() })
    .eq('id', reservationId)
    .select(`${RESERVATION_COLUMNS}, courts(name)`)
    .single();

  if (error) {
    console.error(
      `[reservationRepository.update] Supabase error for reservationId=${reservationId}:`,
      error.message,
    );
    throw new Error(error.message);
  }

  return data as unknown as ReservationRow;
}

export async function remove(
  reservationId: string,
  client: SupabaseClient = supabase,
): Promise<void> {
  const { error } = await client.from('reservations').delete().eq('id', reservationId);

  if (error) {
    console.error(
      `[reservationRepository.remove] Supabase error for reservationId=${reservationId}:`,
      error.message,
    );
    throw new Error(error.message);
  }
}

export const reservationRepository = {
  listByClub,
  getById,
  getActiveReservationsForCourtInRange,
  create,
  update,
  remove,
};
