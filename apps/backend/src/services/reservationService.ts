/**
 * Reservation Service — business logic for club admin manual court bookings (Reservas)
 *
 * Decision Context:
 * - Services return data only; validation, overlap detection, enum mapping, player enrichment
 *   and caching live here. Mirrors courtService / clubSlotManagementService.
 * - Booker model: a reservation must carry EITHER a playerId (app user) OR a contactName
 *   (manual). We validate this before the DB so the user sees a friendly message rather than
 *   the raw CHECK-constraint failure (reservations_booker_required).
 * - Court ownership: the target court must belong to the caller's club (defense-in-depth on top
 *   of RLS), else "Cancha no encontrada".
 * - Overlap guard: a new/edited CONFIRMED/COMPLETED reservation may not overlap another
 *   non-cancelled reservation on the same court. Computed here from reservedAt + durationMin.
 *   Cancelling a reservation never triggers the guard.
 * - Player enrichment: playerIds are resolved to minimal profiles in one batched query
 *   (getProfilesByIds) — no N+1.
 * - Caching: list cached per club+filters at DYNAMIC_DATA TTL; invalidated club-wide on every
 *   mutation via cacheDeletePattern (reservations change often, so a short TTL + pattern bust
 *   keeps the list fresh without stale filter permutations).
 * - Previously fixed bugs: none relevant (new feature).
 */

import { cacheGetOrSet, cacheDeletePattern, CACHE_TTL } from '../config/redis.js';
import { supabase } from '../config/supabase.js';
import {
  ReservationStatus,
  type Reservation,
  type ReservationPlayer,
  type ReservationFilters,
  type CreateReservationInput,
  type UpdateReservationInput,
} from '../graphql/generated/graphql.js';
import {
  reservationRepository,
  type ReservationRow,
} from '../repositories/reservationRepository.js';
import {
  getClubByOwnerId,
  getProfilesByIds,
} from '../repositories/clubSlotManagementRepository.js';
import { courtRepository } from '../repositories/courtRepository.js';
import type { ServiceContext } from '../types/context.js';

// =====================================================
// Constants / enum mapping
// =====================================================

const MAX_DURATION_MIN = 600;
// Widen the overlap-scan window on the low side by the max duration so a long reservation
// starting before the target still surfaces as a candidate.
const OVERLAP_WINDOW_LOW_MS = (MAX_DURATION_MIN + 60) * 60 * 1000;

const reservationsKeyPattern = (clubId: string) => `clubReservations:${clubId}:*`;
const reservationsKey = (clubId: string, filters: ReservationFilters | null | undefined) =>
  `clubReservations:${clubId}:${JSON.stringify({
    s: filters?.startDate ?? null,
    e: filters?.endDate ?? null,
    c: filters?.courtId ?? null,
    st: filters?.status ?? null,
  })}`;

const DB_TO_STATUS: Record<string, ReservationStatus> = {
  confirmed: ReservationStatus.Confirmed,
  cancelled: ReservationStatus.Cancelled,
  completed: ReservationStatus.Completed,
};

const STATUS_TO_DB: Record<ReservationStatus, string> = {
  [ReservationStatus.Confirmed]: 'confirmed',
  [ReservationStatus.Cancelled]: 'cancelled',
  [ReservationStatus.Completed]: 'completed',
};

// =====================================================
// Helpers
// =====================================================

async function resolveClubId(ctx: ServiceContext): Promise<string> {
  if (!ctx.userId) throw new Error('Autenticación requerida');
  const db = ctx.supabase ?? supabase;
  const club = await getClubByOwnerId(ctx.userId, db);
  if (!club) throw new Error('No se encontró un club asociado a tu cuenta');
  return club.id;
}

/** Validate + normalise an ISO datetime to a canonical UTC ISO string. */
function normalizeReservedAt(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new Error('Fecha y hora de la reserva inválida');
  return d.toISOString();
}

function validateDuration(durationMin: number | null | undefined): number {
  const d = durationMin ?? 60;
  if (!Number.isInteger(d) || d <= 0 || d > MAX_DURATION_MIN) {
    throw new Error('La duración debe estar entre 1 y 600 minutos');
  }
  return d;
}

interface BookerFields {
  playerId: string | null;
  contactName: string | null;
  contactPhone: string | null;
}

function resolveBooker(input: {
  playerId?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
}): BookerFields {
  const playerId = input.playerId?.trim() || null;
  const contactName = input.contactName?.trim() || null;
  const contactPhone = input.contactPhone?.trim() || null;
  if (!playerId && !contactName) {
    throw new Error('Indicá un jugador de la app o un nombre de contacto para la reserva');
  }
  // When linked to an app user we still allow a contact phone, but clear a redundant name.
  return { playerId, contactName: playerId ? contactName : contactName, contactPhone };
}

