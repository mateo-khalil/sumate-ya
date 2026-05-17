import { type SyntheticEvent, useState } from 'react';
import { Loader2, LogIn, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  REGISTER_TOURNAMENT_TEAM,
  type TournamentTeamRegistrationResult,
} from '@/graphql/operations/tournaments';

interface TournamentRegistrationFormProps {
  tournamentId: string;
  isAuthenticated: boolean;
  canRegister: boolean;
}

function isAuthError(message: string): boolean {
  return message.toLowerCase().includes('authentication required');
}

export function TournamentRegistrationForm({
  tournamentId,
  isAuthenticated,
  canRegister,
}: TournamentRegistrationFormProps) {
  const [teamName, setTeamName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isAuthenticated) {
      window.location.href = '/login';
      return;
    }

    const name = teamName.trim();
    if (name.length < 2) {
      setError('Ingresá al menos 2 caracteres para el equipo.');
      return;
    }

    setSubmitting(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch('/api/graphql-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: REGISTER_TOURNAMENT_TEAM,
          variables: { input: { tournamentId, name } },
        }),
      });

      const payload = (await response.json()) as {
        data?: { registerTournamentTeam?: TournamentTeamRegistrationResult };
        errors?: Array<{ message: string }>;
      };

      const graphQLError = payload.errors?.[0]?.message;
      if (graphQLError) {
        if (isAuthError(graphQLError)) window.location.href = '/login';
        throw new Error(graphQLError);
      }

      const result = payload.data?.registerTournamentTeam;
      if (!result) throw new Error('Respuesta inesperada del servidor');
      if (!result.success) {
        const resultMessage = result.message ?? 'No se pudo inscribir el equipo';
        if (isAuthError(resultMessage)) window.location.href = '/login';
        throw new Error(resultMessage);
      }

      setMessage('Equipo anotado. Actualizando torneo...');
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al inscribir el equipo');
    } finally {
      setSubmitting(false);
    }
  }

  if (!canRegister) {
    return (
      <div className="registration-closed" role="status">
        <span>Inscripción cerrada o cupos completos</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <a className="detail-login-button" href="/login">
        <LogIn className="h-4 w-4" aria-hidden="true" />
        Iniciar sesión para anotar equipo
      </a>
    );
  }

  return (
    <form className="detail-register-form" onSubmit={handleSubmit}>
      <label className="sr-only" htmlFor="teamName">Nombre del equipo</label>
      <input
        id="teamName"
        value={teamName}
        onChange={(event) => setTeamName(event.target.value)}
        maxLength={80}
        placeholder="Nombre del equipo"
        className="detail-team-input"
      />
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
