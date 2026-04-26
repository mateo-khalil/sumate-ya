/**
 * JoinTeamButton — React island for joining a match team
 *
 * Decision Context:
 * - Why React island: requires click interaction + loading state, so it needs hydration.
 *   client:load is used (not client:visible) because the button is the primary CTA
 *   and must be interactive immediately without waiting for scroll.
 * - Auth token: passed as a prop from the SSR Astro page, which reads it from the
 *   HttpOnly cookie. The token is short-lived (1 h JWT), so embedding it in the initial
 *   HTML is acceptable — it won't persist after expiry.
 * - Post-success: page is reloaded via window.location.reload() so the SSR page fetches
 *   fresh participant data without requiring client-side state management or urql.
 * - Error display: shown inline below the button (no toast library dependency).
 * - Previously fixed bugs: none relevant.
 */

import { useState } from 'react';
import { JOIN_MATCH } from '../../graphql/operations/matches';
import type { MatchTeam } from '../../graphql/operations/matches';

interface Props {
  matchId: string;
  team: MatchTeam;
  /** True if button action is not available (spot full, already joined elsewhere, etc.) */
  disabled: boolean;
  /** Label shown on the button */
  label: string;
  /** Full URL of the GraphQL backend endpoint */
  backendUrl: string;
  /** Short-lived access token forwarded from SSR cookies */
  accessToken: string;
}

export default function JoinTeamButton({
  matchId,
  team,
  disabled,
  label,
  backendUrl,
  accessToken,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleJoin() {
    if (disabled || loading) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${backendUrl}/graphql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          query: JOIN_MATCH,
          variables: { input: { matchId, team } },
        }),
      });

      const json = (await res.json()) as {
        data?: { joinMatch?: { success: boolean; message?: string | null } };
        errors?: { message: string }[];
      };

      if (json.errors?.length) {
        setError(json.errors[0].message);
        return;
      }

      const result = json.data?.joinMatch;
      if (!result?.success) {
        setError(result?.message ?? 'No se pudo sumarte al partido. Intentá de nuevo.');
        return;
      }

      // Reload the page so SSR fetches fresh participant data
      window.location.reload();
    } catch {
      setError('Error de red. Verificá tu conexión e intentá de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="join-btn-wrapper">
      <button
        onClick={handleJoin}
        disabled={disabled || loading}
        className={`join-btn${disabled ? ' join-btn--disabled' : ''}${loading ? ' join-btn--loading' : ''}`}
        aria-busy={loading}
      >
        {loading ? (
          <span className="join-btn-spinner" aria-label="Procesando…">⏳</span>
        ) : (
          label
        )}
      </button>
      {error && (
        <p className="join-btn-error" role="alert">
          {error}
        </p>
      )}
      <style>{`
        .join-btn-wrapper { display: flex; flex-direction: column; gap: 0.4rem; }
        .join-btn {
          padding: 0.65rem 1.25rem;
          background: hsl(35 100% 48%);
          color: hsl(220 72% 7%);
          border: none; border-radius: 8px; cursor: pointer;
          font-family: 'Barlow Condensed', sans-serif;
          font-size: 0.875rem; font-weight: 700;
          letter-spacing: 0.1em; text-transform: uppercase;
          transition: background 0.15s, opacity 0.15s;
          width: 100%;
        }
        .join-btn:hover:not(:disabled) { background: hsl(35 100% 55%); }
        .join-btn--disabled { background: hsl(220 30% 20%); color: hsl(215 20% 45%); cursor: not-allowed; }
        .join-btn--loading { opacity: 0.7; cursor: wait; }
        .join-btn-spinner { font-size: 1rem; }
        .join-btn-error {
          font-size: 0.78rem; color: hsl(0 72% 65%);
          font-family: 'Barlow', sans-serif; margin: 0;
        }
      `}</style>
    </div>
  );
}
