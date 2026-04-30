/**
 * LeaveMatchButton — React island for leaving a match
 *
 * Decision Context:
 * - Why React island: requires click interaction, confirmation dialog, and loading state.
 *   client:load ensures the button is interactive immediately (it's the primary CTA for
 *   enrolled players, displayed in the info card above the fold).
 * - Confirmation flow:
 *   1. Click "Salirme del partido" → compute minutes until match → show inline dialog.
 *   2. If < 60 min → urgent warning with extra callout.
 *   3. If ≥ 60 min → normal confirmation.
 *   The server does NOT block leaving for either case — the warning is informational only
 *   (Caso D in the service Decision Context).
 * - Post-success:
 *   - matchDeleted === true  → redirect to /partidos (match no longer exists)
 *   - matchDeleted === false → window.location.reload() (SSR fetches fresh participant data)
 * - Token security: the accessToken JWT is embedded as a prop in the initial HTML. This
 *   is the same approach as JoinTeamButton — acceptable for a 1-hour TTL token.
 * - Previously fixed bugs: none relevant.
 */

import { useState } from 'react';
import { LEAVE_MATCH } from '../../graphql/operations/matches';
import type { LeaveMatchResult } from '../../graphql/operations/matches';

interface Props {
  matchId: string;
  /** ISO timestamp of the match (scheduledAt) to compute urgency */
  matchDateTime: string;
  backendUrl: string;
  accessToken: string;
}

type Stage = 'idle' | 'confirming' | 'loading';

export default function LeaveMatchButton({
  matchId,
  matchDateTime,
  backendUrl,
  accessToken,
}: Props) {
  const [stage, setStage] = useState<Stage>('idle');
  const [isUrgent, setIsUrgent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleLeaveClick() {
    const minsLeft = (new Date(matchDateTime).getTime() - Date.now()) / 60_000;
    setIsUrgent(minsLeft < 60);
    setStage('confirming');
    setError(null);
  }

  function handleCancel() {
    setStage('idle');
    setError(null);
  }

  async function handleConfirm() {
    setStage('loading');
    setError(null);

    try {
      const res = await fetch(`${backendUrl}/graphql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          query: LEAVE_MATCH,
          variables: { input: { matchId } },
        }),
      });

      const json = (await res.json()) as {
        data?: { leaveMatch?: LeaveMatchResult };
        errors?: { message: string }[];
      };

      if (json.errors?.length) {
        setError(json.errors[0].message);
        setStage('idle');
        return;
      }

      const result = json.data?.leaveMatch;
      if (!result) {
        setError('No se pudo procesar la solicitud. Intentá de nuevo.');
        setStage('idle');
        return;
      }

      if (result.matchDeleted) {
        // Match auto-deleted — redirect to the listing
        window.location.href = '/partidos';
      } else {
        // Reload SSR page with fresh participant data
        window.location.reload();
      }
    } catch {
      setError('Error de red. Verificá tu conexión e intentá de nuevo.');
      setStage('idle');
    }
  }

  if (stage === 'loading') {
    return (
      <div className="leave-wrapper">
        <button disabled className="leave-btn leave-btn--loading" aria-busy>
          <span aria-label="Procesando…">⏳ Procesando…</span>
        </button>
        <style>{styles}</style>
      </div>
    );
  }

  if (stage === 'confirming') {
    return (
      <div className="leave-wrapper">
        <div className="confirm-box" role="dialog" aria-modal="true">
          {isUrgent && (
            <div className="confirm-urgent" role="alert">
              ⚠ Falta menos de 1 hora para el partido
            </div>
          )}
          <p className="confirm-question">
            {isUrgent
              ? '¿Estás seguro que querés salirte? Tu lugar quedará libre para otro jugador.'
              : '¿Querés salirte del partido? Tu lugar quedará disponible.'}
          </p>
          <div className="confirm-actions">
            <button onClick={handleConfirm} className="confirm-btn confirm-btn--danger">
              Sí, salirme
            </button>
            <button onClick={handleCancel} className="confirm-btn confirm-btn--ghost">
              Cancelar
            </button>
          </div>
        </div>
        {error && <p className="leave-error" role="alert">{error}</p>}
        <style>{styles}</style>
      </div>
    );
  }

  return (
    <div className="leave-wrapper">
      <button onClick={handleLeaveClick} className="leave-btn">
        Salirme del partido
      </button>
      {error && <p className="leave-error" role="alert">{error}</p>}
      <style>{styles}</style>
    </div>
  );
}

const styles = `
  .leave-wrapper { display: flex; flex-direction: column; gap: 0.5rem; }

  .leave-btn {
    padding: 0.6rem 1.25rem;
    background: transparent;
    color: hsl(0 72% 65%);
    border: 1px solid hsl(0 72% 50% / 0.45);
    border-radius: 8px; cursor: pointer;
    font-family: 'Barlow Condensed', sans-serif;
    font-size: 0.875rem; font-weight: 700;
    letter-spacing: 0.08em; text-transform: uppercase;
    transition: background 0.15s, border-color 0.15s, color 0.15s;
    white-space: nowrap;
  }
  .leave-btn:hover { background: hsl(0 72% 50% / 0.1); border-color: hsl(0 72% 55% / 0.7); color: hsl(0 72% 72%); }
  .leave-btn--loading { opacity: 0.6; cursor: wait; }

  .confirm-box {
    background: hsl(220 40% 14%);
    border: 1px solid hsl(0 72% 50% / 0.3);
    border-radius: 10px;
    padding: 1rem 1.25rem;
    display: flex; flex-direction: column; gap: 0.75rem;
  }

  .confirm-urgent {
    font-family: 'Barlow Condensed', sans-serif;
    font-size: 0.8rem; font-weight: 700; letter-spacing: 0.1em;
    text-transform: uppercase;
    color: hsl(35 100% 60%);
    background: hsl(35 100% 48% / 0.1);
    border: 1px solid hsl(35 100% 48% / 0.25);
    border-radius: 6px; padding: 0.4rem 0.75rem;
  }

  .confirm-question {
    font-family: 'Barlow', sans-serif;
    font-size: 0.875rem; color: hsl(210 20% 80%);
    margin: 0; line-height: 1.4;
  }

  .confirm-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }

  .confirm-btn {
    padding: 0.5rem 1rem;
    border-radius: 7px; cursor: pointer;
    font-family: 'Barlow Condensed', sans-serif;
    font-size: 0.8rem; font-weight: 700;
    letter-spacing: 0.08em; text-transform: uppercase;
    transition: background 0.15s, border-color 0.15s;
    border: 1px solid transparent;
  }
  .confirm-btn--danger {
    background: hsl(0 72% 45%); color: #fff;
    border-color: hsl(0 72% 45%);
  }
  .confirm-btn--danger:hover { background: hsl(0 72% 52%); border-color: hsl(0 72% 52%); }
  .confirm-btn--ghost {
    background: transparent;
    color: hsl(215 20% 60%);
    border-color: rgba(255,255,255,0.12);
  }
  .confirm-btn--ghost:hover { background: rgba(255,255,255,0.06); color: hsl(210 20% 80%); }

  .leave-error {
    font-size: 0.78rem; color: hsl(0 72% 65%);
    font-family: 'Barlow', sans-serif; margin: 0;
  }
`;
