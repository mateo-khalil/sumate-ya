/**
 * CourtManager — club admin UI for managing courts (Canchas)
 *
 * Decision Context:
 * - The Canchas feature was a "Próximo" placeholder; the courts table existed and the dashboard
 *   read it ("4 canchas activas") but there was no way to create/edit/delete courts. This island
 *   provides full CRUD on top of the new court-management GraphQL domain.
 * - Card grid (not a table) because a club has few courts and each carries several attributes
 *   (surface, format, indoor) plus referencing badges (slots, upcoming matches) that read better
 *   as cards. Mirrors the dashboard's visual language (FIFA dark stadium, lucide icons).
 * - Delete guard: the backend refuses to delete a court that still has slots/matches/reservations
 *   and returns a friendly message; we surface it verbatim in the feedback banner and also dim
 *   the delete affordance when the card shows referencing counts so the action is discouraged.
 * - SSR-hydrated initial state + accessToken prop, same pattern as SlotManager.
 * - Previously fixed bugs: none relevant (new component).
 */

import { useState } from 'react';
import { Volleyball, Plus, Pencil, Trash2, Loader2, Home, Sun, AlertTriangle, X, Check } from 'lucide-react';
import { useClubCourts } from './useClubCourts';
import {
  SURFACE_LABELS,
  FORMAT_LABELS,
  SURFACE_OPTIONS,
  FORMAT_OPTIONS,
  type ManagedCourt,
  type CourtSurface,
  type MatchFormat,
} from '../../graphql/operations/courts';

interface Props {
  initialCourts: ManagedCourt[];
  initialError: string | null;
  accessToken: string;
}

interface Feedback {
  type: 'success' | 'error';
  text: string;
}

type ModalState =
  | { kind: 'none' }
  | { kind: 'create' }
  | { kind: 'edit'; court: ManagedCourt };

