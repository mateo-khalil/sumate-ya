/**
 * LeaveTournamentButton — botón secundario destructivo para retirar un equipo de un torneo.
 *
 * Decision Context:
 * - Visible SOLO si: usuario es capitán del equipo Y torneo está en REGISTRATION.
 * - Las condiciones de visibilidad se comprueban externamente (en TournamentRegistrationForm)
 *   por lo que este componente asume que ya fue verificado y renderiza siempre.
 * - Es una acción secundaria de bajo perfil (no un CTA prominente) para evitar retiros
 *   accidentales — el ícono LogOut de lucide-react comunica la acción sin alarmar.
 * - El dialog de confirmación real vive en LeaveTournamentDialog.
 * Previously fixed bugs: none relevant.
 */

import { useState } from 'react';
import { LogOut } from 'lucide-react';
import { LeaveTournamentDialog } from './LeaveTournamentDialog';
import type { LeaveTournamentResult } from '@/graphql/operations/tournaments';

interface LeaveTournamentButtonProps {
  tournamentId: string;
  teamId: string;
  teamName: string;
  tournamentName: string;
  /** True when only 2 active teams remain — used to show extra cancellation warning. */
  hasOnlyTwoTeams: boolean;
}

export function LeaveTournamentButton({
  tournamentId,
  teamId,
  teamName,
  tournamentName,
  hasOnlyTwoTeams,
}: LeaveTournamentButtonProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [extraMessage, setExtraMessage] = useState<string | null>(null);

  function handleSuccess(result: LeaveTournamentResult) {
    setDialogOpen(false);
    setSuccessMessage(result.message);
    if (result.tournamentStatus === 'CANCELLED') {
      setExtraMessage('El torneo fue cancelado. Serás redirigido a la lista de torneos.');
      setTimeout(() => {
        window.location.href = '/torneos';
      }, 2500);
    } else {
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    }
  }

  if (successMessage) {
    return (
      <div className="leave-success-state">
        <p className="leave-success-msg" role="status">{successMessage}</p>
        {extraMessage && <p className="leave-extra-msg" role="status">{extraMessage}</p>}
        <style>{`
          .leave-success-state { display: flex; flex-direction: column; gap: 0.4rem; }
          .leave-success-msg { margin: 0; color: hsl(142 72% 65%); font-size: 0.84rem; }
          .leave-extra-msg { margin: 0; color: hsl(45 96% 70%); font-size: 0.82rem; }
        `}</style>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        className="leave-tournament-btn"
        onClick={() => setDialogOpen(true)}
        aria-label={`Retirar equipo ${teamName} del torneo`}
      >
        <LogOut size={15} aria-hidden="true" />
        Retirar equipo
      </button>

      {dialogOpen && (
        <LeaveTournamentDialog
          tournamentId={tournamentId}
          teamId={teamId}
          teamName={teamName}
          tournamentName={tournamentName}
          hasOnlyTwoTeams={hasOnlyTwoTeams}
          onClose={() => setDialogOpen(false)}
          onSuccess={handleSuccess}
        />
      )}

      <style>{`
        .leave-tournament-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          background: transparent;
          border: 1px solid rgba(239, 68, 68, 0.3);
          border-radius: 8px;
          color: hsl(0 72% 68%);
          padding: 0.5rem 0.875rem;
          font-size: 0.84rem;
          font-weight: 600;
          cursor: pointer;
          width: 100%;
          justify-content: center;
          min-height: 44px;
          transition: border-color 0.15s, background 0.15s, color 0.15s;
        }
        .leave-tournament-btn:hover {
          border-color: rgba(239, 68, 68, 0.6);
          background: rgba(239, 68, 68, 0.08);
          color: hsl(0 72% 78%);
        }
      `}</style>
    </>
  );
}
