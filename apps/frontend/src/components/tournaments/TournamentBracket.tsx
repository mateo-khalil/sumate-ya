/**
 * TournamentBracket — bracket visual para torneos de eliminación directa.
 *
 * Decision Context:
 * - Issue #132 T1: muestra el bracket de single_elimination y la fase de eliminación
 *   de group_stage_elimination. Los partidos con equipos NULL se muestran como "Por definir".
 * - T4: partidos con isPast=true se muestran atenuados (estilo fixture-past).
 * - Las rondas se muestran como columnas (izquierda→derecha). En mobile: scroll horizontal.
 * - No usa líneas SVG de conexión (demasiado complejo con el layout CSS); usa separación
 *   visual entre columnas para indicar la progresión.
 * - Previously fixed bugs: none relevant.
 */

import { Trophy, Clock, CheckCircle } from 'lucide-react';
import type { TournamentFixtureMatch } from '../../graphql/operations/tournaments';

interface Props {
  matches: TournamentFixtureMatch[];
  /** Si true, solo muestra fase de eliminación (para group_stage_elimination) */
  eliminationOnly?: boolean;
}

const PHASE_LABEL: Record<string, string> = {
  ROUND_OF_16: 'Octavos', QUARTERFINAL: 'Cuartos',
  SEMIFINAL: 'Semifinal', THIRD_PLACE: '3er Lugar', FINAL: 'Final',
};

function teamLabel(name: string | null | undefined): string {
  return name ?? 'Por definir';
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
}

export function TournamentBracket({ matches, eliminationOnly = false }: Props) {
  // Filtrar solo partidos de eliminación
  const elimPhases = ['ROUND_OF_16', 'QUARTERFINAL', 'SEMIFINAL', 'THIRD_PLACE', 'FINAL'];
  const bracketMatches = eliminationOnly
    ? matches.filter(m => m.phase && elimPhases.includes(m.phase))
    : matches.filter(m => !m.phase || m.phase !== 'GROUP_STAGE');

  if (bracketMatches.length === 0) {
    return (
      <div className="bracket-empty">
        <Trophy size={32} strokeWidth={1.5} aria-hidden="true" className="empty-icon" />
        <p>El bracket aún no fue generado.</p>
        <style>{`.bracket-empty{display:flex;flex-direction:column;align-items:center;gap:.5rem;padding:2rem;color:var(--color-muted-foreground)}.empty-icon{opacity:.3}`}</style>
      </div>
    );
  }

  // Agrupar por ronda
  const byRound = new Map<number, TournamentFixtureMatch[]>();
  for (const m of bracketMatches) {
    const r = m.round;
    if (!byRound.has(r)) byRound.set(r, []);
    byRound.get(r)!.push(m);
  }
  const rounds = [...byRound.keys()].sort((a, b) => a - b);
  const maxRound = Math.max(...rounds);

  // Etiqueta de fase para el round
  function roundLabel(round: number): string {
    const ms = byRound.get(round) ?? [];
    const phase = ms[0]?.phase;
    if (phase) return PHASE_LABEL[phase] ?? `Ronda ${round}`;
    return `Ronda ${round}`;
  }

  return (
    <div className="bracket-wrap">
      <div className="bracket-scroll">
        {rounds.map(round => {
          const roundMatches = byRound.get(round) ?? [];
          const isFinal = round === maxRound;

          return (
            <div key={round} className={`bracket-col ${isFinal ? 'bracket-col--final' : ''}`}>
              <div className="bracket-round-label">{roundLabel(round)}</div>

              {roundMatches.map(match => {
                const played = match.status === 'COMPLETED';
                const homeWon = played && match.scoreHome !== null && match.scoreAway !== null && match.scoreHome > match.scoreAway;
                const awayWon = played && match.scoreHome !== null && match.scoreAway !== null && match.scoreAway > match.scoreHome;

                return (
                  <div key={match.id} className={`bracket-match ${match.isPast ? 'bracket-match--past' : ''} ${played ? 'bracket-match--played' : ''}`}>
                    {match.scheduledAt && (
                      <div className="bracket-date">
                        <Clock size={11} strokeWidth={2} aria-hidden="true" />
                        {formatDate(match.scheduledAt)}
                      </div>
                    )}
                    <div className={`bracket-team ${homeWon ? 'bracket-team--winner' : ''}`}>
                      <span className="bracket-team-name">{teamLabel(match.homeTeam?.name)}</span>
                      {played && <span className="bracket-score">{match.scoreHome ?? 0}</span>}
                    </div>
                    <div className="bracket-vs">vs</div>
                    <div className={`bracket-team ${awayWon ? 'bracket-team--winner' : ''}`}>
                      <span className="bracket-team-name">{teamLabel(match.awayTeam?.name)}</span>
                      {played && <span className="bracket-score">{match.scoreAway ?? 0}</span>}
                    </div>
                    {played && (
                      <div className="bracket-played">
                        <CheckCircle size={11} strokeWidth={2} aria-hidden="true" /> Jugado
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      <style>{`
        .bracket-wrap { width: 100%; overflow-x: auto; }
        .bracket-scroll { display: flex; gap: 1rem; padding: 0.5rem 0.25rem; min-width: max-content; }
        .bracket-col { display: flex; flex-direction: column; gap: 0.75rem; width: 180px; flex-shrink: 0; }
        .bracket-col--final .bracket-match { border-color: hsl(42 100% 40%); }
        .bracket-round-label {
          font-family: 'Barlow Condensed', sans-serif; font-size: 0.72rem; font-weight: 700;
          letter-spacing: 0.12em; text-transform: uppercase; color: hsl(42 100% 55%);
          margin-bottom: 0.25rem; text-align: center;
        }
        .bracket-match {
          background: var(--color-card); border: 1px solid var(--color-border);
          border-radius: 8px; padding: 0.55rem 0.65rem;
          display: flex; flex-direction: column; gap: 0.25rem;
          transition: border-color 0.15s;
        }
        .bracket-match--played { border-color: hsl(140 50% 25%); }
        .bracket-match--past { opacity: 0.55; filter: grayscale(0.4); }
        .bracket-date {
          display: flex; align-items: center; gap: 0.3rem;
          font-size: 0.68rem; color: var(--color-muted-foreground); margin-bottom: 0.15rem;
        }
        .bracket-team {
          display: flex; align-items: center; justify-content: space-between;
          font-size: 0.82rem; color: var(--color-foreground); gap: 0.4rem;
        }
        .bracket-team--winner { color: hsl(140 70% 50%); font-weight: 700; }
        .bracket-team-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .bracket-score { font-family: 'Bebas Neue', sans-serif; font-size: 1rem; line-height: 1; flex-shrink: 0; }
        .bracket-vs { font-size: 0.68rem; color: var(--color-muted-foreground); text-align: center; }
        .bracket-played {
          display: flex; align-items: center; gap: 0.25rem;
          font-size: 0.68rem; color: hsl(140 70% 50%); margin-top: 0.1rem;
        }

        /* Tema claro */
        :global(html.light) .bracket-round-label { color: hsl(35 100% 35%); }
        :global(html.light) .bracket-match--played { border-color: hsl(140 50% 65%); }
      `}</style>
    </div>
  );
}