/** Verify the court belongs to the caller's club. */
async function assertCourtInClub(
  ctx: ServiceContext,
  clubId: string,
  courtId: string,
): Promise<void> {
  const db = ctx.supabase ?? supabase;
  const court = await courtRepository.getCourtById(courtId, db);
  if (!court || court.clubId !== clubId) throw new Error('Cancha no encontrada');
}

/**
 * Throws if [reservedAt, reservedAt+duration) overlaps a non-cancelled reservation on the same
 * court (excluding excludeId). Skipped for cancelled target state.
 */
async function assertNoOverlap(
  ctx: ServiceContext,
  courtId: string,
  reservedAtISO: string,
  durationMin: number,
  excludeId: string | null,
): Promise<void> {
  const db = ctx.supabase ?? supabase;
  const newStart = new Date(reservedAtISO).getTime();
  const newEnd = newStart + durationMin * 60 * 1000;
  const fromISO = new Date(newStart - OVERLAP_WINDOW_LOW_MS).toISOString();
  const toISO = new Date(newEnd).toISOString();

  const candidates = await reservationRepository.getActiveReservationsForCourtInRange(
    courtId,
    fromISO,
    toISO,
    db,
  );

  for (const c of candidates) {
    if (excludeId && c.id === excludeId) continue;
    const cStart = new Date(c.reservedAt).getTime();
    const cEnd = cStart + c.durationMin * 60 * 1000;
    if (cStart < newEnd && cEnd > newStart) {
      throw new Error('Esa cancha ya tiene una reserva que se superpone en ese horario');
    }
  }
}

