/**
 * LeaderboardTable — client-side hydrated public player ranking.
 *
 * Decision Context:
 * - Static page + client hydration: /leaderboard ships a light shell and this island
 *   fetches the ranking from the /api/graphql proxy after hydration (client:visible),
 *   mirroring the TournamentList pattern. No auth needed — the endpoint is public.
 * - Highlight self: when `currentUserId` is provided (logged-in visitor), that row is
 *   accented so the player can locate their own rank, satisfying the "comparar mi
 *   rendimiento" motivation of the user story.
 * - Podium accents: ranks 1–3 get gold/silver/bronze rank chips for the FIFA aesthetic.
 * - Icons via lucide-react only (project hard rule: no emojis in UI).
 * - Previously fixed bugs: none relevant.
 */

import { useEffect, useState } from 'react';
import { AlertCircle, Crown, Hand, RefreshCw, Shield, Target, Trophy, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GET_LEADERBOARD, type LeaderboardEntry } from '@/graphql/operations/leaderboard';
import type { PlayerPosition } from '@/graphql/operations/profile';

interface GetLeaderboardPayload {
  leaderboard: LeaderboardEntry[];
}

interface LeaderboardTableProps {
  limit?: number;
  currentUserId?: string | null;
}

const POSITION_LABEL: Record<PlayerPosition, string> = {
  GOALKEEPER: 'Arquero',
  DEFENDER: 'Defensor',
  MIDFIELDER: 'Mediocampista',
  FORWARD: 'Delantero',
};

const POSITION_ICON: Record<PlayerPosition, typeof Hand> = {
  GOALKEEPER: Hand,
  DEFENDER: Shield,
  MIDFIELDER: Zap,
  FORWARD: Target,
};

const DIVISION_LABEL: Record<number, string> = {
  1: 'Bronce',
  2: 'Plata',
  3: 'Oro',
  4: 'Diamante',
};

function divisionLabel(division: number): string {
  return DIVISION_LABEL[division] ?? `Elite ${division}`;
}

function rankClass(rank: number): string {
  if (rank === 1) return 'leaderboard-rank--gold';
  if (rank === 2) return 'leaderboard-rank--silver';
  if (rank === 3) return 'leaderboard-rank--bronze';
  return '';
}

