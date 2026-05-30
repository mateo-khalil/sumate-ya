/**
 * AvailabilityHeatmap — vista del capitán de disponibilidad agregada del equipo.
 *
 * Decision Context:
 * - Fetcha TEAM_AVAILABILITY_MATRIX y renderiza un grid día × hora.
 * - Los días son columnas (Lun-Dom) y las horas son filas, con sólo las que
 *   aparecen en los datos (evita mostrar filas vacías de las 00:00-08:00).
 * - El color de cada celda refleja la densidad relativa: de rojo (pocos) a verde (todos).
 * - Click en celda muestra la lista de jugadores disponibles en ese slot.
 * - memberCount se usa para calcular el porcentaje y elegir el color.
 * - Previously fixed bugs: none relevant.
 */

import { useState, useEffect } from 'react';
import { Users, Loader2, TriangleAlert } from 'lucide-react';
import type { AvailabilityMatrixCell } from '../../graphql/operations/teams';
import { TEAM_AVAILABILITY_MATRIX } from '../../graphql/operations/teams';

interface Props {
  teamId: string;
  memberCount: number;
}

const DAYS = [
  { v: 1, short: 'Lun' }, { v: 2, short: 'Mar' },
  { v: 3, short: 'Mié' }, { v: 4, short: 'Jue' },
  { v: 5, short: 'Vie' }, { v: 6, short: 'Sáb' },
  { v: 0, short: 'Dom' },
];

