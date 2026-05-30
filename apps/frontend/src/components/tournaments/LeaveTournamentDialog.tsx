/**
 * LeaveTournamentDialog — modal de confirmación para retirar un equipo de un torneo.
 *
 * Decision Context:
 * - Acción destructiva irreversible: se requiere checkbox de confirmación obligatorio
 *   antes de habilitar el botón de retiro. Esto previene retiros accidentales.
 * - Si el torneo tiene exactamente 2 equipos, se muestra un warning rojo adicional
 *   porque el retiro dejaría 1 equipo y podría cancelar el torneo.
 * - El motivo es opcional (textarea, max 500 chars) para registrar contexto histórico.
 * - Las llamadas se hacen a /api/graphql-auth (proxy autenticado con cookie HttpOnly).
 * - Post-acción exitosa: toast informativo + window.location.reload() para refrescar
 *   el estado del torneo. Si el torneo fue cancelado, se muestra mensaje adicional.
 * Previously fixed bugs: none relevant.
 */

import { useState } from 'react';
import { AlertTriangle, Loader2, LogOut, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LEAVE_TOURNAMENT, type LeaveTournamentResult } from '@/graphql/operations/tournaments';

interface LeaveTournamentDialogProps {
  tournamentId: string;
  teamId: string;
  teamName: string;
  tournamentName: string;
  /** True when only 2 teams remain — retiring would leave 1 and risk tournament cancellation. */
  hasOnlyTwoTeams: boolean;
  onClose: () => void;
  onSuccess: (result: LeaveTournamentResult) => void;
}

