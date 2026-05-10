/**
 * useDashboard — data fetching hook for the club dashboard React island
 *
 * Decision Context:
 * - Why: Isolates urql GraphQL calls from the presentation layer. Pattern mirrors
 *   useClubSlots.ts — filters held in state, refetch triggers new query.
 * - SSR hydration: initialData from Astro SSR is used as the starting state so the
 *   first render shows real data without a loading spinner.
 * - Manual fetch (not useQuery): the dashboard uses a controlled accessToken-based
 *   Authorization header (same pattern as horarios.astro) because the HttpOnly cookie
 *   cannot be read from JS; we must include the token in fetch headers explicitly.
 * - Robust state updates: `updateFilters` uses functional `setFilters` to avoid stale
 *   state, and `refetch` is now independent of the hook's `filters` state.
 * - Friendly errors: catches generic network/validation errors and shows a user-friendly
 *   message in Spanish.
 * - Previously fixed bugs: "Invalid request body" from date format/range errors.
 */

import { useState, useCallback } from 'react';
import {
  CLUB_DASHBOARD_QUERY,
  EXPORT_CLUB_SCHEDULE_QUERY,
  type ClubDashboardData,
  type ClubDashboardFilters,
} from '../../graphql/operations/club-dashboard';

const BACKEND_GQL =
  typeof window !== 'undefined' && (window as { __BACKEND_URL__?: string }).__BACKEND_URL__
    ? (window as { __BACKEND_URL__?: string }).__BACKEND_URL__!
    : '/api/graphql';

async function gqlFetch<T>(
  query: string,
  variables: Record<string, unknown>,
  accessToken: string,
): Promise<T> {
  const res = await fetch(BACKEND_GQL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await res.json()) as { data?: T; errors?: Array<{ message: string }> };
  if (!res.ok || json.errors?.length) {
    const errorMsg = json.errors?.[0]?.message ?? 'Error de comunicación con el servidor';
    throw new Error(errorMsg);
  }
  if (!json.data) throw new Error('Respuesta vacía del servidor');
  return json.data;
}

// =====================================================
// Hook
// =====================================================

export interface DashboardState {
  data: ClubDashboardData | null;
  loading: boolean;
  error: string | null;
  filters: ClubDashboardFilters;
}

export function useDashboard(opts: {
  initialData: ClubDashboardData | null;
  initialError: string | null;
  accessToken: string;
  defaultStartDate: string;
  defaultEndDate: string;
}) {
  const [data, setData] = useState<ClubDashboardData | null>(opts.initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(opts.initialError);
  const [filters, setFilters] = useState<ClubDashboardFilters>({
    startDate: opts.defaultStartDate,
    endDate: opts.defaultEndDate,
    includeBlocked: true,
    includeInactive: false,
  });

  const refetch = useCallback(
    async (filtersToApply: ClubDashboardFilters) => {
      setLoading(true);
      setError(null);
      try {
        const result = await gqlFetch<{ clubDashboard: ClubDashboardData }>(
          CLUB_DASHBOARD_QUERY,
          { filters: filtersToApply },
          opts.accessToken,
        );
        setData(result.clubDashboard);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Error al cargar el dashboard';
        if (msg.includes('Filtros inválidos') || msg.includes('Failed to fetch')) {
          setError('Error al cargar los datos para esta fecha. Intenta nuevamente.');
        } else {
          setError(msg);
        }
      } finally {
        setLoading(false);
      }
    },
    [opts.accessToken], // Stable dependency
  );

  const updateFilters = useCallback(
    (next: Partial<ClubDashboardFilters>) => {
      setFilters(prevFilters => {
          const updated = { ...prevFilters, ...next };
          refetch(updated);
          return updated;
      });
    },
    [refetch], // Stable dependency
  );

  const exportSchedule = useCallback(
    async (format: 'csv' | 'json'): Promise<string> => {
      const result = await gqlFetch<{ exportClubSchedule: string }>(
        EXPORT_CLUB_SCHEDULE_QUERY,
        { filters, format },
        opts.accessToken,
      );
      return result.exportClubSchedule;
    },
    [filters, opts.accessToken],
  );

  return { data, loading, error, filters, updateFilters, refetch, exportSchedule };
}
