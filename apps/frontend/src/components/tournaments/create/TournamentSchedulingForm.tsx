/**
 * TournamentSchedulingForm — formulario de scheduling por fecha (auto-schedule).
 *
 * Decision Context:
 * - Issue #132 T2/T3: permite al usuario fijar firstMatchday + cadenceDays para que
 *   el backend calcule automáticamente las fechas de todas las jornadas.
 * - T4: las fechas pasadas en el preview se muestran en gris atenuado.
 * - La query schedulePreview se llama al cambiar los datos para mostrar el calendario
 *   antes de confirmar (sin escribir a DB).
 * - durationMode: single_day usa solo un día; multi_day usa cadencia.
 * - Previously fixed bugs: none relevant.
 */

import { useState, useEffect } from 'react';
import { Calendar, RefreshCw, TriangleAlert } from 'lucide-react';
import type {
  TournamentType, DurationMode, SchedulePreviewDay, SchedulePreviewInput,
} from '../../../graphql/operations/tournaments';
import { SCHEDULE_PREVIEW } from '../../../graphql/operations/tournaments';

interface Props {
  tournamentType: TournamentType;
  teamCount: number;
  groupCount?: number;
  teamsPerGroup?: number;
  value: { durationMode: DurationMode; firstMatchday: string; cadenceDays: number };
  onChange: (v: { durationMode: DurationMode; firstMatchday: string; cadenceDays: number }) => void;
}

async function fetchPreview(input: SchedulePreviewInput): Promise<SchedulePreviewDay[]> {
  try {
    const res = await fetch('/api/graphql-auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: SCHEDULE_PREVIEW, variables: { input } }),
    });
    const json = await res.json() as { data?: { schedulePreview: SchedulePreviewDay[] } };
    return json.data?.schedulePreview ?? [];
  } catch { return []; }
}

const today = new Date().toISOString().slice(0, 10);

function formatPreviewDate(iso: string): string {
  return new Date(iso + 'T12:00:00Z').toLocaleDateString('es-AR', {
    weekday: 'short', day: 'numeric', month: 'short',
  });
}

