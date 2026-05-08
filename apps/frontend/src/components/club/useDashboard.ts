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
 * - exportSchedule: separate async call, returns the raw CSV/JSON string for download.
 * - Previously fixed bugs: none relevant (new feature).
 */

import { useState, useCallback } from 'react';
import {
  CLUB_DASHBOARD_QUERY,
  CLUB_METRICS_QUERY,
  EXPORT_CLUB_SCHEDULE_QUERY,
  type ClubDashboardData,
  type ClubMetrics,
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
  if (json.errors?.length) throw new Error(json.errors[0].message);
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
    async (newFilters?: ClubDashboardFilters) => {
      const appliedFilters = newFilters ?? filters;
      setLoading(true);
      setError(null);
      try {
        const result = await gqlFetch<{ clubDashboard: ClubDashboardData }>(
          CLUB_DASHBOARD_QUERY,
          { filters: appliedFilters },
          opts.accessToken,
        );
        setData(result.clubDashboard);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Error al cargar el dashboard';
        setError(msg);
      } finally {
        setLoading(false);
      }
    },
    [filters, opts.accessToken],
  );

  const updateFilters = useCallback(
    (next: Partial<ClubDashboardFilters>) => {
      const updated = { ...filters, ...next };
      setFilters(updated);
      refetch(updated);
    },
    [filters, refetch],
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