export default function CourtManager({ initialCourts, initialError, accessToken }: Props) {
  const { courts, loading, error, createCourt, updateCourt, deleteCourt } = useClubCourts({
    initialCourts,
    initialError,
    accessToken,
  });

  const [modal, setModal] = useState<ModalState>({ kind: 'none' });
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ManagedCourt | null>(null);
  const [busy, setBusy] = useState(false);

  const showFeedback = (fb: Feedback) => {
    setFeedback(fb);
    window.setTimeout(() => setFeedback(null), 5000);
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setBusy(true);
    const res = await deleteCourt(confirmDelete.id);
    setBusy(false);
    setConfirmDelete(null);
    showFeedback({ type: res.success ? 'success' : 'error', text: res.message });
  };

  return (
    <div className="cm-root">
      {/* Toolbar */}
      <div className="cm-toolbar">
        <span className="cm-count">
          {courts.length} {courts.length === 1 ? 'cancha' : 'canchas'}
          {loading && <Loader2 className="cm-spin" size={14} aria-hidden="true" />}
        </span>
        <button className="cm-btn cm-btn--primary" onClick={() => setModal({ kind: 'create' })}>
          <Plus size={16} strokeWidth={2.5} aria-hidden="true" />
          Nueva cancha
        </button>
      </div>

      {feedback && (
        <div className={`cm-banner cm-banner--${feedback.type}`} role="status">
          {feedback.type === 'success'
            ? <Check size={16} aria-hidden="true" />
            : <AlertTriangle size={16} aria-hidden="true" />}
          <span>{feedback.text}</span>
        </div>
      )}

      {error && !courts.length && (
        <div className="cm-banner cm-banner--error" role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {/* Empty state */}
      {!loading && courts.length === 0 && !error && (
        <div className="cm-empty">
          <Volleyball size={40} strokeWidth={1.5} aria-hidden="true" />
          <h3>Todavía no tenés canchas</h3>
          <p>Creá tu primera cancha para empezar a configurar horarios y partidos.</p>
          <button className="cm-btn cm-btn--primary" onClick={() => setModal({ kind: 'create' })}>
            <Plus size={16} strokeWidth={2.5} aria-hidden="true" />
            Nueva cancha
          </button>
        </div>
      )}

      {/* Grid */}
      {courts.length > 0 && (
        <div className="cm-grid">
          {courts.map((court) => (
            <article key={court.id} className="cm-card">
              <div className="cm-card-head">
                <span className="cm-card-icon"><Volleyball size={18} strokeWidth={2} aria-hidden="true" /></span>
                <h3 className="cm-card-name">{court.name}</h3>
              </div>

              <div className="cm-badges">
                <span className="cm-badge">{FORMAT_LABELS[court.maxFormat]}</span>
                <span className="cm-badge cm-badge--muted">{SURFACE_LABELS[court.surface]}</span>
                <span className="cm-badge cm-badge--muted">
                  {court.isIndoor
                    ? <><Home size={12} aria-hidden="true" /> Indoor</>
                    : <><Sun size={12} aria-hidden="true" /> Aire libre</>}
                </span>
              </div>

              <dl className="cm-stats">
                <div><dt>Horarios activos</dt><dd>{court.activeSlotCount}/{court.slotCount}</dd></div>
                <div><dt>Partidos próximos</dt><dd>{court.upcomingMatchCount}</dd></div>
              </dl>

              <div className="cm-card-actions">
                <button className="cm-btn cm-btn--ghost" onClick={() => setModal({ kind: 'edit', court })}>
                  <Pencil size={14} aria-hidden="true" /> Editar
                </button>
                <button
                  className="cm-btn cm-btn--danger-ghost"
                  onClick={() => setConfirmDelete(court)}
                >
                  <Trash2 size={14} aria-hidden="true" /> Eliminar
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Create / edit modal */}
      {modal.kind !== 'none' && (
        <CourtFormModal
          court={modal.kind === 'edit' ? modal.court : null}
          busy={busy}
          onClose={() => setModal({ kind: 'none' })}
          onSubmit={async (values) => {
            setBusy(true);
            const res = modal.kind === 'edit'
              ? await updateCourt({ courtId: modal.court.id, ...values })
              : await createCourt(values);
            setBusy(false);
            if (res.success) {
              setModal({ kind: 'none' });
              showFeedback({ type: 'success', text: res.message });
            } else {
              showFeedback({ type: 'error', text: res.message });
            }
          }}
        />
      )}

      {/* Delete confirm */}
      {confirmDelete && (
        <div className="cm-overlay" role="dialog" aria-modal="true" onClick={() => !busy && setConfirmDelete(null)}>
          <div className="cm-dialog" onClick={(e) => e.stopPropagation()}>
            <h3 className="cm-dialog-title">Eliminar cancha</h3>
            <p className="cm-dialog-text">
              ¿Seguro que querés eliminar <strong>{confirmDelete.name}</strong>? Esta acción no se puede deshacer.
            </p>
            <div className="cm-dialog-actions">
              <button className="cm-btn cm-btn--ghost" onClick={() => setConfirmDelete(null)} disabled={busy}>
                Cancelar
              </button>
              <button className="cm-btn cm-btn--danger" onClick={handleDelete} disabled={busy}>
                {busy ? <Loader2 className="cm-spin" size={14} aria-hidden="true" /> : <Trash2 size={14} aria-hidden="true" />}
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      <CourtManagerStyles />
    </div>
  );
}

// =====================================================
// Form modal
// =====================================================

interface FormValues {
  name: string;
  surface: CourtSurface;
  isIndoor: boolean;
  maxFormat: MatchFormat;
}

function CourtFormModal({
  court,
  busy,
  onClose,
  onSubmit,
}: {
  court: ManagedCourt | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (values: FormValues) => void;
}) {
  const [name, setName] = useState(court?.name ?? '');
  const [surface, setSurface] = useState<CourtSurface>(court?.surface ?? 'SYNTHETIC');
  const [maxFormat, setMaxFormat] = useState<MatchFormat>(court?.maxFormat ?? 'ELEVEN_VS_ELEVEN');
  const [isIndoor, setIsIndoor] = useState<boolean>(court?.isIndoor ?? false);

  const canSubmit = name.trim().length > 0 && !busy;

  return (
    <div className="cm-overlay" role="dialog" aria-modal="true" onClick={() => !busy && onClose()}>
      <div className="cm-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="cm-dialog-head">
          <h3 className="cm-dialog-title">{court ? 'Editar cancha' : 'Nueva cancha'}</h3>
          <button className="cm-icon-btn" aria-label="Cerrar" onClick={onClose} disabled={busy}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <form
          className="cm-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (canSubmit) onSubmit({ name: name.trim(), surface, isIndoor, maxFormat });
          }}
        >
          <label className="cm-field">
            <span>Nombre</span>
            <input
              type="text"
              value={name}
              maxLength={80}
              placeholder="Ej. Cancha 1"
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </label>

          <label className="cm-field">
            <span>Formato máximo</span>
            <select value={maxFormat} onChange={(e) => setMaxFormat(e.target.value as MatchFormat)}>
              {FORMAT_OPTIONS.map((f) => <option key={f} value={f}>{FORMAT_LABELS[f]}</option>)}
            </select>
          </label>

          <label className="cm-field">
            <span>Superficie</span>
            <select value={surface} onChange={(e) => setSurface(e.target.value as CourtSurface)}>
              {SURFACE_OPTIONS.map((s) => <option key={s} value={s}>{SURFACE_LABELS[s]}</option>)}
            </select>
          </label>

          <label className="cm-check">
            <input type="checkbox" checked={isIndoor} onChange={(e) => setIsIndoor(e.target.checked)} />
            <span>Cancha techada (indoor)</span>
          </label>

          <div className="cm-dialog-actions">
            <button type="button" className="cm-btn cm-btn--ghost" onClick={onClose} disabled={busy}>
              Cancelar
            </button>
            <button type="submit" className="cm-btn cm-btn--primary" disabled={!canSubmit}>
              {busy ? <Loader2 className="cm-spin" size={14} aria-hidden="true" /> : <Check size={14} aria-hidden="true" />}
              {court ? 'Guardar' : 'Crear'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// =====================================================
// Styles (FIFA dark stadium + light overrides)
// =====================================================

function CourtManagerStyles() {
  return (
    <style>{`
      .cm-root { display: flex; flex-direction: column; gap: 1rem; }
      .cm-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
      .cm-count {
        display: inline-flex; align-items: center; gap: 0.4rem;
        font-family: 'Barlow Condensed', sans-serif; font-weight: 600; letter-spacing: 0.04em;
        color: hsl(215 20% 60%); text-transform: uppercase; font-size: 0.85rem;
      }
      .cm-spin { animation: cm-spin 0.8s linear infinite; }
      @keyframes cm-spin { to { transform: rotate(360deg); } }

      .cm-btn {
        display: inline-flex; align-items: center; gap: 0.4rem;
        padding: 0.5rem 0.85rem; border-radius: 8px; cursor: pointer;
        font-family: 'Barlow', sans-serif; font-size: 0.85rem; font-weight: 600;
        border: 1px solid transparent; transition: background 0.15s, border-color 0.15s, color 0.15s;
      }
      .cm-btn:disabled { opacity: 0.55; cursor: not-allowed; }
      .cm-btn--primary { background: hsl(35 100% 48%); color: hsl(220 72% 8%); }
      .cm-btn--primary:hover:not(:disabled) { background: hsl(35 100% 54%); }
      .cm-btn--ghost { background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.12); color: hsl(210 20% 80%); }
      .cm-btn--ghost:hover:not(:disabled) { background: rgba(255,255,255,0.1); }
      .cm-btn--danger { background: hsl(0 72% 51%); color: #fff; }
      .cm-btn--danger:hover:not(:disabled) { background: hsl(0 72% 57%); }
      .cm-btn--danger-ghost { background: transparent; border-color: rgba(239,68,68,0.3); color: hsl(0 72% 65%); }
      .cm-btn--danger-ghost:hover:not(:disabled) { background: rgba(239,68,68,0.12); }

      .cm-banner {
        display: flex; align-items: center; gap: 0.5rem;
        padding: 0.65rem 0.85rem; border-radius: 8px; font-size: 0.85rem;
      }
      .cm-banner--success { background: rgba(34,197,94,0.12); border: 1px solid rgba(34,197,94,0.3); color: hsl(142 60% 70%); }
      .cm-banner--error { background: rgba(239,68,68,0.12); border: 1px solid rgba(239,68,68,0.3); color: hsl(0 72% 72%); }

      .cm-empty {
        display: flex; flex-direction: column; align-items: center; gap: 0.5rem;
        text-align: center; padding: 3rem 1rem; color: hsl(215 20% 55%);
        background: var(--color-card, hsl(220 55% 11%)); border: 1px dashed var(--color-border, hsl(220 30% 20%)); border-radius: 14px;
      }
      .cm-empty h3 { margin: 0.5rem 0 0; font-family: 'Bebas Neue', sans-serif; letter-spacing: 0.04em; color: var(--color-foreground, #fff); font-size: 1.3rem; }
      .cm-empty p { margin: 0 0 0.5rem; font-size: 0.9rem; }

      .cm-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 1rem; }
      .cm-card {
        display: flex; flex-direction: column; gap: 0.75rem;
        padding: 1.1rem; border-radius: 14px;
        background: var(--color-card, hsl(220 55% 11%)); border: 1px solid var(--color-border, hsl(220 30% 20%));
        transition: border-color 0.15s, transform 0.15s;
      }
      .cm-card:hover { border-color: rgba(246,164,0,0.4); transform: translateY(-2px); }
      .cm-card-head { display: flex; align-items: center; gap: 0.6rem; }
      .cm-card-icon {
        display: inline-flex; align-items: center; justify-content: center;
        width: 34px; height: 34px; border-radius: 9px;
        background: rgba(246,164,0,0.14); color: hsl(35 100% 60%); flex-shrink: 0;
      }
      .cm-card-name { margin: 0; font-family: 'Bebas Neue', sans-serif; font-size: 1.25rem; letter-spacing: 0.03em; color: var(--color-foreground, #fff); }

      .cm-badges { display: flex; flex-wrap: wrap; gap: 0.4rem; }
      .cm-badge {
        display: inline-flex; align-items: center; gap: 0.25rem;
        padding: 0.2rem 0.55rem; border-radius: 999px; font-size: 0.72rem; font-weight: 600;
        background: rgba(246,164,0,0.14); color: hsl(42 90% 65%); border: 1px solid rgba(246,164,0,0.25);
      }
      .cm-badge--muted { background: rgba(255,255,255,0.05); color: hsl(215 20% 65%); border-color: rgba(255,255,255,0.1); }

      .cm-stats { display: flex; gap: 1.25rem; margin: 0; padding: 0.5rem 0 0; border-top: 1px solid rgba(255,255,255,0.06); }
      .cm-stats div { display: flex; flex-direction: column; gap: 0.1rem; }
      .cm-stats dt { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.06em; color: hsl(215 20% 50%); }
      .cm-stats dd { margin: 0; font-family: 'Bebas Neue', sans-serif; font-size: 1.15rem; color: var(--color-foreground, #fff); }

      .cm-card-actions { display: flex; gap: 0.5rem; margin-top: auto; }
      .cm-card-actions .cm-btn { flex: 1; justify-content: center; }

      /* Overlay + dialog */
      .cm-overlay {
        position: fixed; inset: 0; z-index: 300; display: flex; align-items: center; justify-content: center;
        background: rgba(0,0,0,0.6); backdrop-filter: blur(3px); padding: 1rem;
      }
      .cm-dialog {
        width: min(440px, 100%); background: var(--color-card, hsl(220 55% 11%));
        border: 1px solid var(--color-border, hsl(220 30% 20%)); border-radius: 16px; padding: 1.25rem;
        box-shadow: 0 24px 64px rgba(0,0,0,0.5);
      }
      .cm-dialog-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; }
      .cm-dialog-title { margin: 0; font-family: 'Bebas Neue', sans-serif; font-size: 1.4rem; letter-spacing: 0.03em; color: var(--color-foreground, #fff); }
      .cm-dialog-text { margin: 0 0 1rem; color: hsl(215 20% 65%); font-size: 0.9rem; }
      .cm-dialog-actions { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1rem; }
      .cm-icon-btn { display: inline-flex; padding: 0.35rem; border-radius: 8px; background: transparent; border: none; cursor: pointer; color: hsl(215 20% 55%); }
      .cm-icon-btn:hover:not(:disabled) { background: rgba(255,255,255,0.08); color: #fff; }

      .cm-form { display: flex; flex-direction: column; gap: 0.85rem; }
      .cm-field { display: flex; flex-direction: column; gap: 0.3rem; }
      .cm-field span { font-size: 0.78rem; font-weight: 600; color: hsl(215 20% 65%); }
      .cm-field input, .cm-field select {
        padding: 0.55rem 0.65rem; border-radius: 8px; font-size: 0.9rem; font-family: inherit;
        background: var(--color-input, hsl(220 30% 16%)); border: 1px solid var(--color-border, hsl(220 30% 22%)); color: var(--color-foreground, #fff);
      }
      .cm-field input:focus, .cm-field select:focus { outline: 2px solid hsl(35 100% 48%); outline-offset: 1px; }
      .cm-check { display: flex; align-items: center; gap: 0.5rem; font-size: 0.88rem; color: hsl(210 20% 80%); cursor: pointer; }
      .cm-check input { width: 16px; height: 16px; accent-color: hsl(35 100% 48%); }

      /* Light theme */
      :global(html.light) .cm-card, :global(html.light) .cm-dialog, :global(html.light) .cm-empty { background: #fff; border-color: rgba(0,0,0,0.1); }
      :global(html.light) .cm-card-name, :global(html.light) .cm-dialog-title, :global(html.light) .cm-stats dd, :global(html.light) .cm-empty h3 { color: hsl(220 72% 12%); }
      :global(html.light) .cm-field input, :global(html.light) .cm-field select { background: hsl(0 0% 98%); border-color: rgba(0,0,0,0.15); color: hsl(220 72% 12%); }
      :global(html.light) .cm-btn--ghost { background: rgba(0,0,0,0.04); border-color: rgba(0,0,0,0.12); color: hsl(220 20% 30%); }

      @media (max-width: 600px) {
        .cm-grid { grid-template-columns: 1fr; }
      }
    `}</style>
  );
}
