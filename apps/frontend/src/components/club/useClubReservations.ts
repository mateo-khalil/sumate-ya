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
  };
}
