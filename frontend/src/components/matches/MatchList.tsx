/**
 * MatchList Component - Displays grid of match cards
 *
 * Decision Context:
 * - Why: Encapsulates data fetching with urql and renders MatchCard grid.
 * - Pattern: Client-side fetch on mount; hydrated via client:visible in Astro.
 * - Previously fixed bugs: none relevant.
 */

import { useEffect, useState } from 'react';
import { MatchCard, type Match } from './MatchCard';
import { executeQuery } from '@/lib/urql-client';

const GET_OPEN_MATCHES = `
  query GetOpenMatches {
    matches(status: "open") {
      id
      title
      startTime
      format
      totalSlots
      availableSlots
      club {
        name
        zone
      }
    }
  }
`;

interface MatchListProps {
  /** Initial matches for SSR/SSG hydration (optional) */
  initialMatches?: Match[];
}

export function MatchList({ initialMatches }: MatchListProps) {
  const [matches, setMatches] = useState<Match[]>(initialMatches || []);
  const [loading, setLoading] = useState(!initialMatches);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Skip fetch if we have initial data
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
    // TODO: Implement join match mutation
    console.log('Join match:', matchId);
    // For now, show alert
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
