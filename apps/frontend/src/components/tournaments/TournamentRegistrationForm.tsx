import { type SyntheticEvent, useEffect, useMemo, useState } from 'react';
import { Loader2, LogIn, Search, UserMinus, UserPlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  ADD_TOURNAMENT_TEAM_MEMBER,
  GET_TOURNAMENT_ELIGIBLE_PLAYERS,
  JOIN_TOURNAMENT,
  REMOVE_TOURNAMENT_TEAM_MEMBER,
  type TournamentPlayer,
  type TournamentTeam,
  type TournamentTeamRegistrationResult,
  type TournamentStatus,
} from '@/graphql/operations/tournaments';
import { LeaveTournamentButton } from './LeaveTournamentButton';

interface TournamentRegistrationFormProps {
  tournamentId: string;
  tournamentName: string;
  tournamentStatus: TournamentStatus;
  isAuthenticated: boolean;
  canRegister: boolean;
  playersPerTeam: number;
  currentUserId?: string | null;
  teams?: TournamentTeam[];
}

interface EligiblePlayersPayload {
  tournamentEligiblePlayers: TournamentPlayer[];
}

function isAuthError(message: string): boolean {
  return message.toLowerCase().includes('authentication required');
}

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

async function postTournamentMutation(
  query: string,
  variables: Record<string, unknown>,
): Promise<TournamentTeamRegistrationResult> {
  const response = await fetch('/api/graphql-auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });

  const payload = (await response.json()) as {
    data?: Record<string, TournamentTeamRegistrationResult | undefined>;
    errors?: Array<{ message: string }>;
  };

  const graphQLError = payload.errors?.[0]?.message;
  if (graphQLError) {
    if (isAuthError(graphQLError)) window.location.href = '/login';
    throw new Error(graphQLError);
  }

  const result = Object.values(payload.data ?? {})[0];
  if (!result) throw new Error('Respuesta inesperada del servidor');
  if (!result.success) {
    const message = result.message ?? 'No se pudo actualizar el equipo';
    if (isAuthError(message)) window.location.href = '/login';
    throw new Error(message);
  }

  return result;
}

export function TournamentRegistrationForm({
  tournamentId,
  tournamentName,
  tournamentStatus,
  isAuthenticated,
  canRegister,
  playersPerTeam,
  currentUserId = null,
  teams = [],
}: TournamentRegistrationFormProps) {
  const [teamName, setTeamName] = useState('');
  const [search, setSearch] = useState('');
  const [eligiblePlayers, setEligiblePlayers] = useState<TournamentPlayer[]>([]);
  const [selectedPlayers, setSelectedPlayers] = useState<TournamentPlayer[]>([]);
  const [loadingPlayers, setLoadingPlayers] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const captainTeam = useMemo(
    () => teams.find((team) => team.captainId === currentUserId) ?? null,
    [currentUserId, teams],
  );
  const currentRosterSize = captainTeam?.players.length ?? 1;
  const selectedIds = useMemo(() => new Set(selectedPlayers.map((player) => player.id)), [selectedPlayers]);
  const selectedRosterSize = 1 + selectedPlayers.length;
  const canSelectMore = selectedRosterSize < playersPerTeam;

  useEffect(() => {
    if (!isAuthenticated || (!canRegister && !captainTeam)) return;

    const timeout = window.setTimeout(() => {
      setLoadingPlayers(true);
      fetch('/api/graphql-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: GET_TOURNAMENT_ELIGIBLE_PLAYERS,
          variables: { tournamentId, search: search.trim() || null },
        }),
      })
        .then((response) => response.json())
        .then((payload: { data?: EligiblePlayersPayload; errors?: Array<{ message: string }> }) => {
          const graphQLError = payload.errors?.[0]?.message;
          if (graphQLError) throw new Error(graphQLError);
          setEligiblePlayers(payload.data?.tournamentEligiblePlayers ?? []);
        })
        .catch((err: unknown) => {
          setError(err instanceof Error ? err.message : 'Error al buscar jugadores');
          setEligiblePlayers([]);
        })
        .finally(() => setLoadingPlayers(false));
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [captainTeam, canRegister, isAuthenticated, search, tournamentId]);

  function addSelectedPlayer(player: TournamentPlayer) {
    if (!canSelectMore || selectedIds.has(player.id)) return;
    setSelectedPlayers((current) => [...current, player]);
    setSearch('');
  }

  function removeSelectedPlayer(playerId: string) {
    setSelectedPlayers((current) => current.filter((player) => player.id !== playerId));
  }

  async function handleJoin(event: SyntheticEvent<HTMLFormElement>) {
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
    if (selectedRosterSize > playersPerTeam) {
      setError(`El equipo no puede superar ${playersPerTeam} jugadores.`);
      return;
    }

    setSubmitting(true);
    setMessage(null);
    setError(null);

    try {
      await postTournamentMutation(JOIN_TOURNAMENT, {
        input: {
          tournamentId,
          teamName: name,
          memberIds: selectedPlayers.map((player) => player.id),
        },
      });
      setMessage('Equipo anotado. Actualizando torneo...');
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al inscribir el equipo');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAddMember(player: TournamentPlayer) {
    if (!captainTeam || currentRosterSize >= playersPerTeam) return;
    setSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      await postTournamentMutation(ADD_TOURNAMENT_TEAM_MEMBER, {
        input: { tournamentId, teamId: captainTeam.id, playerId: player.id },
      });
      setMessage('Jugador agregado. Actualizando torneo...');
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al agregar jugador');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRemoveMember(playerId: string) {
    if (!captainTeam) return;
    setSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      await postTournamentMutation(REMOVE_TOURNAMENT_TEAM_MEMBER, {
        input: { tournamentId, teamId: captainTeam.id, playerId },
      });
      setMessage('Jugador quitado. Actualizando torneo...');
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al quitar jugador');
    } finally {
      setSubmitting(false);
    }
  }

  if (!isAuthenticated) {
    return (
      <a className="detail-login-button" href="/login">
        <LogIn className="h-4 w-4" aria-hidden="true" />
        Iniciar sesion para anotar equipo
      </a>
    );
  }

  if (captainTeam) {
    const removablePlayers = captainTeam.players.filter((player) => player.id !== captainTeam.captainId);
    const canLeave = tournamentStatus === 'REGISTRATION';

    return (
      <div className="detail-register-form">
        <div className="captain-panel">
          <strong>Tu equipo: {captainTeam.name}</strong>
          <span>{captainTeam.players.length}/{playersPerTeam} jugadores</span>
        </div>

        {removablePlayers.length > 0 && (
          <div className="selected-player-list">
            {removablePlayers.map((player) => (
              <button
                key={player.id}
                type="button"
                className="selected-player-chip"
                disabled={submitting}
                onClick={() => handleRemoveMember(player.id)}
              >
                {player.displayName}
                <UserMinus className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            ))}
          </div>
        )}

        {currentRosterSize < playersPerTeam && (
          <div className="player-search-box">
            <Search className="h-4 w-4" aria-hidden="true" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar jugador para agregar"
              className="player-search-input"
            />
          </div>
        )}

        {currentRosterSize < playersPerTeam && (
          <PlayerResults
            players={eligiblePlayers.filter((player) => player.id !== currentUserId)}
            loading={loadingPlayers}
            disabled={submitting}
            onSelect={handleAddMember}
          />
        )}

        {error && <p className="detail-form-error" role="alert">{error}</p>}
        {message && <p className="detail-form-message" role="status">{message}</p>}

        {canLeave && (
          <LeaveTournamentButton
            tournamentId={tournamentId}
            teamId={captainTeam.id}
            teamName={captainTeam.name}
            tournamentName={tournamentName}
            hasOnlyTwoTeams={teams.length === 2}
          />
        )}
      </div>
    );
  }

  if (!canRegister) {
    return (
      <div className="registration-closed" role="status">
        <span>Inscripcion cerrada o cupos completos</span>
      </div>
    );
  }

  return (
    <form className="detail-register-form" onSubmit={handleJoin}>
      <label className="sr-only" htmlFor="teamName">Nombre del equipo</label>
      <input
        id="teamName"
        value={teamName}
        onChange={(event) => setTeamName(event.target.value)}
        maxLength={80}
        placeholder="Nombre del equipo"
        className="detail-team-input"
      />

      <div className="team-builder-count">
        <span>Capitan + miembros</span>
        <strong>{selectedRosterSize}/{playersPerTeam}</strong>
      </div>

      {selectedPlayers.length > 0 && (
        <div className="selected-player-list">
          {selectedPlayers.map((player) => (
            <button
              key={player.id}
              type="button"
              className="selected-player-chip"
              onClick={() => removeSelectedPlayer(player.id)}
            >
              {player.displayName}
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          ))}
        </div>
      )}

      {canSelectMore && (
        <>
          <div className="player-search-box">
            <Search className="h-4 w-4" aria-hidden="true" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar miembros"
              className="player-search-input"
            />
          </div>
          <PlayerResults
            players={eligiblePlayers.filter((player) => player.id !== currentUserId && !selectedIds.has(player.id))}
            loading={loadingPlayers}
            disabled={submitting}
            onSelect={addSelectedPlayer}
          />
        </>
      )}

      <Button type="submit" disabled={submitting}>
        {submitting ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <UserPlus className="h-4 w-4" aria-hidden="true" />
        )}
        Anotar equipo
      </Button>
      {error && <p className="detail-form-error" role="alert">{error}</p>}
      {message && <p className="detail-form-message" role="status">{message}</p>}
    </form>
  );
}

function PlayerResults({
  players,
  loading,
  disabled,
  onSelect,
}: {
  players: TournamentPlayer[];
  loading: boolean;
  disabled: boolean;
  onSelect: (player: TournamentPlayer) => void;
}) {
  if (loading) {
    return <div className="player-results-note">Buscando jugadores...</div>;
  }

  if (players.length === 0) {
    return <div className="player-results-note">No hay jugadores disponibles</div>;
  }

  return (
    <div className="player-results-list">
      {players.slice(0, 6).map((player) => (
        <button
          key={player.id}
          type="button"
          className="player-result-item"
          disabled={disabled}
          onClick={() => onSelect(player)}
        >
          <span className="player-result-avatar">{initials(player.displayName) || 'J'}</span>
          <span>{player.displayName}</span>
          <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