function toReservation(row: ReservationRow, player: ReservationPlayer | null): Reservation {
  return {
    id: row.id,
    clubId: row.clubId,
    courtId: row.courtId,
    courtName: row.courts?.name ?? 'Cancha',
    reservedAt: row.reservedAt,
    durationMin: row.durationMin,
    status: DB_TO_STATUS[row.status] ?? ReservationStatus.Confirmed,
    player,
    contactName: row.contactName,
    contactPhone: row.contactPhone,
    priceArs: row.priceArs,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Resolve a single row's player (if any) and map to GraphQL. */
async function enrichOne(ctx: ServiceContext, row: ReservationRow): Promise<Reservation> {
  if (!row.playerId) return toReservation(row, null);
  const db = ctx.supabase ?? supabase;
  const profiles = await getProfilesByIds([row.playerId], db);
  const p = profiles[0];
  const player: ReservationPlayer | null = p
    ? { id: p.id, displayName: p.displayName, avatarUrl: p.avatarUrl }
    : null;
  return toReservation(row, player);
}

// =====================================================
// Service functions
// =====================================================

/** List reservations for the admin's club (filterable). Cached per club+filters. */
export async function getReservations(
  ctx: ServiceContext,
  filters?: ReservationFilters | null,
): Promise<Reservation[]> {
  const clubId = await resolveClubId(ctx);
  const db = ctx.supabase ?? supabase;

  return cacheGetOrSet<Reservation[]>(
    reservationsKey(clubId, filters),
    async () => {
      const rows = await reservationRepository.listByClub(
        clubId,
        {
          startISO: filters?.startDate ? `${filters.startDate}T00:00:00.000Z` : undefined,
          endISO: filters?.endDate ? `${filters.endDate}T23:59:59.999Z` : undefined,
          courtId: filters?.courtId ?? undefined,
          status: filters?.status ? STATUS_TO_DB[filters.status] : undefined,
        },
        db,
      );

      // Batch-resolve players across all rows (no N+1).
      const playerIds = [...new Set(rows.map((r) => r.playerId).filter(Boolean) as string[])];
      const profiles = playerIds.length ? await getProfilesByIds(playerIds, db) : [];
      const byId = new Map(profiles.map((p) => [p.id, p]));

      return rows.map((r) => {
        const p = r.playerId ? byId.get(r.playerId) : undefined;
        const player: ReservationPlayer | null = p
          ? { id: p.id, displayName: p.displayName, avatarUrl: p.avatarUrl }
          : null;
        return toReservation(r, player);
      });
    },
    CACHE_TTL.DYNAMIC_DATA,
  );
}

export async function createReservation(
  ctx: ServiceContext,
  input: CreateReservationInput,
): Promise<Reservation> {
  const clubId = await resolveClubId(ctx);
  const db = ctx.supabase ?? supabase;

  await assertCourtInClub(ctx, clubId, input.courtId);
  const reservedAt = normalizeReservedAt(input.reservedAt);
  const durationMin = validateDuration(input.durationMin);
  const booker = resolveBooker(input);
  if (input.priceArs != null && input.priceArs < 0) throw new Error('El precio no puede ser negativo');
  await assertNoOverlap(ctx, input.courtId, reservedAt, durationMin, null);

  const row = await reservationRepository.create(
    {
      clubId,
      courtId: input.courtId,
      reservedAt,
      durationMin,
      playerId: booker.playerId,
      contactName: booker.contactName,
      contactPhone: booker.contactPhone,
      priceArs: input.priceArs ?? null,
      notes: input.notes?.trim() || null,
      createdBy: ctx.userId!,
    },
    db,
  );

  await cacheDeletePattern(reservationsKeyPattern(clubId));
  console.info(`[reservationService.createReservation] Created reservation ${row.id} for clubId=${clubId}`);
  return enrichOne(ctx, row);
}

export async function updateReservation(
  ctx: ServiceContext,
  input: UpdateReservationInput,
): Promise<Reservation> {
  const clubId = await resolveClubId(ctx);
  const db = ctx.supabase ?? supabase;

  const existing = await reservationRepository.getById(input.reservationId, db);
  if (!existing || existing.clubId !== clubId) throw new Error('Reserva no encontrada');

  const targetCourtId = input.courtId ?? existing.courtId;
  if (input.courtId && input.courtId !== existing.courtId) {
    await assertCourtInClub(ctx, clubId, input.courtId);
  }

  const reservedAt = input.reservedAt ? normalizeReservedAt(input.reservedAt) : existing.reservedAt;
  const durationMin =
    input.durationMin != null ? validateDuration(input.durationMin) : existing.durationMin;

  const nextStatus = input.status ? STATUS_TO_DB[input.status] : existing.status;

  // Re-check overlap only when the reservation remains active and timing/court changed.
  const timingChanged =
    targetCourtId !== existing.courtId ||
    reservedAt !== existing.reservedAt ||
    durationMin !== existing.durationMin;
  if (nextStatus !== 'cancelled' && timingChanged) {
    await assertNoOverlap(ctx, targetCourtId, reservedAt, durationMin, existing.id);
  }

  const updates: Record<string, unknown> = {};
  if (input.courtId != null) updates.courtId = input.courtId;
  if (input.reservedAt != null) updates.reservedAt = reservedAt;
  if (input.durationMin != null) updates.durationMin = durationMin;
  if (input.status != null) updates.status = nextStatus;
  if (input.priceArs !== undefined) {
    if (input.priceArs != null && input.priceArs < 0) throw new Error('El precio no puede ser negativo');
    updates.priceArs = input.priceArs;
  }
  if (input.notes !== undefined) updates.notes = input.notes?.trim() || null;

  // Booker: if any booker field is provided, re-validate the pair against the merged result.
  if (input.playerId !== undefined || input.contactName !== undefined || input.contactPhone !== undefined) {
    const booker = resolveBooker({
      playerId: input.playerId !== undefined ? input.playerId : existing.playerId,
      contactName: input.contactName !== undefined ? input.contactName : existing.contactName,
      contactPhone: input.contactPhone !== undefined ? input.contactPhone : existing.contactPhone,
    });
    updates.playerId = booker.playerId;
    updates.contactName = booker.contactName;
    updates.contactPhone = booker.contactPhone;
  }

  if (Object.keys(updates).length === 0) throw new Error('No hay cambios para guardar');

  const row = await reservationRepository.update(input.reservationId, updates, db);
  await cacheDeletePattern(reservationsKeyPattern(clubId));
  console.info(`[reservationService.updateReservation] Updated reservation ${row.id} for clubId=${clubId}`);
  return enrichOne(ctx, row);
}

export async function cancelReservation(
  ctx: ServiceContext,
  reservationId: string,
): Promise<Reservation> {
  const clubId = await resolveClubId(ctx);
  const db = ctx.supabase ?? supabase;

  const existing = await reservationRepository.getById(reservationId, db);
  if (!existing || existing.clubId !== clubId) throw new Error('Reserva no encontrada');

  const row = await reservationRepository.update(reservationId, { status: 'cancelled' }, db);
  await cacheDeletePattern(reservationsKeyPattern(clubId));
  console.info(`[reservationService.cancelReservation] Cancelled reservation ${reservationId} for clubId=${clubId}`);
  return enrichOne(ctx, row);
}

export async function deleteReservation(
  ctx: ServiceContext,
  reservationId: string,
): Promise<void> {
  const clubId = await resolveClubId(ctx);
  const db = ctx.supabase ?? supabase;

  const existing = await reservationRepository.getById(reservationId, db);
  if (!existing || existing.clubId !== clubId) throw new Error('Reserva no encontrada');

  await reservationRepository.remove(reservationId, db);
  await cacheDeletePattern(reservationsKeyPattern(clubId));
  console.info(`[reservationService.deleteReservation] Deleted reservation ${reservationId} for clubId=${clubId}`);
}

export const reservationService = {
  getReservations,
  createReservation,
  updateReservation,
  cancelReservation,
  deleteReservation,
};
