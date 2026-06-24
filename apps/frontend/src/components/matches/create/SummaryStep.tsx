/**
 * SummaryStep — Step 4+5 of the create-match wizard (title + description + confirm)
 * Shows an editable title field (auto-generated from format/club/date), an optional
 * description textarea, a full summary of selections, and the "Crear partido" button
 * that fires the createMatch mutation.
 *
 * Decision Context:
 * - Title field: auto-generated as "Partido {format} · {club} · {weekday} {day} {month}" so
 *   the organizer doesn't need to type anything to get a useful name, but can freely edit it.
 *   The generated value is computed once on mount (useMemo) and seeded into the input's
 *   defaultValue; controlled with useState so the user can clear/re-type freely.
 * - Title validation: required (trim length > 0), max 80 chars to keep match cards readable.
 * - Description is optional (max 500 chars). The character counter gives live feedback.
 * - The mutation is fired via plain fetch to avoid adding urql to this component's scope.
 *   The Authorization header is NOT included here — the Astro proxy route reads the
 *   HttpOnly cookie server-side. We POST to the same GraphQL endpoint the browser uses.
 * - On success the component calls onSuccess(matchId) so the parent Astro page can do
 *   the final redirect to /partidos/[id]. Using onSuccess instead of window.location here
 *   keeps the component testable.
 * - Error display: backend validation errors are shown inline (Spanish messages from the
 *   service layer). Network errors get a generic fallback.
 * - Backward compat: old matches that only have `description` (no `title`) are handled
 *   in matchService.ts with COALESCE(title, description, 'Partido sin título').
 * - Previously fixed bugs: none relevant.
 */

import { useState, useMemo } from 'react';
import { CREATE_MATCH, type ClubDetail, type ClubSlot, type MatchFormat, type CreateMatchResult } from '../../../graphql/operations/matches';

const FORMAT_LABEL: Record<MatchFormat, string> = {
  FIVE_VS_FIVE: '5v5',
  SEVEN_VS_SEVEN: '7v7',
  TEN_VS_TEN: '10v10',
  ELEVEN_VS_ELEVEN: '11v11',
};

function generateDefaultTitle(club: ClubDetail, format: MatchFormat, date: string): string {
  const formatLabel = FORMAT_LABEL[format];
  const d = new Date(`${date}T12:00:00`);
  const dateStr = d.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' });
  return `Partido ${formatLabel} · ${club.name} · ${dateStr}`;
}

interface Props {
  club: ClubDetail;
  slot: ClubSlot;
  date: string;
  format: MatchFormat;
  capacity: number;
  onSuccess: (matchId: string) => void;
}

