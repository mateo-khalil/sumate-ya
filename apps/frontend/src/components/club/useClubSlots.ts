/**
 * useClubSlots — React hook for club slot management GraphQL operations
 *
 * Decision Context:
 * - Why hook: centralizes urql calls and state so SlotManager stays under the 250-line limit.
 * - SSR-hydrated initial state: horarios.astro fetches slots server-side and passes them
 *   as initialSlots. We skip the client-side initial query because the /api/graphql proxy
 *   cannot reliably read the HttpOnly cookie under Astro dev hot-reload.
 * - accessToken prop: every mutation call includes Authorization: Bearer <token> explicitly
 *   via urql's per-call fetchOptions. The HttpOnly cookie cannot be read from JS, but the
 *   page passes the token in via SSR prop. Same security profile as a localStorage token,
 *   limited to the panel-club auth-protected page.
 * - refetch(): re-runs the query after mutations (now via direct fetch with explicit auth).
 * - All mutation callbacks return { success, message } so the caller can show toasts.
 * - Previously fixed bugs:
 *   - urqlClient.fetchOptions read from localStorage (which is empty — token is HttpOnly).
 *     Fix: receive token via SSR prop and pass via urql per-call context fetchOptions.
 */

import { useCallback, useEffect, useState } from 'react';
import type {
  ManagedClubSlot,
  BlockSlotInput,
  BulkBlockSlotsInput,
  CreateClubSlotInput,
  UpdateClubSlotInput,
  SlotImpactPreview,
  ClubSlotMutationResult,
  BulkSlotMutationResult,
} from '../../graphql/operations/club-slots';
import {
  GET_MY_CLUB_SLOTS,
  CREATE_CLUB_SLOT,
  UPDATE_CLUB_SLOT,
  DELETE_CLUB_SLOT,
  TOGGLE_SLOT_BLOCK,
  BULK_BLOCK_SLOTS,
} from '../../graphql/operations/club-slots';

// Use the authenticated proxy endpoint (/api/graphql-auth) for all client-side calls.
// This is a fresh module that reliably forwards the auth token to Apollo via triple-layer
// auth strategy (locals.accessToken → raw cookie → explicit header).
const GQL_ENDPOINT = '/api/graphql-auth';

/** Execute a GraphQL operation via the authenticated proxy */
async function gql<TData>(
  query: string,
  variables: Record<string, unknown>,
  token: string,
): Promise<TData> {
  const res = await fetch(GQL_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await res.json()) as { data?: TData; errors?: Array<{ message: string }> };
  if (json.errors?.length) throw new Error(json.errors[0].message);
  if (!json.data) throw new Error('Sin respuesta del servidor');
  return json.data;
}

interface UseClubSlotsParams {
  initialSlots: ManagedClubSlot[];
  initialError: string | null;
  accessToken: string;
}

interface UseClubSlotsReturn {
  slots: ManagedClubSlot[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
  createSlot: (input: CreateClubSlotInput) => Promise<{ success: boolean; message: string }>;
  updateSlot: (input: UpdateClubSlotInput) => Promise<{ success: boolean; message: string }>;
  deleteSlot: (slotId: string) => Promise<{ success: boolean; message: string }>;
  toggleBlock: (input: BlockSlotInput) => Promise<{
    success: boolean;
    message: string;
    impactPreview: SlotImpactPreview | null;
  }>;
  bulkBlock: (input: BulkBlockSlotsInput) => Promise<{
    success: boolean;
    message: string;
    affectedCount: number;
    impactPreview: SlotImpactPreview | null;
  }>;
}

export function useClubSlots({ initialSlots, initialError, accessToken }: UseClubSlotsParams): UseClubSlotsReturn {
  const [slots, setSlots] = useState<ManagedClubSlot[]>(initialSlots);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  const [fetchTick, setFetchTick] = useState(0);

  const refetch = useCallback(() => setFetchTick((t) => t + 1), []);

  // Re-fetch slots after mutations (initial state comes from SSR, skip tick=0)
  useEffect(() => {
    if (fetchTick === 0) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    gql<{ myClubSlots: ManagedClubSlot[] }>(GET_MY_CLUB_SLOTS, {}, accessToken)
      .then((data) => { if (!cancelled) setSlots(data.myClubSlots ?? []); })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Error al cargar los horarios');
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [fetchTick, accessToken]);

  const createSlot = useCallback(async (input: CreateClubSlotInput) => {
    try {
      const data = await gql<{ createClubSlot: ClubSlotMutationResult }>(CREATE_CLUB_SLOT, { input }, accessToken);
      const r = data.createClubSlot;
      if (r.success) refetch();
      return { success: r.success, message: r.message ?? 'Error al crear el slot' };
    } catch (e) {
      return { success: false, message: e instanceof Error ? e.message : 'Error al crear el slot' };
    }
  }, [refetch, accessToken]);

  const updateSlot = useCallback(async (input: UpdateClubSlotInput) => {
    try {
      const data = await gql<{ updateClubSlot: ClubSlotMutationResult }>(UPDATE_CLUB_SLOT, { input }, accessToken);
      const r = data.updateClubSlot;
      if (r.success) refetch();
      return { success: r.success, message: r.message ?? 'Error al actualizar el slot' };
    } catch (e) {
      return { success: false, message: e instanceof Error ? e.message : 'Error al actualizar el slot' };
    }
  }, [refetch, accessToken]);

  const deleteSlot = useCallback(async (slotId: string) => {
    try {
      const data = await gql<{ deleteClubSlot: ClubSlotMutationResult }>(DELETE_CLUB_SLOT, { slotId }, accessToken);
      const r = data.deleteClubSlot;
      if (r.success) refetch();
      return { success: r.success, message: r.message ?? 'Error al eliminar el slot' };
    } catch (e) {
      return { success: false, message: e instanceof Error ? e.message : 'Error al eliminar el slot' };
    }
  }, [refetch, accessToken]);

  const toggleBlock = useCallback(async (input: BlockSlotInput) => {
    try {
      const data = await gql<{ toggleSlotBlock: ClubSlotMutationResult }>(TOGGLE_SLOT_BLOCK, { input }, accessToken);
      const r = data.toggleSlotBlock;
      if (r.success) refetch();
      return { success: r.success, message: r.message ?? '', impactPreview: r.impactPreview ?? null };
    } catch (e) {
      return { success: false, message: e instanceof Error ? e.message : '', impactPreview: null };
    }
  }, [refetch, accessToken]);

  const bulkBlock = useCallback(async (input: BulkBlockSlotsInput) => {
    try {
      const data = await gql<{ bulkBlockSlots: BulkSlotMutationResult }>(BULK_BLOCK_SLOTS, { input }, accessToken);
      const r = data.bulkBlockSlots;
      if (r.success) refetch();
      return { success: r.success, message: r.message ?? '', affectedCount: r.affectedCount ?? 0, impactPreview: r.impactPreview ?? null };
    } catch (e) {
      return { success: false, message: e instanceof Error ? e.message : '', affectedCount: 0, impactPreview: null };
    }
  }, [refetch, accessToken]);

  return { slots, loading, error, refetch, createSlot, updateSlot, deleteSlot, toggleBlock, bulkBlock };
}