export function LeaderboardTable({ limit = 50, currentUserId = null }: LeaderboardTableProps) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
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
      body: JSON.stringify({ query: GET_LEADERBOARD, variables: { limit } }),
    })
      .then((response) => response.json())
      .then((payload: { data?: GetLeaderboardPayload; errors?: Array<{ message: string }> }) => {
        if (cancelled) return;
        const graphQLError = payload.errors?.[0]?.message;
        if (graphQLError) throw new Error(graphQLError);
        setEntries(payload.data?.leaderboard ?? []);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Error al cargar el ranking');
          setEntries([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [limit, reloadKey]);

  if (loading) {
    return (
      <div className="leaderboard-skeleton" aria-busy="true" aria-label="Cargando ranking">
        {[1, 2, 3, 4, 5, 6].map((item) => (
          <div key={item} className="leaderboard-skeleton-row" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-6 text-center">
        <AlertCircle className="mx-auto mb-3 h-7 w-7 text-destructive" aria-hidden="true" />
        <p className="font-medium text-foreground">No pudimos cargar el ranking</p>
        <p className="mt-1 text-sm text-muted-foreground">{error}</p>
        <Button
          type="button"
          variant="secondary"
          className="mt-4"
          onClick={() => setReloadKey((key) => key + 1)}
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Reintentar
        </Button>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <Trophy className="mx-auto mb-3 h-8 w-8 text-primary" aria-hidden="true" />
        <p className="text-xl font-medium">Todavía no hay ranking</p>
        <p className="mt-2 text-muted-foreground">
          El ranking aparece cuando hay jugadores con al menos 5 partidos disputados. Sumá
          partidos y aparecé acá.
        </p>
      </div>
    );
  }

  return (
    <div className="leaderboard" data-testid="leaderboard-table">
      <div className="leaderboard-head" aria-hidden="true">
        <span className="leaderboard-col-rank">#</span>
        <span className="leaderboard-col-player">Jugador</span>
        <span className="leaderboard-col-stat">PJ</span>
        <span className="leaderboard-col-stat">PG</span>
        <span className="leaderboard-col-winrate">Efectividad</span>
      </div>

      <ul className="leaderboard-list">
        {entries.map((entry) => {
          const PositionIcon = entry.preferredPosition
            ? POSITION_ICON[entry.preferredPosition]
            : null;
          const isSelf = currentUserId != null && entry.id === currentUserId;
          return (
            <li
              key={entry.id}
              className={`leaderboard-row${isSelf ? ' leaderboard-row--self' : ''}`}
              data-self={isSelf ? 'true' : undefined}
            >
              <span className={`leaderboard-rank ${rankClass(entry.rank)}`}>
                {entry.rank <= 3 ? (
                  <Crown size={16} strokeWidth={2.25} aria-hidden="true" />
                ) : null}
                <span className="leaderboard-rank-num">{entry.rank}</span>
              </span>

              <span className="leaderboard-player">
                <span className="leaderboard-avatar">
                  {entry.avatarUrl ? (
                    <img
                      src={entry.avatarUrl}
                      alt={`Foto de ${entry.displayName}`}
                      width={40}
                      height={40}
                      loading="lazy"
                    />
                  ) : (
                    <span className="leaderboard-avatar-fallback" aria-hidden="true">
                      {entry.displayName.charAt(0).toUpperCase()}
                    </span>
                  )}
                </span>
                <span className="leaderboard-identity">
                  <span className="leaderboard-name">
                    {entry.displayName}
                    {isSelf && <span className="leaderboard-you">Vos</span>}
                  </span>
                  <span className="leaderboard-meta">
                    <span className="leaderboard-division">{divisionLabel(entry.division)}</span>
                    {entry.preferredPosition && PositionIcon && (
                      <span className="leaderboard-position">
                        <PositionIcon size={12} strokeWidth={2.25} aria-hidden="true" />
                        {POSITION_LABEL[entry.preferredPosition]}
                      </span>
                    )}
                  </span>
                </span>
              </span>

              <span className="leaderboard-col-stat leaderboard-stat">{entry.matchesPlayed}</span>
              <span className="leaderboard-col-stat leaderboard-stat">{entry.matchesWon}</span>
              <span className="leaderboard-col-winrate leaderboard-winrate">
                {entry.winrate.toFixed(1)}%
              </span>
            </li>
          );
        })}
      </ul>

      <style>{`
        .leaderboard {
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 12px;
          overflow: hidden;
          background: hsl(220 55% 11%);
        }
        .leaderboard-head,
        .leaderboard-row {
          display: grid;
          grid-template-columns: 56px 1fr 56px 56px 110px;
          align-items: center;
          gap: 0.5rem;
          padding: 0.7rem 1rem;
        }
        .leaderboard-head {
          font-family: 'Barlow Condensed', sans-serif;
          font-size: 0.72rem;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: hsl(215 20% 50%);
          border-bottom: 1px solid rgba(255, 255, 255, 0.07);
          background: rgba(255, 255, 255, 0.02);
        }
        .leaderboard-col-stat,
        .leaderboard-col-winrate { text-align: center; }
        .leaderboard-col-winrate { text-align: right; }

        .leaderboard-list { list-style: none; margin: 0; padding: 0; }
        .leaderboard-row + .leaderboard-row { border-top: 1px solid rgba(255, 255, 255, 0.05); }
        .leaderboard-row { transition: background 0.15s; }
        .leaderboard-row:hover { background: rgba(255, 255, 255, 0.03); }
        .leaderboard-row--self {
          background: rgba(246, 164, 0, 0.08);
          box-shadow: inset 3px 0 0 hsl(35 100% 52%);
        }
        .leaderboard-row--self:hover { background: rgba(246, 164, 0, 0.12); }

        .leaderboard-rank {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          font-family: 'Bebas Neue', sans-serif;
          font-size: 1.1rem;
          color: hsl(215 20% 60%);
        }
        .leaderboard-rank-num { line-height: 1; }
        .leaderboard-rank--gold { color: hsl(44 100% 60%); }
        .leaderboard-rank--silver { color: hsl(205 18% 80%); }
        .leaderboard-rank--bronze { color: hsl(24 78% 62%); }

        .leaderboard-player { display: flex; align-items: center; gap: 0.7rem; min-width: 0; }
        .leaderboard-avatar {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          overflow: hidden;
          flex-shrink: 0;
          background: hsl(220 40% 16%);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .leaderboard-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .leaderboard-avatar-fallback {
          font-family: 'Bebas Neue', sans-serif;
          font-size: 1.1rem;
          color: hsl(215 20% 60%);
        }
        .leaderboard-identity { display: flex; flex-direction: column; gap: 0.15rem; min-width: 0; }
        .leaderboard-name {
          display: flex;
          align-items: center;
          gap: 0.45rem;
          font-family: 'Barlow', sans-serif;
          font-weight: 600;
          color: hsl(210 20% 94%);
          font-size: 0.95rem;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .leaderboard-you {
          font-family: 'Barlow Condensed', sans-serif;
          font-size: 0.62rem;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: hsl(220 72% 7%);
          background: hsl(35 100% 52%);
          padding: 0.05rem 0.4rem;
          border-radius: 10px;
          flex-shrink: 0;
        }
        .leaderboard-meta {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          font-family: 'Barlow Condensed', sans-serif;
          font-size: 0.72rem;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: hsl(215 20% 50%);
        }
        .leaderboard-position { display: inline-flex; align-items: center; gap: 0.2rem; }

        .leaderboard-stat {
          font-family: 'Bebas Neue', sans-serif;
          font-size: 1.15rem;
          color: hsl(210 20% 88%);
        }
        .leaderboard-winrate {
          font-family: 'Bebas Neue', sans-serif;
          font-size: 1.25rem;
          color: hsl(35 100% 55%);
        }

        .leaderboard-skeleton {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .leaderboard-skeleton-row {
          height: 56px;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.06);
          background: hsl(220 40% 16%);
          animation: leaderboard-pulse 1.4s ease-in-out infinite;
        }
        @keyframes leaderboard-pulse {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 0.85; }
        }

        @media (max-width: 560px) {
          .leaderboard-head,
          .leaderboard-row {
            grid-template-columns: 40px 1fr 70px;
          }
          .leaderboard-col-stat,
          .leaderboard-stat { display: none; }
          .leaderboard-meta { gap: 0.4rem; }
        }
      `}</style>
    </div>
  );
}
