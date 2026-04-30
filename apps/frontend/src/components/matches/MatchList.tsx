/**
 * MatchList Component - Displays a grid of match cards with instant filtering.
 *
 * Decision Context:
 * - Loads the open match dataset once, then filters locally for immediate UX.
 * - Backend GraphQL filters remain available for larger datasets and map/list parity.
 * - Can render its own filters, or receive controlled filters from MatchesView.
 * - Empty state distinguishes "no open matches at all" (matches.length === 0) from
 *   "matches exist but all are hidden by filters" (visibleMatches.length === 0) so
 *   players know whether to wait or to adjust their search.
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

  const fetchMatches = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await executeQuery<{ matches: Match[] }>(GET_MATCHES, {
        filters: toServerMatchFilters(DEFAULT_MATCH_FILTERS),
      });
      setMatches(data.matches);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar partidos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialMatches) return;
    fetchMatches();
  }, [initialMatches, fetchMatches]);

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
          <p className="text-xl font-medium">No hay partidos disponibles</p>
          <p className="text-muted-foreground mt-2">
            {matches.length > 0
              ? 'Ningún partido coincide con los filtros. Probá ajustando la búsqueda.'
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
