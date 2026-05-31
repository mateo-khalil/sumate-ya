/**
 * TournamentCard - public tournament listing card with team registration affordance.
 *
 * Decision Context:
 * - Mirrors MatchCard's scan-first card pattern, but the capacity metric is registered
 *   teams instead of players.
 * - Registration stays inline because there is no tournament detail page yet; a player can
 *   find a tournament and submit the team name without losing their place in the list.
 * - Mutations go through /api/graphql-auth so the HttpOnly session cookie can be forwarded.
 * - In-progress tournaments can appear through filters, so the CTA distinguishes closed
 *   registration from a genuinely full registration tournament.
 */

import { type SyntheticEvent, useMemo, useState } from 'react';
import { Calendar, Loader2, MapPin, Trophy, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  JOIN_TOURNAMENT,
  type TournamentListItem,
  type TournamentStatus,
  type TournamentTeamRegistrationResult,
} from '@/graphql/operations/tournaments';
import type { MatchFormat } from '@/graphql/operations/matches';

const FORMAT_LABELS: Record<MatchFormat, string> = {
  FIVE_VS_FIVE: '5v5',
  SEVEN_VS_SEVEN: '7v7',
  TEN_VS_TEN: '10v10',
  ELEVEN_VS_ELEVEN: '11v11',
};

const STATUS_LABELS: Record<TournamentStatus, string> = {
  REGISTRATION: 'Inscripcion abierta',
  IN_PROGRESS: 'En curso',
  COMPLETED: 'Finalizado',
  CANCELLED: 'Cancelado',
};

interface TournamentCardProps {
  tournament: TournamentListItem;
  onRegistered: (tournament: TournamentListItem) => void;
  isAuthenticated?: boolean;
}

function formatDate(value: string | null): string {
  if (!value) return 'Fecha a confirmar';
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('es-UY', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

function isAuthError(message: string): boolean {
  return message.toLowerCase().includes('authentication required');
}

export function TournamentCard({
  tournament,
  onRegistered,
  isAuthenticated = false,
}: TournamentCardProps) {
  const [formOpen, setFormOpen] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const registeredTeams = Math.min(tournament.registeredTeamsCount, tournament.teamCount);
  const isRegistration = tournament.status === 'REGISTRATION';
  const isAtCapacity = registeredTeams >= tournament.teamCount;
  const registrationClosed = !isRegistration || isAtCapacity;
  const actionLabel = !isRegistration
    ? 'Inscripcion cerrada'
    : isAtCapacity
      ? 'Completo'
      : isAuthenticated
        ? 'Anotar equipo'
        : 'Iniciar sesion para anotar';
  const progress = useMemo(
    () => (tournament.teamCount > 0 ? Math.round((registeredTeams / tournament.teamCount) * 100) : 0),
    [registeredTeams, tournament.teamCount],
  );

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isAuthenticated) {
      window.location.href = '/login';
      return;
    }

    const name = teamName.trim();
    if (name.length < 2) {
      setError('Ingresa al menos 2 caracteres para el equipo.');
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('/api/graphql-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: JOIN_TOURNAMENT,
          variables: { input: { tournamentId: tournament.id, teamName: name, memberIds: [] } },
        }),
      });

      const payload = (await response.json()) as {
        data?: { joinTournament?: TournamentTeamRegistrationResult };
        errors?: Array<{ message: string }>;
      };

      const graphQLError = payload.errors?.[0]?.message;
      if (graphQLError) {
        if (isAuthError(graphQLError)) window.location.href = '/login';
        throw new Error(graphQLError);
      }

      const result = payload.data?.joinTournament;
      if (!result) throw new Error('Respuesta inesperada del servidor');
      if (!result.success) {
        const message = result.message ?? 'No se pudo inscribir el equipo';
        if (isAuthError(message)) window.location.href = '/login';
        throw new Error(message);
      }
      if (result.tournament) onRegistered(result.tournament);

      setSuccess('Equipo anotado.');
      setTeamName('');
      setFormOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al inscribir el equipo');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <article className="rounded-xl border border-border bg-card text-card-foreground shadow transition-shadow hover:shadow-lg">
      <div className="p-5 pb-4">
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <Badge>{FORMAT_LABELS[tournament.format]}</Badge>
          <Badge variant="secondary">{tournament.playersPerTeam} por equipo</Badge>
          <Badge variant={isRegistration ? 'default' : 'secondary'}>
            {STATUS_LABELS[tournament.status]}
          </Badge>
        </div>

        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-primary">
            <Trophy className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-[Bebas_Neue,sans-serif] text-2xl leading-none tracking-[0.04em]">
              <a href={`/torneos/${tournament.id}`} className="text-foreground hover:text-primary">
                {tournament.name}
              </a>
            </h2>
            {tournament.club && (
              <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">
                  {tournament.club.name}
                  {tournament.club.zone && <span> - {tournament.club.zone}</span>}
                </span>
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="px-5 pb-5">
        <div className="mb-4 flex flex-col gap-2 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4" aria-hidden="true" />
            <span>{formatDate(tournament.startDate)}</span>
          </div>
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4" aria-hidden="true" />
            <span className={registrationClosed ? 'text-muted-foreground' : 'font-medium text-foreground'}>
              {registeredTeams}/{tournament.teamCount} equipos
            </span>
          </div>
        </div>

        <div className="mb-4 h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <div
            className="h-full rounded-full bg-primary transition-[width]"
            style={{ width: `${progress}%` }}
          />
        </div>

        {formOpen && !registrationClosed ? (
          <form onSubmit={handleSubmit} className="flex flex-col gap-2">
            <input
              value={teamName}
              onChange={(event) => setTeamName(event.target.value)}
              maxLength={80}
              placeholder="Nombre del equipo"
              className="min-h-11 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary"
            />
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={submitting} className="flex-1">
                {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                Anotar
              </Button>
              <Button type="button" size="sm" variant="secondary" onClick={() => setFormOpen(false)}>
                Cancelar
              </Button>
            </div>
          </form>
        ) : (
          <Button
            type="button"
            size="sm"
            variant={registrationClosed ? 'secondary' : 'default'}
            disabled={registrationClosed}
            onClick={() => {
              if (!isAuthenticated) {
                window.location.href = '/login';
                return;
              }
              setFormOpen(true);
            }}
            className="w-full"
          >
            {actionLabel}
          </Button>
        )}

        <a
          href={`/torneos/${tournament.id}`}
          className="mt-2 block rounded-md border border-border px-3 py-2 text-center text-sm font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
        >
          Ver detalle
        </a>

        {error && <p className="mt-3 text-sm text-destructive" role="alert">{error}</p>}
        {success && <p className="mt-3 text-sm text-success-foreground" role="status">{success}</p>}
      </div>
    </article>
  );
}
