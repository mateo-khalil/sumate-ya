/**
 * MatchList Component - Displays a grid of match cards with instant filtering.
 *
 * Decision Context:
 * - Loads the relevant match dataset once per server-side dimension (status / onlyMine),
 *   then filters locally for immediate UX. The server-side dimensions live in
 *   `toServerMatchFilters`; everything else is applied client-side via `filterMatches`.
 * - The fetch effect re-runs whenever the server-side dimensions change (timeframe or
 *   onlyMine), so switching tabs in MatchesView triggers a fresh request. Local filters
 *   like search/format/zone do NOT cause a refetch — they apply to the cached dataset.
 * - Empty state distinguishes three cases:
 *   • no matches at all in the timeframe (matches.length === 0)
 *   • matches exist but all hidden by local filters (visibleMatches.length === 0)
 *   • Pasados + Solo los míos with zero results (handled by the empty timeframe path,
 *     copy is generic enough to cover both cases without a third branch)
 *   so players know whether to wait or to adjust their search.
 * - Previously fixed bugs:
 *   - The fetch effect originally hardcoded DEFAULT_MATCH_FILTERS, which made the list
 *     ignore timeframe/onlyMine changes. Switching to "Pasados" appeared to do nothing
 *     because the backing dataset never refreshed. Fixed by depending on the serialized
 *     server filters in the effect.
 * - "Mostrar cancelados": the server `status` filter (and its Redis cache key) is
 *   single-valued, so cancelled matches cannot be merged into the OPEN/COMPLETED query.
 *   When the toggle is on AND the user is authenticated, a SECOND query with
 *   `{ status: CANCELLED, onlyMine: true }` runs in parallel and its rows are merged
 *   (deduped by id) into the dataset. The backend scopes CANCELLED to the caller, so this
 *   only ever returns the user's own cancelled matches — never another player's.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { MatchCard, type Match } from './MatchCard';
import { MatchFilters as MatchFiltersComponent } from './MatchFilters';
import { executeQuery } from '@/lib/urql-client';
import { GET_MATCHES } from '@/graphql/operations/matches';
import {
  DEFAULT_MATCH_FILTERS,
  filterMatches,
  normalizeMatchFilters,
  toServerMatchFilters,
  type ClientMatchFilters,
} from '@/lib/match-filtering';

interface MatchListProps {
  /** Initial matches for SSR/SSG hydration (optional) */
  initialMatches?: Match[];
  /** Whether the current user is authenticated; gates the join action */
  isAuthenticated?: boolean;
  /** Controlled filters shared with other views, e.g. map */
  filters?: ClientMatchFilters;
  /** Called when this list owns and renders the filter controls */
  onFiltersChange?: (filters: ClientMatchFilters) => void;
  /** Allows MatchesView to render a single filter bar for list + map */
  showFilters?: boolean;
}

export function MatchList({
  initialMatches,
  isAuthenticated = false,
  filters: controlledFilters,
  onFiltersChange,
  showFilters = true,
}: MatchListProps) {
  const [matches, setMatches] = useState<Match[]>(initialMatches || []);
  const [loading, setLoading] = useState(!initialMatches);
  const [error, setError] = useState<string | null>(null);
  const [internalFilters, setInternalFilters] =
    useState<ClientMatchFilters>(DEFAULT_MATCH_FILTERS);

  const filters = controlledFilters ?? internalFilters;
  const serverFilters = useMemo(() => toServerMatchFilters(filters), [filters]);
  // Cancelled matches are private and authenticated-only; the toggle is ignored for
  // anonymous callers (the backend would return empty anyway).
  const showCancelled = !!filters.showCancelled && isAuthenticated;
  // Stable fingerprint of the server-side dimensions; the fetch effect refreshes whenever
  // this value changes (e.g. timeframe upcoming↔past, onlyMine on/off, or showCancelled).
  const serverFiltersKey = useMemo(
    () => JSON.stringify({ ...serverFilters, showCancelled }),
    [serverFilters, showCancelled],
  );

  useEffect(() => {
    if (initialMatches) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    // Primary dataset (active timeframe) + optional own-cancelled dataset, merged and
    // deduped by id. The cancelled query is scoped server-side to the caller.
    Promise.all([
      executeQuery<{ matches: Match[] }>(GET_MATCHES, { filters: serverFilters }),
      showCancelled
        ? executeQuery<{ matches: Match[] }>(GET_MATCHES, {
            filters: { status: 'CANCELLED', onlyMine: true },
          })
        : Promise.resolve({ matches: [] as Match[] }),
    ])
      .then(([primary, cancelledData]) => {
        if (cancelled) return;
        const byId = new Map<string, Match>();
        for (const m of primary.matches) byId.set(m.id, m);
        for (const m of cancelledData.matches) byId.set(m.id, m);
        setMatches([...byId.values()]);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Error al cargar partidos');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // serverFiltersKey carries the only inputs that should re-trigger a fetch; serverFilters
    // itself is stable across renders thanks to useMemo, but using the JSON key keeps the
    // dependency array primitive and avoids a new fetch per render even if the memo cache
    // is invalidated for unrelated reasons.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMatches, serverFiltersKey]);

  const handleFiltersChange = useCallback(
    (newFilters: ClientMatchFilters) => {
      const normalized = normalizeMatchFilters(newFilters);
      setInternalFilters(normalized);
      onFiltersChange?.(normalized);
    },
    [onFiltersChange],
  );

  const visibleMatches = useMemo(() => filterMatches(matches, filters), [matches, filters]);

  const handleJoin = (matchId: string) => {
    window.location.href = `/partidos/${matchId}`;
  };

  return (
    <div>
      {showFilters && (
        <MatchFiltersComponent filters={filters} onFiltersChange={handleFiltersChange} />
      )}

      {loading && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-48 rounded-xl border border-border bg-muted animate-pulse"
            />
          ))}
        </div>
      )}

      {!loading && error && (
        <div className="text-center py-12">
          <p className="text-destructive font-medium">Error</p>
          <p className="text-muted-foreground">{error}</p>
        </div>
      )}

      {!loading && !error && visibleMatches.length === 0 && (
        <div className="text-center py-12">
          <p className="text-xl font-medium">
            {filters.timeframe === 'past' ? 'No hay partidos pasados' : 'No hay partidos disponibles'}
          </p>
          <p className="text-muted-foreground mt-2">
            {matches.length > 0
              ? 'Ningún partido coincide con los filtros. Probá ajustando la búsqueda.'
              : filters.timeframe === 'past'
                ? filters.onlyMine
                  ? 'Todavía no jugaste partidos. Cuando juegues alguno aparecerá acá.'
                  : 'No hay historial de partidos finalizados.'
                : 'No hay partidos abiertos por el momento. Volvé más tarde.'}
          </p>
        </div>
      )}

      {!loading && !error && visibleMatches.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {visibleMatches.map((match) => (
            <MatchCard
              key={match.id}
              match={match}
              onJoin={handleJoin}
              isAuthenticated={isAuthenticated}
            />
          ))}
        </div>
      )}
    </div>
  );
}