async function gqlAuthPost<T>(query: string, variables?: Record<string, unknown>): Promise<{ data?: T; error?: string }> {
  try {
    const res = await fetch('/api/graphql-auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    });
    const json = await res.json() as { data?: T; errors?: { message: string }[] };
    if (json.errors?.length) return { error: json.errors[0].message };
    return { data: json.data };
  } catch {
    return { error: 'Error de red' };
  }
}

function cellColor(count: number, total: number): string {
  if (count === 0) return 'hsl(220 20% 11%)';
  const pct = count / Math.max(total, 1);
  if (pct <= 0.25) return 'hsl(0 65% 28%)';
  if (pct <= 0.50) return 'hsl(20 75% 30%)';
  if (pct <= 0.75) return 'hsl(45 80% 28%)';
  return 'hsl(140 60% 25%)';
}

function cellTextColor(count: number, total: number): string {
  if (count === 0) return 'hsl(220 15% 35%)';
  const pct = count / Math.max(total, 1);
  if (pct <= 0.25) return 'hsl(0 80% 65%)';
  if (pct <= 0.50) return 'hsl(20 90% 65%)';
  if (pct <= 0.75) return 'hsl(45 90% 60%)';
  return 'hsl(140 70% 55%)';
}

export function AvailabilityHeatmap({ teamId, memberCount }: Props) {
  const [matrix, setMatrix] = useState<AvailabilityMatrixCell[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCell, setActiveCell] = useState<string | null>(null);

  useEffect(() => {
    gqlAuthPost<{ teamAvailabilityMatrix: AvailabilityMatrixCell[] }>(
      TEAM_AVAILABILITY_MATRIX, { teamId }
    ).then(({ data, error: err }) => {
      if (err) setError(err);
      else setMatrix(data?.teamAvailabilityMatrix ?? []);
      setLoading(false);
    });
  }, [teamId]);

  if (loading) return (
    <div className="heatmap-loading">
      <Loader2 size={20} strokeWidth={2} aria-hidden="true" className="spin" />
      <span>Cargando disponibilidad del equipo...</span>
    </div>
  );

  if (error) return (
    <div className="heatmap-error">
      <TriangleAlert size={16} strokeWidth={2} aria-hidden="true" /> {error}
    </div>
  );

  if (matrix.length === 0) return (
    <div className="heatmap-empty">
      <Users size={32} strokeWidth={1.5} aria-hidden="true" className="empty-icon" />
      <p>Ningún miembro configuró disponibilidad todavía.</p>
      <p className="empty-sub">Los jugadores pueden hacerlo en el tab "Disponibilidad".</p>
    </div>
  );

  // Normalizar tiempos únicos (filas) y días presentes (columnas)
  const uniqueTimes = [...new Set(matrix.map(c => c.startTime))].sort();

  // Lookup: dayOfWeek → startTime → cell
  const lookup = new Map<string, AvailabilityMatrixCell>();
  matrix.forEach(c => lookup.set(`${c.dayOfWeek}:${c.startTime}`, c));

  function cellKey(day: number, time: string) { return `${day}:${time}`; }
  function toggleCell(key: string) { setActiveCell(prev => prev === key ? null : key); }

  return (
    <div className="heatmap-wrap">
      <div className="heatmap-header">
        <Users size={15} strokeWidth={2} aria-hidden="true" />
        <span>Disponibilidad del equipo — {memberCount} {memberCount === 1 ? 'miembro' : 'miembros'}</span>
      </div>

      {/* Leyenda */}
      <div className="legend">
        <span className="legend-item"><span className="legend-dot" style={{ background: 'hsl(0 65% 28%)' }} />Pocos</span>
        <span className="legend-item"><span className="legend-dot" style={{ background: 'hsl(20 75% 30%)' }} />Algunos</span>
        <span className="legend-item"><span className="legend-dot" style={{ background: 'hsl(45 80% 28%)' }} />Varios</span>
        <span className="legend-item"><span className="legend-dot" style={{ background: 'hsl(140 60% 25%)' }} />Mayoría</span>
      </div>

      {/* Grid */}
      <div className="heatmap-scroll">
        <table className="heatmap-table" aria-label="Disponibilidad horaria del equipo">
          <thead>
            <tr>
              <th className="time-col" />
              {DAYS.map(d => <th key={d.v} className="day-header">{d.short}</th>)}
            </tr>
          </thead>
          <tbody>
            {uniqueTimes.map(time => (
              <tr key={time}>
                <td className="time-label">{time}</td>
                {DAYS.map(day => {
                  const key = cellKey(day.v, time);
                  const cell = lookup.get(key);
                  const count = cell?.availableCount ?? 0;
                  const isActive = activeCell === key;

                  return (
                    <td key={day.v} className="heatmap-cell-wrap">
                      <button
                        className={`heatmap-cell ${count === 0 ? 'heatmap-cell--empty' : ''} ${isActive ? 'heatmap-cell--active' : ''}`}
                        style={{ background: cellColor(count, memberCount), color: cellTextColor(count, memberCount) }}
                        onClick={() => count > 0 && toggleCell(key)}
                        aria-label={`${day.short} ${time}: ${count} jugadores disponibles`}
                        disabled={count === 0}
                      >
                        {count > 0 ? count : ''}
                      </button>

                      {/* Popup de jugadores */}
                      {isActive && cell && (
                        <div className="cell-popup" role="tooltip">
                          <p className="popup-title">{day.short} {time}</p>
                          <ul className="popup-players">
                            {cell.availablePlayers.map(p => (
                              <li key={p.id} className="popup-player">
                                {p.avatarUrl
                                  ? <img src={p.avatarUrl} alt={p.displayName} className="popup-avatar" />
                                  : <span className="popup-initial">{p.displayName[0]}</span>
                                }
                                <span>{p.displayName}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <style>{`
        .heatmap-wrap { display: flex; flex-direction: column; gap: 0.75rem; }
        .heatmap-loading, .heatmap-error { display: flex; align-items: center; gap: .6rem; color: var(--color-muted-foreground); padding: 1rem 0; font-size: .875rem; }
        .heatmap-empty { display: flex; flex-direction: column; align-items: center; gap: .5rem; padding: 2.5rem 1rem; color: var(--color-muted-foreground); text-align: center; }
        .empty-icon { opacity: .3; }
        .heatmap-empty p { margin: 0; }
        .empty-sub { font-size: .8rem; }
        .heatmap-header { display: flex; align-items: center; gap: .45rem; font-size: .85rem; font-weight: 600; color: var(--color-foreground); }
        .legend { display: flex; gap: .85rem; flex-wrap: wrap; }
        .legend-item { display: flex; align-items: center; gap: .35rem; font-size: .75rem; color: var(--color-muted-foreground); }
        .legend-dot { width: 12px; height: 12px; border-radius: 3px; display: inline-block; }
        .heatmap-scroll { overflow-x: auto; }
        .heatmap-table { border-collapse: collapse; min-width: 300px; }
        .time-col { width: 48px; }
        .day-header { text-align: center; font-size: .75rem; font-weight: 600; color: var(--color-muted-foreground); padding: 0 .25rem .4rem; width: 44px; }
        .time-label { font-size: .72rem; color: var(--color-muted-foreground); padding-right: .5rem; white-space: nowrap; text-align: right; vertical-align: middle; }
        .heatmap-cell-wrap { position: relative; padding: 2px; }
        .heatmap-cell {
          width: 38px; height: 32px; border-radius: 5px; border: none; cursor: pointer;
          font-size: .8rem; font-weight: 700; display: flex; align-items: center; justify-content: center;
          transition: transform .1s, outline .1s; outline: 2px solid transparent;
        }
        .heatmap-cell:hover:not(:disabled) { transform: scale(1.1); }
        .heatmap-cell--active { outline-color: var(--color-primary); transform: scale(1.1); }
        .heatmap-cell--empty { cursor: default; }
        .cell-popup {
          position: absolute; z-index: 10; top: 100%; left: 50%; transform: translateX(-50%);
          background: var(--color-card); border: 1px solid var(--color-border);
          border-radius: 8px; padding: .6rem .8rem; box-shadow: 0 8px 24px rgba(0,0,0,.4);
          min-width: 140px; white-space: nowrap;
        }
        .popup-title { font-size: .75rem; font-weight: 700; color: var(--color-muted-foreground); margin: 0 0 .4rem; }
        .popup-players { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: .3rem; }
        .popup-player { display: flex; align-items: center; gap: .45rem; font-size: .8rem; }
        .popup-avatar { width: 22px; height: 22px; border-radius: 50%; object-fit: cover; }
        .popup-initial { width: 22px; height: 22px; border-radius: 50%; background: var(--color-muted); display: flex; align-items: center; justify-content: center; font-size: .65rem; font-weight: 700; color: var(--color-muted-foreground); }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