export default function SummaryStep({ club, slot, date, format, capacity, onSuccess }: Props) {
  const defaultTitle = useMemo(() => generateDefaultTitle(club, format, date), [club, format, date]);
  const [title, setTitle] = useState(defaultTitle);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const titleLen = title.length;
  const titleTrimmed = title.trim();
  const titleInvalid = titleTrimmed.length === 0 || titleLen > 80;

  const descLen = description.length;
  const descOver = descLen > 500;

  async function handleSubmit() {
    if (titleInvalid || descOver) return;
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch('/api/matches/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          query: CREATE_MATCH,
          variables: {
            input: {
              clubId: club.id,
              slotId: slot.id,
              courtId: slot.court.id,
              date,
              format,
              capacity,
              title: titleTrimmed,
              description: description.trim() || undefined,
            },
          },
        }),
      });

      const json = (await res.json()) as {
        data?: { createMatch: CreateMatchResult };
        errors?: { message: string }[];
      };

      if (json.errors?.length) {
        setError(json.errors[0].message);
        return;
      }

      const result = json.data?.createMatch;
      if (!result?.success || !result.matchId) {
        setError(result?.message ?? 'Error al crear el partido. Intentá de nuevo.');
        return;
      }

      onSuccess(result.matchId);
    } catch {
      setError('Error de red. Revisá tu conexión e intentá de nuevo.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="summary-step">
      {/* Title */}
      <div className="field-group">
        <label className="step-label" htmlFor="match-title">
          Título del partido
        </label>
        <input
          id="match-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ej. Partido 5v5 · Club Nacional · sáb 28 jun"
          maxLength={90}
          className={`title-input${titleInvalid && titleLen > 0 ? ' title-input--over' : ''}`}
        />
        <div className="field-footer">
          <span className="field-hint">Podés editarlo como quieras</span>
          <span className={`char-count${titleLen > 80 ? ' char-count--over' : ''}`}>
            {titleLen}/80
          </span>
        </div>
      </div>

      {/* Description */}
      <div className="field-group">
        <label className="step-label" htmlFor="description">
          Descripción <span className="optional">(opcional)</span>
        </label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Partido amistoso, nivel intermedio…"
          maxLength={520}
          rows={3}
          className={`desc-area${descOver ? ' desc-area--over' : ''}`}
        />
        <span className={`char-count${descOver ? ' char-count--over' : ''}`}>
          {descLen}/500
        </span>
      </div>

      {/* Summary card */}
      <div className="summary-card">
        <h3 className="summary-title">Resumen del partido</h3>
        <dl className="summary-list">
          <dt>Título</dt>
          <dd>{titleTrimmed || <span className="summary-placeholder">Sin título</span>}</dd>
          <dt>Club</dt>
          <dd>{club.name} <span className="summary-sub">— {club.zone}</span></dd>
          <dt>Cancha</dt>
          <dd>{slot.court.name}</dd>
          <dt>Fecha</dt>
          <dd>{new Date(`${date}T12:00:00`).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}</dd>
          <dt>Horario</dt>
          <dd>{slot.startTime.slice(0, 5)} – {slot.endTime.slice(0, 5)}</dd>
          <dt>Formato</dt>
          <dd>{FORMAT_LABEL[format]}</dd>
          <dt>Capacidad</dt>
          <dd>{capacity} jugadores</dd>
          {description.trim() && (
            <>
              <dt>Descripción</dt>
              <dd>{description.trim()}</dd>
            </>
          )}
        </dl>
      </div>

      {/* Error */}
      {error && (
        <p className="error-msg" role="alert">{error}</p>
      )}

      {/* Submit */}
      <button
        type="button"
        className="submit-btn"
        onClick={handleSubmit}
        disabled={submitting || titleInvalid || descOver}
      >
        {submitting ? 'Creando partido…' : 'Crear partido'}
      </button>

      <style>{`
        .summary-step { display: flex; flex-direction: column; gap: 1.25rem; }
        .field-group { display: flex; flex-direction: column; gap: 0.4rem; }
        .step-label {
          font-family: 'Barlow Condensed', sans-serif; font-size: 0.75rem;
          font-weight: 700; letter-spacing: 0.15em; text-transform: uppercase;
          color: hsl(35 100% 55%);
        }
        .optional { color: hsl(215 20% 50%); font-weight: 400; text-transform: none; font-size: 0.7rem; }
        .title-input {
          background: hsl(220 30% 16%); border: 1px solid rgba(255,255,255,0.1);
          border-radius: 6px; color: hsl(210 20% 94%); font-size: 0.9rem;
          font-family: 'Barlow', sans-serif; padding: 0.625rem 0.875rem;
          transition: border-color 0.15s; width: 100%; box-sizing: border-box;
        }
        .title-input:focus { outline: none; border-color: hsl(35 100% 48%); }
        .title-input--over { border-color: hsl(0 72% 51%); }
        .field-footer { display: flex; justify-content: space-between; align-items: center; }
        .field-hint { font-family: 'Barlow', sans-serif; font-size: 0.72rem; color: hsl(215 20% 40%); }
        .desc-area {
          background: hsl(220 30% 16%); border: 1px solid rgba(255,255,255,0.1);
          border-radius: 6px; color: hsl(210 20% 94%); font-size: 0.9rem;
          font-family: 'Barlow', sans-serif; padding: 0.625rem 0.875rem;
          resize: vertical; min-height: 80px; transition: border-color 0.15s;
        }
        .desc-area:focus { outline: none; border-color: hsl(35 100% 48%); }
        .desc-area--over { border-color: hsl(0 72% 51%); }
        .char-count { font-family: 'Barlow', sans-serif; font-size: 0.72rem; color: hsl(215 20% 45%); align-self: flex-end; }
        .char-count--over { color: hsl(0 72% 65%); }
        .summary-card {
          background: hsl(220 55% 11%); border: 1px solid rgba(255,255,255,0.07);
          border-radius: 0.75rem; padding: 1.25rem;
        }
        .summary-title {
          font-family: 'Bebas Neue', sans-serif; font-size: 1.2rem;
          letter-spacing: 0.05em; color: #fff; margin: 0 0 1rem;
        }
        .summary-list { display: grid; grid-template-columns: auto 1fr; gap: 0.4rem 1rem; margin: 0; }
        .summary-list dt {
          font-family: 'Barlow Condensed', sans-serif; font-size: 0.72rem;
          font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase;
          color: hsl(215 20% 50%); align-self: start; padding-top: 0.1rem;
        }
        .summary-list dd {
          font-family: 'Barlow', sans-serif; font-size: 0.875rem;
          color: hsl(210 20% 90%); margin: 0;
        }
        .summary-sub { color: hsl(215 20% 55%); font-size: 0.8rem; }
        .summary-placeholder { color: hsl(215 20% 40%); font-style: italic; }
        .error-msg {
          font-family: 'Barlow', sans-serif; font-size: 0.875rem;
          color: hsl(0 72% 70%); background: hsl(0 72% 51% / 0.1);
          border: 1px solid hsl(0 72% 51% / 0.25); border-radius: 6px;
          padding: 0.625rem 0.875rem; margin: 0;
        }
        .submit-btn {
          padding: 0.875rem 1.5rem;
          background: hsl(35 100% 48%); color: hsl(220 72% 7%);
          border: none; border-radius: 8px; cursor: pointer;
          font-family: 'Barlow Condensed', sans-serif; font-size: 1rem;
          font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase;
          transition: background 0.15s, opacity 0.15s;
          align-self: stretch;
        }
        .submit-btn:hover:not(:disabled) { background: hsl(35 100% 55%); }
        .submit-btn:disabled { opacity: 0.45; cursor: not-allowed; }
      `}</style>
    </div>
  );
}
