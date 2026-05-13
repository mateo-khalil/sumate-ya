/**
 * TournamentList - client-side hydrated public tournament listing.
 *
 * Decision Context:
 * - Public listing shells fetch tournaments from the GraphQL proxy after hydration.
 * - The backend already returns registration-only tournaments, but the client filters
 *   defensively after a successful registration because a full tournament can transition
 *   to IN_PROGRESS immediately.
 */

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, RefreshCw, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GET_TOURNAMENTS, type TournamentListItem } from '@/graphql/operations/tournaments';
import { TournamentCard } from './TournamentCard';

interface GetTournamentsPayload {
  tournaments: TournamentListItem[];
}

function keepRegistrationOnly(tournaments: TournamentListItem[]): TournamentListItem[] {
  return tournaments.filter((tournament) => tournament.status === 'REGISTRATION');
}

interface TournamentListProps {
  isAuthenticated?: boolean;
}

export function TournamentList({ isAuthenticated = false }: TournamentListProps) {
  const [tournaments, setTournaments] = useState<TournamentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch('/api/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: GET_TOURNAMENTS }),
    })
      .then((response) => response.json())
      .then((payload: { data?: GetTournamentsPayload; errors?: Array<{ message: string }> }) => {
        if (cancelled) return;
        const graphQLError = payload.errors?.[0]?.message;
        if (graphQLError) throw new Error(graphQLError);
        setTournaments(keepRegistrationOnly(payload.data?.tournaments ?? []));
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Error al cargar torneos');
          setTournaments([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const handleRegistered = useCallback((updated: TournamentListItem) => {
    setTournaments((current) =>
      keepRegistrationOnly(
        current.map((tournament) => (tournament.id === updated.id ? updated : tournament)),
      ),
    );
  }, []);

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((item) => (
          <div key={item} className="h-64 rounded-xl border border-border bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-6 text-center">
        <AlertCircle className="mx-auto mb-3 h-7 w-7 text-destructive" aria-hidden="true" />
        <p className="font-medium text-foreground">No pudimos cargar los torneos</p>
        <p className="mt-1 text-sm text-muted-foreground">{error}</p>
        <Button type="button" variant="secondary" className="mt-4" onClick={() => setReloadKey((key) => key + 1)}>
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Reintentar
        </Button>
      </div>
    );
  }

  if (tournaments.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <Trophy className="mx-auto mb-3 h-8 w-8 text-primary" aria-hidden="true" />
        <p className="text-xl font-medium">No hay torneos en inscripción</p>
        <p className="mt-2 text-muted-foreground">Cuando un club o jugador abra un torneo va a aparecer acá.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {tournaments.map((tournament) => (
        <TournamentCard
          key={tournament.id}
          tournament={tournament}
          isAuthenticated={isAuthenticated}
          onRegistered={handleRegistered}
        />
      ))}
    </div>
  );
}