export function LeaveTournamentDialog({
  tournamentId,
  teamId,
  teamName,
  tournamentName,
  hasOnlyTwoTeams,
  onClose,
  onSuccess,
}: LeaveTournamentDialogProps) {
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLeave() {
    if (!confirmed || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/graphql-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: LEAVE_TOURNAMENT,
          variables: {
            input: {
              tournamentId,
              teamId,
              reason: reason.trim() || null,
            },
          },
        }),
      });

      const payload = (await response.json()) as {
        data?: { leaveTournament?: LeaveTournamentResult };
        errors?: Array<{ message: string }>;
      };

      const graphQLError = payload.errors?.[0]?.message;
      if (graphQLError) {
        if (graphQLError.toLowerCase().includes('authentication required')) {
          window.location.href = '/login';
          return;
        }
        throw new Error(graphQLError);
      }

      const result = payload.data?.leaveTournament;
      if (!result) throw new Error('Respuesta inesperada del servidor');
      if (!result.success) throw new Error(result.message ?? 'No se pudo retirar el equipo');

      onSuccess(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al retirar el equipo');
    } finally {
      setSubmitting(false);
    }
  }

  const confirmLabel = `Confirmo que quiero retirar al equipo "${teamName}" del torneo "${tournamentName}"`;

  return (
    <div className="leave-dialog-overlay" role="dialog" aria-modal="true" aria-labelledby="leave-dialog-title">
      <div className="leave-dialog">
        <div className="leave-dialog-header">
          <h2 id="leave-dialog-title" className="leave-dialog-title">
            Retirar equipo del torneo
          </h2>
          <button
            type="button"
            className="leave-dialog-close"
            onClick={onClose}
            aria-label="Cerrar"
            disabled={submitting}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="leave-dialog-body">
          <div className="leave-warning" role="alert">
            <AlertTriangle size={18} aria-hidden="true" />
            <p>
              Esta acción no se puede deshacer. Tu equipo será eliminado del torneo y todos los
              miembros perderán su inscripción.
            </p>
          </div>

          {hasOnlyTwoTeams && (
            <div className="leave-warning leave-warning--critical" role="alert">
              <AlertTriangle size={18} aria-hidden="true" />
              <p>
                Si retirás tu equipo, el torneo podría cancelarse porque quedaría solo 1 equipo
                inscripto.
              </p>
            </div>
          )}

          <div className="leave-reason-group">
            <label className="leave-label" htmlFor="leave-reason">
              Motivo del retiro (opcional)
            </label>
            <textarea
              id="leave-reason"
              className="leave-reason-input"
              placeholder="Ej: No podemos participar por conflictos de agenda"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              rows={3}
              disabled={submitting}
            />
            <span className="leave-char-count">{reason.length}/500</span>
          </div>

          <label className="leave-confirm-label">
            <input
              type="checkbox"
              className="leave-confirm-checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              disabled={submitting}
            />
            <span>{confirmLabel}</span>
          </label>

          {error && (
            <p className="leave-error" role="alert">
              {error}
            </p>
          )}
        </div>

        <div className="leave-dialog-footer">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={submitting}
            className="leave-btn-cancel"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleLeave}
            disabled={!confirmed || submitting}
            className="leave-btn-confirm"
          >
            {submitting ? (
              <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            ) : (
              <LogOut size={16} aria-hidden="true" />
            )}
            Retirar equipo
          </Button>
        </div>
      </div>

      <style>{`
        .leave-dialog-overlay {
          position: fixed;
          inset: 0;
          background: rgba(7, 15, 31, 0.82);
          backdrop-filter: blur(6px);
          z-index: 200;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
        }
        .leave-dialog {
          background: hsl(220 55% 11%);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 14px;
          width: 100%;
          max-width: 480px;
          display: flex;
          flex-direction: column;
          gap: 0;
          box-shadow: 0 24px 64px rgba(0,0,0,0.6);
        }
        .leave-dialog-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1.25rem 1.5rem 1rem;
          border-bottom: 1px solid rgba(255,255,255,0.08);
        }
        .leave-dialog-title {
          margin: 0;
          font-family: 'Bebas Neue', sans-serif;
          font-size: 1.6rem;
          letter-spacing: 0.04em;
          color: white;
        }
        .leave-dialog-close {
          background: transparent;
          border: none;
          color: hsl(215 20% 55%);
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0.4rem;
          border-radius: 6px;
          min-width: 44px;
          min-height: 44px;
        }
        .leave-dialog-close:hover { color: white; background: rgba(255,255,255,0.08); }
        .leave-dialog-body {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          padding: 1.25rem 1.5rem;
        }
        .leave-warning {
          display: flex;
          gap: 0.6rem;
          align-items: flex-start;
          background: rgba(234, 179, 8, 0.1);
          border: 1px solid rgba(234, 179, 8, 0.3);
          border-radius: 8px;
          padding: 0.85rem;
          color: hsl(45 96% 70%);
          font-size: 0.875rem;
          line-height: 1.5;
        }
        .leave-warning p { margin: 0; }
        .leave-warning--critical {
          background: rgba(239, 68, 68, 0.1);
          border-color: rgba(239, 68, 68, 0.35);
          color: hsl(0 86% 78%);
        }
        .leave-reason-group {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
        }
        .leave-label {
          font-size: 0.84rem;
          color: hsl(215 20% 65%);
          font-weight: 600;
        }
        .leave-reason-input {
          background: hsl(220 55% 8%);
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 8px;
          color: white;
          font-size: 0.875rem;
          line-height: 1.5;
          padding: 0.65rem 0.8rem;
          resize: vertical;
          min-height: 80px;
          outline: none;
          font-family: inherit;
        }
        .leave-reason-input:focus { border-color: rgba(246,164,0,0.4); }
        .leave-reason-input:disabled { opacity: 0.6; }
        .leave-char-count { font-size: 0.78rem; color: hsl(215 20% 45%); text-align: right; }
        .leave-confirm-label {
          display: flex;
          align-items: flex-start;
          gap: 0.65rem;
          cursor: pointer;
          color: hsl(215 20% 78%);
          font-size: 0.875rem;
          line-height: 1.5;
        }
        .leave-confirm-checkbox {
          flex-shrink: 0;
          margin-top: 0.15rem;
          width: 18px;
          height: 18px;
          accent-color: hsl(35 100% 48%);
          cursor: pointer;
        }
        .leave-error {
          margin: 0;
          color: hsl(0 72% 70%);
          font-size: 0.85rem;
          border: 1px solid rgba(239,68,68,0.2);
          background: rgba(239,68,68,0.08);
          border-radius: 6px;
          padding: 0.6rem 0.75rem;
        }
        .leave-dialog-footer {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 0.75rem;
          padding: 1rem 1.5rem 1.25rem;
          border-top: 1px solid rgba(255,255,255,0.08);
        }
        .leave-btn-cancel {
          min-height: 44px;
          font-family: 'Barlow Condensed', sans-serif;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }
        .leave-btn-confirm {
          min-height: 44px;
          background: hsl(0 72% 51%);
          color: white;
          font-family: 'Barlow Condensed', sans-serif;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
        }
        .leave-btn-confirm:hover:not(:disabled) { background: hsl(0 72% 45%); }
        .leave-btn-confirm:disabled { opacity: 0.45; cursor: not-allowed; }
        @media (max-width: 480px) {
          .leave-dialog { border-radius: 10px; }
          .leave-dialog-header,
          .leave-dialog-body,
          .leave-dialog-footer { padding-left: 1rem; padding-right: 1rem; }
          .leave-dialog-footer { flex-direction: column-reverse; }
          .leave-btn-cancel,
          .leave-btn-confirm { width: 100%; justify-content: center; }
        }
      `}</style>
    </div>
  );
}
