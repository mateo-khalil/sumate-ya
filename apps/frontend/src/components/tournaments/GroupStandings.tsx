/**
 * GroupStandings — tabla de posiciones por grupo para group_stage_elimination.
 *
 * Decision Context:
 * - Issue #132 T1: calcula standings a partir de los fixtureMatches con phase='GROUP_STAGE'.
 * - Los resultados se calculan client-side desde scoreHome/scoreAway. Si el partido
 *   no fue jugado (COMPLETED), el equipo aparece en la tabla con 0s.
 * - advancingPerGroup equipos con más puntos se resaltan en verde.
 * - Desempate: 1° puntos, 2° diferencia de gol, 3° goles a favor.
 * - Previously fixed bugs: none relevant.
 */

import { Users } from 'lucide-react';
import type { TournamentFixtureMatch, TournamentTeam } from '../../graphql/operations/tournaments';

interface Props {
  matches: TournamentFixtureMatch[];
  teams: TournamentTeam[];
  advancingPerGroup?: number | null;
}

interface StandingRow {
  teamId: string;
  teamName: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  pts: number;
}

function calcStandings(
  groupName: string,
  matches: TournamentFixtureMatch[],
  teams: TournamentTeam[],
): StandingRow[] {
  const rows = new Map<string, StandingRow>();

  // Inicializar con equipos que aparecen en los partidos del grupo
  for (const m of matches) {
    if (m.homeTeam && !rows.has(m.homeTeam.id)) {
      rows.set(m.homeTeam.id, { teamId: m.homeTeam.id, teamName: m.homeTeam.name, played:0,won:0,drawn:0,lost:0,gf:0,ga:0,pts:0 });
    }
    if (m.awayTeam && !rows.has(m.awayTeam.id)) {
      rows.set(m.awayTeam.id, { teamId: m.awayTeam.id, teamName: m.awayTeam.name, played:0,won:0,drawn:0,lost:0,gf:0,ga:0,pts:0 });
    }
  }

  // Calcular resultados
  for (const m of matches) {
    if (m.status !== 'COMPLETED' || m.scoreHome == null || m.scoreAway == null) continue;
    const home = m.homeTeam ? rows.get(m.homeTeam.id) : null;
    const away = m.awayTeam ? rows.get(m.awayTeam.id) : null;
    if (!home || !away) continue;

    home.played++; away.played++;
    home.gf += m.scoreHome; home.ga += m.scoreAway;
    away.gf += m.scoreAway; away.ga += m.scoreHome;

    if (m.scoreHome > m.scoreAway) {
      home.won++; home.pts += 3; away.lost++;
    } else if (m.scoreHome < m.scoreAway) {
      away.won++; away.pts += 3; home.lost++;
    } else {
      home.drawn++; away.drawn++; home.pts++; away.pts++;
    }
  }

  void groupName; void teams; // suppress unused

  return [...rows.values()].sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    const gdA = a.gf - a.ga, gdB = b.gf - b.ga;
    if (gdB !== gdA) return gdB - gdA;
    return b.gf - a.gf;
  });
}

