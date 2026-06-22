/**
 * useClubReservations — React hook for club reservation management (Reservas)
 *
 * Decision Context:
 * - SSR-hydrated initial list (default filters), accessToken via prop, shared gqlAuth helper.
 *   Mirrors useClubSlots / useClubCourts.
 * - Filter handling: the first effect run is skipped (initial data already came from SSR with the
 *   default filters). Any later filter change — or a refetch() after a mutation — triggers a
 *   client fetch with the CURRENT filters. This keeps the list in sync with the toolbar without
 *   a redundant fetch on mount.
 * - searchPlayers reuses the existing SEARCH_PLAYERS query so the form's user picker shares the
 *   same backend path as team invitations.
 * - Previously fixed bugs: none relevant (new hook).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { gqlAuth } from '../../lib/graphqlAuth';
import { SEARCH_PLAYERS, type TeamProfile } from '../../graphql/operations/teams';
import { GET_COURT_PRICING } from '../../graphql/operations/club-slots';
import {
  GET_MY_CLUB_RESERVATIONS,
  CREATE_RESERVATION,
  UPDATE_RESERVATION,
  CANCEL_RESERVATION,
  DELETE_RESERVATION,
  type Reservation,
  type ReservationFilters,
  type CreateReservationInput,
  type UpdateReservationInput,
  type ReservationMutationResult,
} from '../../graphql/operations/reservations';

interface UseClubReservationsParams {
  initialReservations: Reservation[];
  initialError: string | null;
  initialFilters: ReservationFilters;
  accessToken: string;
}

interface MutationOutcome {
  success: boolean;
  message: string;
}

// Forma de la fila devuelta por la query courtPricing (reglas de precio por cancha).
interface CourtPricingRow {
  basePrice: number | null;
  peakStart: string | null;
  peakEnd: string | null;
  peakDays: number[] | null;
  peakMultiplier: number | null;
  offPeakDiscount: number | null;
}

export function useClubReservations({
  initialReservations,
  initialError,
  initialFilters,
  accessToken,
}: UseClubReservationsParams) {
  const [reservations, setReservations] = useState<Reservation[]>(initialReservations);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  const [filters, setFilters] = useState<ReservationFilters>(initialFilters);
  const [fetchTick, setFetchTick] = useState(0);
  const firstRun = useRef(true);

  const refetch = useCallback(() => setFetchTick((t) => t + 1), []);

  useEffect(() => {
    // Initial data already came from SSR with the default filters.
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    gqlAuth<{ myClubReservations: Reservation[] }>(
      GET_MY_CLUB_RESERVATIONS,
      { filters },
      accessToken,
    )
      .then((data) => { if (!cancelled) setReservations(data.myClubReservations ?? []); })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Error al cargar las reservas');
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [filters, fetchTick, accessToken]);

  const createReservation = useCallback(async (input: CreateReservationInput): Promise<MutationOutcome> => {
    try {
      const data = await gqlAuth<{ createReservation: ReservationMutationResult }>(CREATE_RESERVATION, { input }, accessToken);
      const r = data.createReservation;
      if (r.success) refetch();
      return { success: r.success, message: r.message ?? 'Error al crear la reserva' };
    } catch (e) {
      return { success: false, message: e instanceof Error ? e.message : 'Error al crear la reserva' };
    }
  }, [refetch, accessToken]);

  const updateReservation = useCallback(async (input: UpdateReservationInput): Promise<MutationOutcome> => {
    try {
      const data = await gqlAuth<{ updateReservation: ReservationMutationResult }>(UPDATE_RESERVATION, { input }, accessToken);
      const r = data.updateReservation;
      if (r.success) refetch();
      return { success: r.success, message: r.message ?? 'Error al actualizar la reserva' };
    } catch (e) {
      return { success: false, message: e instanceof Error ? e.message : 'Error al actualizar la reserva' };
    }
  }, [refetch, accessToken]);

  const cancelReservation = useCallback(async (reservationId: string): Promise<MutationOutcome> => {
    try {
      const data = await gqlAuth<{ cancelReservation: ReservationMutationResult }>(CANCEL_RESERVATION, { reservationId }, accessToken);
      const r = data.cancelReservation;
      if (r.success) refetch();
      return { success: r.success, message: r.message ?? 'Error al cancelar la reserva' };
    } catch (e) {
      return { success: false, message: e instanceof Error ? e.message : 'Error al cancelar la reserva' };
    }
  }, [refetch, accessToken]);

  const deleteReservation = useCallback(async (reservationId: string): Promise<MutationOutcome> => {
    try {
      const data = await gqlAuth<{ deleteReservation: ReservationMutationResult }>(DELETE_RESERVATION, { reservationId }, accessToken);
      const r = data.deleteReservation;
      if (r.success) refetch();
      return { success: r.success, message: r.message ?? 'Error al eliminar la reserva' };
    } catch (e) {
      return { success: false, message: e instanceof Error ? e.message : 'Error al eliminar la reserva' };
    }
  }, [refetch, accessToken]);

  const searchPlayers = useCallback(async (search: string): Promise<TeamProfile[]> => {
    if (search.trim().length < 2) return [];
    try {
      const data = await gqlAuth<{ searchPlayers: TeamProfile[] }>(SEARCH_PLAYERS, { search: search.trim() }, accessToken);
      return data.searchPlayers ?? [];
    } catch {
      return [];
    }
  }, [accessToken]);

  /*
   * suggestCourtPrice — precio sugerido para una reserva/partido según las reglas de precio
   * de la cancha (las mismas que configura CourtPricingPanel: base + recargo de hora pico +
   * descuento fuera de pico). Replica la fórmula del preview de pricing: si el día/hora cae en
   * la ventana pico → base × peakMultiplier; si no → base × offPeakDiscount. Se escala por la
   * duración (la base es "precio por slot" de 1 hora). El resultado es solo una sugerencia:
   * el club puede sobreescribirlo en el form. Devuelve null si la cancha no tiene precio base.
   * El pricing por cancha se cachea (pricingCache) para no re-consultar en cada cambio de campo.
   * Previously fixed bugs: none relevant (nueva funcionalidad).
   */
  const pricingCache = useRef<Map<string, CourtPricingRow | null>>(new Map());

  const suggestCourtPrice = useCallback(
    async (courtId: string, reservedAtISO: string, durationMin: number): Promise<number | null> => {
      if (!courtId || !reservedAtISO) return null;
      try {
        let pricing = pricingCache.current.get(courtId);
        if (pricing === undefined) {
          const data = await gqlAuth<{ courtPricing: CourtPricingRow | null }>(
            GET_COURT_PRICING,
            { courtId },
            accessToken,
          );
          pricing = data.courtPricing ?? null;
          pricingCache.current.set(courtId, pricing);
        }
        if (!pricing || !pricing.basePrice || pricing.basePrice <= 0) return null;

        const when = new Date(reservedAtISO);
        if (Number.isNaN(when.getTime())) return null;
        const minutes = when.getHours() * 60 + when.getMinutes();
        const toMin = (hhmm?: string | null) => {
          if (!hhmm) return null;
          const [h, m] = hhmm.split(':').map(Number);
          return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
        };
        const peakStart = toMin(pricing.peakStart);
        const peakEnd = toMin(pricing.peakEnd);
        const inPeakWindow =
          (pricing.peakDays ?? []).includes(when.getDay()) &&
          peakStart != null && peakEnd != null &&
          minutes >= peakStart && minutes < peakEnd;

        const factor = inPeakWindow ? (pricing.peakMultiplier ?? 1) : (pricing.offPeakDiscount ?? 1);
        const hours = durationMin > 0 ? durationMin / 60 : 1;
        const raw = pricing.basePrice * factor * hours;
        // Redondeo a la decena más cercana para un número prolijo y editable.
        return Math.max(0, Math.round(raw / 10) * 10);
      } catch {
        return null;
      }
    },
    [accessToken],
  );

  return {
    reservations,
    loading,
    error,
    filters,
    setFilters,
    refetch,
    createReservation,
    updateReservation,
    cancelReservation,
    deleteReservation,
    searchPlayers,
    suggestCourtPrice,
  };
}
