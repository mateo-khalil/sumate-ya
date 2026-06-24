/**
 * ReservationManager — club admin UI for manual court bookings (Reservas)
 *
 * Decision Context:
 * - Reservas was a "Próximo" placeholder with no backend at all. This island is the full surface
 *   on top of the new reservations domain: list with filters (date range, court, status), create
 *   /edit via ReservationFormModal, plus cancel (soft) and delete (hard) per row.
 * - A reservation's booker is an app user OR manual contact data; the row renders whichever is
 *   present. Cancel keeps the row (status → CANCELLED) for history; delete removes it.
 * - SSR-hydrated initial list + accessToken prop, same pattern as the other club islands. Courts
 *   are passed in (SSR-fetched alongside reservations) to populate the form's court picker and
 *   the filter dropdown without a second client round-trip.
 * - This component owns the rm- style block used by both itself and ReservationFormModal.
 * - Previously fixed bugs: none relevant (new component).
 */

import { useState } from 'react';
import {
  CalendarClock, Plus, Pencil, Trash2, Ban, Loader2, AlertTriangle, Check, UserRound, Phone, Filter, Volleyball,
} from 'lucide-react';
import { useClubReservations } from './useClubReservations';
import ReservationFormModal, { type ReservationFormValues } from './ReservationFormModal';
import type { ManagedCourt } from '../../graphql/operations/courts';
import {
  STATUS_LABELS,
  STATUS_OPTIONS,
  type Reservation,
  type ReservationFilters,
  type ReservationStatus,
} from '../../graphql/operations/reservations';

interface Props {
  initialReservations: Reservation[];
  initialError: string | null;
  initialFilters: ReservationFilters;
  courts: ManagedCourt[];
  accessToken: string;
}

interface Feedback { type: 'success' | 'error'; text: string; }

type ModalState = { kind: 'none' } | { kind: 'create' } | { kind: 'edit'; reservation: Reservation };