export function GroupStandings({ matches, teams, advancingPerGroup }: Props) {
  // Agrupar partidos por groupName
  const groupMatches = matches.filter(m => m.phase === 'GROUP_STAGE' && m.groupName);
  const groupNames = [...new Set(groupMatches.map(m => m.groupName!))].sort();

  if (groupNames.length === 0) {
    return (
      <div className="standings-empty">
        <Users size={28} strokeWidth={1.5} aria-hidden="true" style={{ opacity: 0.3 }} />
        <p>Los grupos aún no fueron generados.</p>
        <style>{`.standings-empty{display:flex;flex-direction:column;align-items:center;gap:.5rem;padding:2rem;color:var(--color-muted-foreground);font-size:.875rem}`}</style>
      </div>
    );
  }

  const advancing = advancingPerGroup ?? 2;

  return (
    <div className="standings-wrap">
      {groupNames.map(groupName => {
        const gMatches = groupMatches.filter(m => m.groupName === groupName);
        const rows = calcStandings(groupName, gMatches, teams);

        return (
          <div key={groupName} className="group-block">
            <h3 className="group-title">Grupo {groupName}</h3>
            <div className="standings-table-wrap">
              <table className="standings-table" aria-label={`Posiciones Grupo ${groupName}`}>
                <thead>
                  <tr>
                    <th className="col-pos">#</th>
                    <th className="col-team">Equipo</th>
                    <th title="Partidos Jugados">PJ</th>
                    <th title="Ganados">PG</th>
                    <th title="Empatados">PE</th>
                    <th title="Perdidos">PP</th>
                    <th title="Goles a Favor">GF</th>
                    <th title="Goles en Contra">GC</th>
                    <th title="Diferencia de Gol">DG</th>
                    <th title="Puntos">Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => {
                    const advances = idx < advancing;
                    return (
                      <tr key={row.teamId} className={advances ? 'row--advances' : ''}>
                        <td className="col-pos">{idx + 1}</td>
                        <td className="col-team">
                          {advances && <span className="advance-dot" aria-label="Clasifica" />}
                          {row.teamName}
                        </td>
                        <td>{row.played}</td>
                        <td>{row.won}</td>
                        <td>{row.drawn}</td>
                        <td>{row.lost}</td>
                        <td>{row.gf}</td>
                        <td>{row.ga}</td>
                        <td className={row.gf - row.ga > 0 ? 'td-pos' : row.gf - row.ga < 0 ? 'td-neg' : ''}>
                          {row.gf - row.ga > 0 ? '+' : ''}{row.gf - row.ga}
                        </td>
                        <td className="col-pts">{row.pts}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="group-note">
              <span className="advance-dot" /> Clasifican los {advancing} primeros
            </p>
          </div>
        );
      })}

      <style>{`
        .standings-wrap { display: flex; flex-direction: column; gap: 1.5rem; }
        .group-block { display: flex; flex-direction: column; gap: 0.5rem; }
        .group-title {
          font-family: 'Bebas Neue', sans-serif; font-size: 1.2rem;
          color: hsl(42 100% 58%); margin: 0; letter-spacing: 0.04em;
        }
        .standings-table-wrap { overflow-x: auto; }
        .standings-table {
          width: 100%; border-collapse: collapse;
          font-size: 0.82rem; background: var(--color-card);
          border: 1px solid var(--color-border); border-radius: 8px; overflow: hidden;
        }
        .standings-table th, .standings-table td {
          padding: 0.5rem 0.6rem; text-align: center;
          border-bottom: 1px solid var(--color-border);
          color: var(--color-foreground);
        }
        .standings-table th { font-family: 'Barlow Condensed', sans-serif; font-weight: 700; letter-spacing: 0.05em; color: var(--color-muted-foreground); font-size: 0.75rem; text-transform: uppercase; background: var(--color-muted); }
        .standings-table tbody tr:last-child td { border-bottom: none; }
        .col-pos { width: 28px; }
        .col-team { text-align: left !important; min-width: 120px; display: flex; align-items: center; gap: 0.4rem; }
        .col-pts { font-weight: 700; color: var(--color-foreground) !important; }
        .td-pos { color: hsl(140 70% 50%) !important; font-weight: 600; }
        .td-neg { color: hsl(0 72% 55%) !important; }
        .row--advances td { background: rgba(34,197,94,0.06); }
        .advance-dot { width: 8px; height: 8px; border-radius: 50%; background: hsl(140 70% 50%); display: inline-block; flex-shrink: 0; }
        .group-note { font-size: 0.75rem; color: var(--color-muted-foreground); margin: 0.25rem 0 0; display: flex; align-items: center; gap: 0.4rem; }

        :global(html.light) .standings-table th { background: hsl(210 40% 95%); }
        :global(html.light) .row--advances td { background: hsl(140 60% 96%); }
      `}</style>
    </div>
  );
}