export function TournamentSchedulingForm({ tournamentType, teamCount, groupCount, teamsPerGroup, value, onChange }: Props) {
  const [preview, setPreview] = useState<SchedulePreviewDay[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const { durationMode, firstMatchday, cadenceDays } = value;
  const isSingleDay = durationMode === 'SINGLE_DAY';

  async function loadPreview() {
    if (!firstMatchday) return;
    setLoadingPreview(true);
    const days = await fetchPreview({
      tournamentType,
      teamCount,
      firstMatchday,
      cadenceDays: isSingleDay ? 0 : cadenceDays,
      durationMode,
      groupCount,
      teamsPerGroup,
    });
    setPreview(days);
    setLoadingPreview(false);
  }

  useEffect(() => { if (firstMatchday) loadPreview(); }, [firstMatchday, cadenceDays, durationMode]);

  const hasPastWarning = preview.some(d => d.isPast);

  return (
    <div className="scheduling-form">

      {/* Modo de duración */}
      <div className="field-group">
        <label className="field-label">Modo de duración</label>
        <div className="mode-toggle">
          {(['SINGLE_DAY', 'MULTI_DAY'] as DurationMode[]).map(m => (
            <button key={m} type="button"
              onClick={() => onChange({ ...value, durationMode: m })}
              className={`mode-btn ${durationMode === m ? 'mode-btn--active' : ''}`}
            >
              {m === 'SINGLE_DAY' ? 'Un solo día' : 'Varios días'}
            </button>
          ))}
        </div>
      </div>

      {/* Primera jornada */}
      <div className="field-group">
        <label className="field-label" htmlFor="first-matchday">
          {isSingleDay ? 'Fecha del torneo' : 'Primera jornada'}
        </label>
        <input
          id="first-matchday" type="date"
          className="field-input"
          min={today}
          value={firstMatchday}
          onChange={e => onChange({ ...value, firstMatchday: e.target.value })}
        />
      </div>

      {/* Cadencia (solo multi_day) */}
      {!isSingleDay && (
        <div className="field-group">
          <label className="field-label" htmlFor="cadence-days">
            Cada cuántos días (cadencia)
          </label>
          <div className="cadence-wrap">
            <input
              id="cadence-days" type="number"
              className="field-input cadence-input"
              min={1} max={60}
              value={cadenceDays}
              onChange={e => onChange({ ...value, cadenceDays: Math.max(1, parseInt(e.target.value) || 7) })}
            />
            <span className="cadence-unit">días entre jornadas</span>
          </div>
        </div>
      )}

      {/* Preview de calendario */}
      {firstMatchday && (
        <div className="preview-section">
          <div className="preview-header">
            <Calendar size={14} strokeWidth={2} aria-hidden="true" />
            <span>Preview del calendario</span>
            {loadingPreview && <RefreshCw size={12} strokeWidth={2} aria-hidden="true" className="spin" />}
          </div>

          {hasPastWarning && (
            <div className="past-warning">
              <TriangleAlert size={14} strokeWidth={2} aria-hidden="true" />
              Algunas jornadas caen en fechas pasadas.
            </div>
          )}

          {preview.length > 0 && (
            <ul className="preview-list">
              {preview.map(d => (
                <li key={d.matchday} className={`preview-day ${d.isPast ? 'preview-day--past' : ''}`}>
                  <span className="preview-matchday">J{d.matchday}</span>
                  <span className="preview-date">{formatPreviewDate(d.date)}</span>
                  <span className="preview-count">{d.matchCount} {d.matchCount === 1 ? 'partido' : 'partidos'}</span>
                  {d.isPast && <span className="preview-past-badge">Pasado</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <style>{`
        .scheduling-form { display: flex; flex-direction: column; gap: 1rem; }
        .field-group { display: flex; flex-direction: column; gap: 0.4rem; }
        .field-label { font-size: 0.82rem; font-weight: 600; color: var(--color-muted-foreground); }
        .field-input {
          background: var(--color-input); border: 1px solid var(--color-border);
          color: var(--color-foreground); border-radius: 8px; padding: 0.55rem 0.75rem;
          font-size: 0.875rem; outline: none; transition: border-color 0.15s;
        }
        .field-input:focus { border-color: var(--color-primary); }
        .mode-toggle { display: flex; gap: 0.4rem; }
        .mode-btn {
          flex: 1; padding: 0.45rem 0; border-radius: 8px; border: 1px solid var(--color-border);
          background: var(--color-card); color: var(--color-muted-foreground);
          font-size: 0.82rem; cursor: pointer; transition: all 0.12s;
        }
        .mode-btn--active { background: rgba(246,164,0,0.1); border-color: hsl(35 100% 50%); color: hsl(42 100% 62%); font-weight: 600; }
        .cadence-wrap { display: flex; align-items: center; gap: 0.5rem; }
        .cadence-input { width: 80px; }
        .cadence-unit { font-size: 0.82rem; color: var(--color-muted-foreground); }
        .preview-section { background: var(--color-card); border: 1px solid var(--color-border); border-radius: 10px; padding: 0.875rem; display: flex; flex-direction: column; gap: 0.6rem; }
        .preview-header { display: flex; align-items: center; gap: 0.4rem; font-size: 0.8rem; font-weight: 600; color: var(--color-muted-foreground); }
        .past-warning { display: flex; align-items: center; gap: 0.4rem; background: hsl(35 80% 15%); border: 1px solid hsl(35 80% 35%); color: hsl(35 100% 60%); border-radius: 6px; padding: 0.5rem 0.65rem; font-size: 0.8rem; }
        .preview-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.3rem; }
        .preview-day { display: flex; align-items: center; gap: 0.6rem; font-size: 0.8rem; padding: 0.3rem 0; }
        .preview-day--past { opacity: 0.5; filter: grayscale(0.6); }
        .preview-matchday { font-family: 'Barlow Condensed', sans-serif; font-weight: 700; color: hsl(42 100% 55%); min-width: 22px; }
        .preview-date { flex: 1; color: var(--color-foreground); }
        .preview-count { color: var(--color-muted-foreground); }
        .preview-past-badge { font-size: 0.65rem; font-weight: 700; background: hsl(220 20% 20%); color: hsl(215 20% 55%); padding: 0.1rem 0.35rem; border-radius: 4px; }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        :global(html.light) .mode-btn { background: hsl(0 0% 100%); border-color: hsl(220 13% 88%); color: hsl(220 16% 42%); }
        :global(html.light) .mode-btn--active { background: hsl(35 100% 94%); border-color: hsl(35 80% 55%); color: hsl(35 100% 30%); }
        :global(html.light) .preview-section { background: hsl(0 0% 100%); border-color: hsl(220 13% 88%); }
        :global(html.light) .past-warning { background: hsl(35 80% 95%); border-color: hsl(35 80% 65%); color: hsl(35 100% 32%); }
      `}</style>
    </div>
  );
}
