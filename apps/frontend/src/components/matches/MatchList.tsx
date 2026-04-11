/**
 * MatchList Component - Displays grid of match cards
 *
 * Decision Context:
 * - Why: Encapsulates data fetching with urql and renders the MatchCard grid.
 * - Pattern: Client-side fetch on mount; hydrated via `client:visible` in Astro so the
 *   request only fires when the user scrolls the section into view. SSR-populated
 *   `initialMatches` can skip the fetch entirely.
 * - GraphQL operations live in `src/graphql/operations/matches.ts` (frontend.md rule:
 *   no inline GraphQL strings inside UI components). If you need to edit the query,
 *   update BOTH `operations/matches.graphql` (codegen source of truth) and `operations/matches.ts`.
 * - Error + empty + loading states are handled inline because they are layout-specific
 *   skeletons; extract to a shared component if another list reuses them.
 * - Previously fixed bugs: inline `GET_OPEN_MATCHES` string was defined in this file,
 *   which broke the frontend GraphQL rule and duplicated the `.graphql` operation.
 */

import { useEffect, useState } from 'react';
import { MatchCard, type Match } from './MatchCard';
import { executeQuery } from '@/lib/urql-client';
import { GET_OPEN_MATCHES } from '@/graphql/operations/matches';

interface MatchListProps {
  /** Initial matches for SSR/SSG hydration (optional) */
  initialMatches?: Match[];
}

export function MatchList({ initialMatches }: MatchListProps) {
  const [matches, setMatches] = useState<Match[]>(initialMatches || []);
  const [loading, setLoading] = useState(!initialMatches);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialMatches) return;

    async function fetchMatches() {
      try {
        const data = await executeQuery<{ matches: Match[] }>(GET_OPEN_MATCHES);
        setMatches(data.matches);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al cargar partidos');
      } finally {
        setLoading(false);
      }
    }

    fetchMatches();
  }, [initialMatches]);

  const handleJoin = (matchId: string) => {
    // TODO: Implement join match mutation against the backend once the
    // matchPlayers table + RLS policies are in place (see backend.md rule
    // "NEVER write to a new table without adding RLS policies").
    alert(`Próximamente: unirse al partido ${matchId}`);
  };

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-48 rounded-xl border border-border bg-muted animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-destructive font-medium">Error</p>
        <p className="text-muted-foreground">{error}</p>
      </div>
    );
  }

  if (matches.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-xl font-medium">No hay partidos disponibles</p>
        <p className="text-muted-foreground mt-2">
          Vuelve más tarde o crea tu propio partido
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {matches.map((match) => (
        <MatchCard key={match.id} match={match} onJoin={handleJoin} />
      ))}
    </div>
  );
}