const STATUS_CLASS: Record<ReservationStatus, string> = {
  CONFIRMED: 'rm-badge--ok',
  COMPLETED: 'rm-badge--done',
  CANCELLED: 'rm-badge--cancelled',
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('es-AR', {
    weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

export default function ReservationManager({
  initialReservations,
  initialError,
  initialFilters,
  courts,
  accessToken,
}: Props) {
  const {
    reservations, loading, error, filters, setFilters,
    createReservation, updateReservation, cancelReservation, deleteReservation, searchPlayers,
    suggestCourtPrice,
  } = useClubReservations({ initialReservations, initialError, initialFilters, accessToken });

  const [modal, setModal] = useState<ModalState>({ kind: 'none' });
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Reservation | null>(null);
  const [busy, setBusy] = useState(false);

  const showFeedback = (fb: Feedback) => {
    setFeedback(fb);
    window.setTimeout(() => setFeedback(null), 5000);
  };

  const patchFilter = (patch: Partial<ReservationFilters>) => setFilters({ ...filters, ...patch });

  const handleSubmit = async (values: ReservationFormValues) => {
    setBusy(true);
    const res = modal.kind === 'edit'
      ? await updateReservation({ reservationId: modal.reservation.id, ...values })
      : await createReservation(values);
    setBusy(false);
    if (res.success) {
      setModal({ kind: 'none' });
      showFeedback({ type: 'success', text: res.message });
    } else {
      showFeedback({ type: 'error', text: res.message });
    }
  };

  const handleCancel = async (r: Reservation) => {
    setBusy(true);
    const res = await cancelReservation(r.id);
    setBusy(false);
    showFeedback({ type: res.success ? 'success' : 'error', text: res.message });
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setBusy(true);
    const res = await deleteReservation(confirmDelete.id);
    setBusy(false);
    setConfirmDelete(null);
    showFeedback({ type: res.success ? 'success' : 'error', text: res.message });
  };

  const noCourts = courts.length === 0;

  return (
    <div className="rm-root">
      {/* Toolbar / filters */}
      <div className="rm-toolbar">
        <div className="rm-filters">
          <span className="rm-filter-icon"><Filter size={14} aria-hidden="true" /></span>
          <input type="date" aria-label="Desde" value={filters.startDate ?? ''} onChange={(e) => patchFilter({ startDate: e.target.value || undefined })} />
          <span className="rm-dash">–</span>
          <input type="date" aria-label="Hasta" value={filters.endDate ?? ''} onChange={(e) => patchFilter({ endDate: e.target.value || undefined })} />
          <select aria-label="Cancha" value={filters.courtId ?? ''} onChange={(e) => patchFilter({ courtId: e.target.value || undefined })}>
            <option value="">Todas las canchas</option>
            {courts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select aria-label="Estado" value={filters.status ?? ''} onChange={(e) => patchFilter({ status: (e.target.value || undefined) as ReservationStatus | undefined })}>
            <option value="">Todos los estados</option>
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </select>
          {loading && <Loader2 className="rm-spin" size={14} aria-hidden="true" />}
        </div>
        {/* Desde Reservas el club elige qué crear: una reserva de cancha o un partido
            abierto. "Crear partido" navega al wizard de partidos; "Nueva reserva" abre el
            modal local. (Pedido: mover la creación de partidos dentro de Reservas.) */}
        <div className="rm-actions">
          <a className="rm-btn rm-btn--ghost" href="/panel-club/crear-partido">
            <Volleyball size={16} strokeWidth={2.5} aria-hidden="true" />
            Crear partido
          </a>
          <button className="rm-btn rm-btn--primary" onClick={() => setModal({ kind: 'create' })} disabled={noCourts}>
            <Plus size={16} strokeWidth={2.5} aria-hidden="true" />
            Nueva reserva
          </button>
        </div>
      </div>

      {noCourts && (
        <div className="rm-banner rm-banner--error" role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>Primero creá una cancha para poder cargar reservas.</span>
        </div>
      )}

      {feedback && (
        <div className={`rm-banner rm-banner--${feedback.type === 'success' ? 'ok' : 'error'}`} role="status">
          {feedback.type === 'success' ? <Check size={16} aria-hidden="true" /> : <AlertTriangle size={16} aria-hidden="true" />}
          <span>{feedback.text}</span>
        </div>
      )}

      {error && !reservations.length && (
        <div className="rm-banner rm-banner--error" role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {!loading && reservations.length === 0 && !error && (
        <div className="rm-empty">
          <CalendarClock size={40} strokeWidth={1.5} aria-hidden="true" />
          <h3>No hay reservas</h3>
          <p>Cargá una reserva para un jugador de la app o un contacto manual.</p>
        </div>
      )}

      {/* List */}
      {reservations.length > 0 && (
        <ul className="rm-list">
          {reservations.map((r) => (
            <li key={r.id} className={`rm-item ${r.status === 'CANCELLED' ? 'is-cancelled' : ''}`}>
              <div className="rm-item-when">
                <CalendarClock size={16} aria-hidden="true" />
                <div>
                  <strong>{formatDateTime(r.reservedAt)}</strong>
                  <span className="rm-item-sub">{r.courtName} · {r.durationMin} min</span>
                </div>
              </div>

              <div className="rm-item-booker">
                <span className="rm-booker-name">
                  <UserRound size={14} aria-hidden="true" />
                  {r.player ? r.player.displayName : (r.contactName ?? 'Sin nombre')}
                  {!r.player && <span className="rm-tag-manual">Manual</span>}
                </span>
                {r.contactPhone && <span className="rm-booker-phone"><Phone size={12} aria-hidden="true" /> {r.contactPhone}</span>}
                {r.notes && <span className="rm-booker-notes">{r.notes}</span>}
              </div>

              <div className="rm-item-meta">
                <span className={`rm-badge ${STATUS_CLASS[r.status]}`}>{STATUS_LABELS[r.status]}</span>
                {r.priceArs != null && <span className="rm-price">${r.priceArs.toLocaleString('es-AR')}</span>}
              </div>

              <div className="rm-item-actions">
                <button className="rm-icon-btn" aria-label="Editar" title="Editar" onClick={() => setModal({ kind: 'edit', reservation: r })}>
                  <Pencil size={15} aria-hidden="true" />
                </button>
                {r.status !== 'CANCELLED' && (
                  <button className="rm-icon-btn" aria-label="Cancelar reserva" title="Cancelar" onClick={() => handleCancel(r)} disabled={busy}>
                    <Ban size={15} aria-hidden="true" />
                  </button>
                )}
                <button className="rm-icon-btn rm-icon-btn--danger" aria-label="Eliminar" title="Eliminar" onClick={() => setConfirmDelete(r)}>
                  <Trash2 size={15} aria-hidden="true" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {modal.kind !== 'none' && (
        <ReservationFormModal
          reservation={modal.kind === 'edit' ? modal.reservation : null}
          courts={courts}
          busy={busy}
          searchPlayers={searchPlayers}
          suggestPrice={suggestCourtPrice}
          onClose={() => setModal({ kind: 'none' })}
          onSubmit={handleSubmit}
        />
      )}

      {confirmDelete && (
        <div className="rm-overlay" role="dialog" aria-modal="true" onClick={() => !busy && setConfirmDelete(null)}>
          <div className="rm-dialog" onClick={(e) => e.stopPropagation()}>
            <h3 className="rm-dialog-title">Eliminar reserva</h3>
            <p className="rm-dialog-text">
              ¿Eliminar la reserva de <strong>{confirmDelete.player?.displayName ?? confirmDelete.contactName}</strong> del {formatDateTime(confirmDelete.reservedAt)}? Esta acción no se puede deshacer.
            </p>
            <div className="rm-dialog-actions">
              <button className="rm-btn rm-btn--ghost" onClick={() => setConfirmDelete(null)} disabled={busy}>Cancelar</button>
              <button className="rm-btn rm-btn--danger" onClick={handleDelete} disabled={busy}>
                {busy ? <Loader2 className="rm-spin" size={14} aria-hidden="true" /> : <Trash2 size={14} aria-hidden="true" />}
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      <ReservationManagerStyles />
    </div>
  );
}

function ReservationManagerStyles() {
  return (
    <style>{`
      .rm-root { display: flex; flex-direction: column; gap: 1rem; }
      .rm-spin { animation: rm-spin 0.8s linear infinite; }
      @keyframes rm-spin { to { transform: rotate(360deg); } }

      .rm-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
      .rm-actions { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
      .rm-actions .rm-btn { text-decoration: none; }
      .rm-filters { display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; }
      .rm-filter-icon { color: hsl(215 20% 55%); display: inline-flex; }
      .rm-dash { color: hsl(215 20% 45%); }
      .rm-filters input, .rm-filters select {
        padding: 0.4rem 0.55rem; border-radius: 7px; font-size: 0.82rem; font-family: inherit;
        background: var(--color-input, hsl(220 30% 16%)); border: 1px solid var(--color-border, hsl(220 30% 22%)); color: var(--color-foreground, #fff);
      }

      .rm-btn {
        display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.5rem 0.85rem;
        border-radius: 8px; cursor: pointer; font-family: 'Barlow', sans-serif; font-size: 0.85rem;
        font-weight: 600; border: 1px solid transparent; transition: background 0.15s, color 0.15s;
      }
      .rm-btn:disabled { opacity: 0.55; cursor: not-allowed; }
      .rm-btn--primary { background: hsl(35 100% 48%); color: hsl(220 72% 8%); }
      .rm-btn--primary:hover:not(:disabled) { background: hsl(35 100% 54%); }
      .rm-btn--ghost { background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.12); color: hsl(210 20% 80%); }
      .rm-btn--ghost:hover:not(:disabled) { background: rgba(255,255,255,0.1); }
      .rm-btn--danger { background: hsl(0 72% 51%); color: #fff; }
      .rm-btn--danger:hover:not(:disabled) { background: hsl(0 72% 57%); }

      .rm-banner { display: flex; align-items: center; gap: 0.5rem; padding: 0.65rem 0.85rem; border-radius: 8px; font-size: 0.85rem; }
      .rm-banner--ok { background: rgba(34,197,94,0.12); border: 1px solid rgba(34,197,94,0.3); color: hsl(142 60% 70%); }
      .rm-banner--error { background: rgba(239,68,68,0.12); border: 1px solid rgba(239,68,68,0.3); color: hsl(0 72% 72%); }

      .rm-empty {
        display: flex; flex-direction: column; align-items: center; gap: 0.4rem; text-align: center;
        padding: 3rem 1rem; color: hsl(215 20% 55%); border-radius: 14px;
        background: var(--color-card, hsl(220 55% 11%)); border: 1px dashed var(--color-border, hsl(220 30% 20%));
      }
      .rm-empty h3 { margin: 0.5rem 0 0; font-family: 'Bebas Neue', sans-serif; letter-spacing: 0.04em; color: var(--color-foreground, #fff); font-size: 1.3rem; }
      .rm-empty p { margin: 0; font-size: 0.9rem; }

      .rm-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.6rem; }
      .rm-item {
        display: grid; grid-template-columns: 1.2fr 1.4fr auto auto; align-items: center; gap: 1rem;
        padding: 0.85rem 1rem; border-radius: 12px;
        background: var(--color-card, hsl(220 55% 11%)); border: 1px solid var(--color-border, hsl(220 30% 20%));
      }
      .rm-item.is-cancelled { opacity: 0.6; }
      .rm-item-when { display: flex; align-items: center; gap: 0.6rem; color: hsl(35 100% 62%); }
      .rm-item-when > div { display: flex; flex-direction: column; }
      .rm-item-when strong { color: var(--color-foreground, #fff); font-size: 0.9rem; text-transform: capitalize; }
      .rm-item-sub { color: hsl(215 20% 55%); font-size: 0.78rem; }

      .rm-item-booker { display: flex; flex-direction: column; gap: 0.15rem; min-width: 0; }
      .rm-booker-name { display: inline-flex; align-items: center; gap: 0.35rem; color: var(--color-foreground, #fff); font-size: 0.88rem; font-weight: 600; }
      .rm-booker-name :global(svg) { color: hsl(215 20% 55%); }
      .rm-tag-manual { font-size: 0.6rem; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; padding: 0.05rem 0.3rem; border-radius: 4px; background: rgba(255,255,255,0.08); color: hsl(215 20% 60%); }
      .rm-booker-phone { display: inline-flex; align-items: center; gap: 0.3rem; color: hsl(215 20% 60%); font-size: 0.78rem; }
      .rm-booker-notes { color: hsl(215 20% 50%); font-size: 0.76rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 32ch; }

      .rm-item-meta { display: flex; flex-direction: column; align-items: flex-end; gap: 0.25rem; }
      .rm-badge { font-size: 0.7rem; font-weight: 700; padding: 0.15rem 0.5rem; border-radius: 999px; }
      .rm-badge--ok { background: rgba(34,197,94,0.15); color: hsl(142 60% 70%); }
      .rm-badge--done { background: rgba(59,130,246,0.15); color: hsl(216 80% 72%); }
      .rm-badge--cancelled { background: rgba(239,68,68,0.15); color: hsl(0 72% 72%); }
      .rm-price { font-family: 'Bebas Neue', sans-serif; font-size: 1rem; color: hsl(142 50% 70%); }

      .rm-item-actions { display: flex; gap: 0.25rem; }
      .rm-icon-btn { display: inline-flex; padding: 0.4rem; border-radius: 7px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); cursor: pointer; color: hsl(210 20% 75%); }
      .rm-icon-btn:hover:not(:disabled) { background: rgba(255,255,255,0.12); color: #fff; }
      .rm-icon-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      .rm-icon-btn--danger { color: hsl(0 72% 65%); border-color: rgba(239,68,68,0.25); }
      .rm-icon-btn--danger:hover { background: rgba(239,68,68,0.12); }

      /* Overlay / dialog / form */
      .rm-overlay { position: fixed; inset: 0; z-index: 300; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.6); backdrop-filter: blur(3px); padding: 1rem; }
      .rm-dialog { width: min(440px, 100%); background: var(--color-card, hsl(220 55% 11%)); border: 1px solid var(--color-border, hsl(220 30% 20%)); border-radius: 16px; padding: 1.25rem; box-shadow: 0 24px 64px rgba(0,0,0,0.5); }
      .rm-dialog--wide { width: min(560px, 100%); max-height: 90vh; overflow-y: auto; }
      .rm-dialog-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; }
      .rm-dialog-title { margin: 0; font-family: 'Bebas Neue', sans-serif; font-size: 1.4rem; letter-spacing: 0.03em; color: var(--color-foreground, #fff); }
      .rm-dialog-text { margin: 0; color: hsl(215 20% 65%); font-size: 0.9rem; }
      .rm-dialog-actions { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1.1rem; }

      .rm-form { display: flex; flex-direction: column; gap: 0.85rem; }
      .rm-row { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
      .rm-field { display: flex; flex-direction: column; gap: 0.3rem; }
      .rm-field > span { font-size: 0.78rem; font-weight: 600; color: hsl(215 20% 65%); }
      .rm-field input, .rm-field select, .rm-field textarea {
        padding: 0.55rem 0.65rem; border-radius: 8px; font-size: 0.9rem; font-family: inherit;
        background: var(--color-input, hsl(220 30% 16%)); border: 1px solid var(--color-border, hsl(220 30% 22%)); color: var(--color-foreground, #fff);
      }
      .rm-field input:focus, .rm-field select:focus, .rm-field textarea:focus { outline: 2px solid hsl(35 100% 48%); outline-offset: 1px; }

      .rm-segment { display: inline-flex; gap: 0.25rem; padding: 0.25rem; border-radius: 9px; background: rgba(255,255,255,0.05); }
      .rm-seg { flex: 1; padding: 0.4rem 0.6rem; border-radius: 7px; border: none; background: transparent; cursor: pointer; font-family: inherit; font-size: 0.82rem; font-weight: 600; color: hsl(215 20% 60%); }
      .rm-seg.is-active { background: hsl(35 100% 48%); color: hsl(220 72% 8%); }

      .rm-chip { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.4rem 0.6rem; border-radius: 8px; background: rgba(246,164,0,0.14); border: 1px solid rgba(246,164,0,0.3); color: hsl(42 90% 68%); width: fit-content; }
      .rm-chip button { display: inline-flex; background: transparent; border: none; color: inherit; cursor: pointer; padding: 0; }

      .rm-search { position: relative; }
      .rm-search-icon { position: absolute; left: 0.6rem; top: 50%; transform: translateY(-50%); color: hsl(215 20% 55%); display: inline-flex; }
      .rm-search input { width: 100%; padding-left: 2rem; box-sizing: border-box; }
      .rm-results { list-style: none; margin: 0.25rem 0 0; padding: 0.25rem; position: absolute; z-index: 5; width: 100%; box-sizing: border-box; background: var(--color-card, hsl(220 55% 13%)); border: 1px solid var(--color-border, hsl(220 30% 22%)); border-radius: 9px; box-shadow: 0 16px 40px rgba(0,0,0,0.5); max-height: 220px; overflow-y: auto; }
      .rm-results button { display: flex; align-items: center; gap: 0.5rem; width: 100%; padding: 0.5rem 0.6rem; border-radius: 7px; background: transparent; border: none; cursor: pointer; font-family: inherit; font-size: 0.85rem; color: var(--color-foreground, #fff); text-align: left; }
      .rm-results button:hover { background: rgba(255,255,255,0.08); }

      .rm-icon-btn:disabled { opacity: 0.5; }

      /* Light theme */
      :global(html.light) .rm-item, :global(html.light) .rm-dialog, :global(html.light) .rm-empty, :global(html.light) .rm-results { background: #fff; border-color: rgba(0,0,0,0.1); }
      :global(html.light) .rm-item-when strong, :global(html.light) .rm-booker-name, :global(html.light) .rm-dialog-title, :global(html.light) .rm-empty h3, :global(html.light) .rm-results button { color: hsl(220 72% 12%); }
      :global(html.light) .rm-filters input, :global(html.light) .rm-filters select, :global(html.light) .rm-field input, :global(html.light) .rm-field select, :global(html.light) .rm-field textarea { background: hsl(0 0% 98%); border-color: rgba(0,0,0,0.15); color: hsl(220 72% 12%); }
      :global(html.light) .rm-btn--ghost, :global(html.light) .rm-icon-btn { background: rgba(0,0,0,0.04); border-color: rgba(0,0,0,0.12); color: hsl(220 20% 30%); }
      :global(html.light) .rm-segment { background: rgba(0,0,0,0.05); }

      @media (max-width: 720px) {
        .rm-item { grid-template-columns: 1fr; align-items: flex-start; gap: 0.5rem; }
        .rm-item-meta { flex-direction: row; align-items: center; }
        .rm-row { grid-template-columns: 1fr; }
      }
    `}</style>
  );
}
