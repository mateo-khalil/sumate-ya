/**
 * useClubCourts — React hook for club court management (Canchas)
 *
 * Decision Context:
 * - Centralises the GraphQL calls + state so CourtManager stays focused on presentation.
 *   Mirrors useClubSlots: SSR-hydrated initial state, accessToken passed in via prop (the
 *   HttpOnly cookie can't be read from JS), refetch after every mutation.
 * - Uses the shared gqlAuth helper instead of re-declaring the fetch wrapper.
 * - Mutation callbacks return { success, message } so the caller can show feedback.
 * - Previously fixed bugs: none relevant (new hook).
 */

import { useCallback, useEffect, useState } from 'react';
import { gqlAuth } from '../../lib/graphqlAuth';
import {
  GET_MY_CLUB_COURTS,
  CREATE_COURT,
  UPDATE_COURT,
  DELETE_COURT,
  type ManagedCourt,
  type CreateCourtInput,
  type UpdateCourtInput,
  type CourtMutationResult,
} from '../../graphql/operations/courts';

interface UseClubCourtsParams {
  initialCourts: ManagedCourt[];
  initialError: string | null;
  accessToken: string;
}

interface MutationOutcome {
  success: boolean;
  message: string;
}

export function useClubCourts({ initialCourts, initialError, accessToken }: UseClubCourtsParams) {
  const [courts, setCourts] = useState<ManagedCourt[]>(initialCourts);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  const [fetchTick, setFetchTick] = useState(0);

  const refetch = useCallback(() => setFetchTick((t) => t + 1), []);

  useEffect(() => {
    if (fetchTick === 0) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    gqlAuth<{ myClubCourts: ManagedCourt[] }>(GET_MY_CLUB_COURTS, {}, accessToken)
      .then((data) => { if (!cancelled) setCourts(data.myClubCourts ?? []); })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Error al cargar las canchas');
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [fetchTick, accessToken]);

  const createCourt = useCallback(async (input: CreateCourtInput): Promise<MutationOutcome> => {
    try {
      const data = await gqlAuth<{ createCourt: CourtMutationResult }>(CREATE_COURT, { input }, accessToken);
      const r = data.createCourt;
      if (r.success) refetch();
      return { success: r.success, message: r.message ?? 'Error al crear la cancha' };
    } catch (e) {
      return { success: false, message: e instanceof Error ? e.message : 'Error al crear la cancha' };
    }
  }, [refetch, accessToken]);

  const updateCourt = useCallback(async (input: UpdateCourtInput): Promise<MutationOutcome> => {
    try {
      const data = await gqlAuth<{ updateCourt: CourtMutationResult }>(UPDATE_COURT, { input }, accessToken);
      const r = data.updateCourt;
      if (r.success) refetch();
      return { success: r.success, message: r.message ?? 'Error al actualizar la cancha' };
    } catch (e) {
      return { success: false, message: e instanceof Error ? e.message : 'Error al actualizar la cancha' };
    }
  }, [refetch, accessToken]);

  const deleteCourt = useCallback(async (courtId: string): Promise<MutationOutcome> => {
    try {
      const data = await gqlAuth<{ deleteCourt: CourtMutationResult }>(DELETE_COURT, { courtId }, accessToken);
      const r = data.deleteCourt;
      if (r.success) refetch();
      return { success: r.success, message: r.message ?? 'Error al eliminar la cancha' };
    } catch (e) {
      return { success: false, message: e instanceof Error ? e.message : 'Error al eliminar la cancha' };
    }
  }, [refetch, accessToken]);

  return { courts, loading, error, refetch, createCourt, updateCourt, deleteCourt };
}
