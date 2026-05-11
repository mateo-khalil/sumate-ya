/**
 * ClubDashboardView — main orchestrator React island for the club dashboard
 *
 * Decision Context:
 * - Why island: needs interactivity (view switching, filters, modal, export).
 *   Receives SSR-hydrated initialData from dashboard.astro so first render is instant.
 * - View state (calendar/agenda) held in local React state — no nanostore needed
 *   since this state is local to the dashboard and not shared with other islands.
 * - Courts derived from schedule data to avoid an extra query: the schedule already
 *   includes courtId/courtName per slot, so we deduplicate them here for the filter UI.
 * - Slot click routing added in this version:
 *     Free slot  → selectedFreeSlot state → SlotActionPanel with create/block links
 *     Blocked    → selectedBlockedSlot state → BlockInfoPanel with block details
 *   Both panels are lightweight inline modals. Full slot management lives in horarios.
 * - SlotActionPanel navigates to /panel-club/horarios with slotId and action query
 *   params so the admin can create a match or block from the horarios page. This avoids
 *   duplicating block/create logic in the dashboard and keeps horarios as the single
 *   CRUD surface for slot management.
 * - DashboardFilters.onReset resets to the current week (same default as SSR prefetch).
 * - Previously fixed bugs: none relevant (new feature).
 */

import { useState } from 'react';
import { CalendarRange, List, Download, ExternalLink, Loader2, X, Lock, Plus, ExternalLink as LinkIcon } from 'lucide-react';
import { useDashboard } from './useDashboard';
import DashboardHeader from './DashboardHeader';
import DashboardFilters from './DashboardFilters';
import ClubScheduleView from './ClubScheduleView';
import ClubAgendaView from './ClubAgendaView';
import MatchDetailModal from './MatchDetailModal';
import ConflictAlerts from './ConflictAlerts';
import ExportDialog from './ExportDialog';
import type { ClubDashboardData, DashboardMatch, ScheduleSlot } from '../../graphql/operations/club-dashboard';

interface Props {
  initialData: ClubDashboardData | null;
  initialError: string | null;
  accessToken: string;
  defaultStartDate: string;
  defaultEndDate: string;
}

type ViewMode = 'calendar' | 'agenda';

function weekRange() {
  const now = new Date();
  const day = now.getUTCDay();
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - ((day + 6) % 7));
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return { start: monday.toISOString().slice(0, 10), end: sunday.toISOString().slice(0, 10) };
}

// ── Slot action panels ────────────────────────────────────────────────────────

function FreeSlotPanel({ slot, onClose }: { slot: ScheduleSlot; onClose: () => void }) {
  const base = `/panel-club/horarios?slotId=${slot.slotId}`;
  return (
    <div className="slot-panel-backdrop" onClick={onClose}>
      <div className="slot-panel" onClick={(e) => e.stopPropagation()}>
        <div className="slot-panel-header">
          <div>
            <div className="slot-panel-label">HORARIO LIBRE</div>
            <div className="slot-panel-title">{slot.courtName} · {slot.startTime.slice(0, 5)}</div>
          </div>
          <button className="slot-panel-close" onClick={onClose} aria-label="Cerrar">
            <X size={16} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
        <div className="slot-panel-actions">
          <a href={`${base}&action=create`} className="slot-action-btn slot-action-btn--primary">
            <Plus size={14} strokeWidth={2} aria-hidden="true" />
            Crear partido aquí
          </a>
          <a href={`${base}&action=block`} className="slot-action-btn">
            <Lock size={14} strokeWidth={2} aria-hidden="true" />
            Bloquear horario
          </a>
        </div>
      </div>
    </div>
  );
}

function BlockedSlotPanel({ slot, onClose }: { slot: ScheduleSlot; onClose: () => void }) {
  return (
    <div className="slot-panel-backdrop" onClick={onClose}>
      <div className="slot-panel" onClick={(e) => e.stopPropagation()}>
        <div className="slot-panel-header">
          <div>
            <div className="slot-panel-label slot-panel-label--blocked">BLOQUEADO</div>
            <div className="slot-panel-title">{slot.courtName} · {slot.startTime.slice(0, 5)}</div>
          </div>
          <button className="slot-panel-close" onClick={onClose} aria-label="Cerrar">
            <X size={16} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
        {slot.blockReason && (
          <p className="slot-panel-reason">{slot.blockReason}</p>
        )}
        {slot.blockType && (
          <p className="slot-panel-meta">Tipo: {slot.blockType}</p>
        )}
        <a
          href={`/panel-club/horarios?slotId=${slot.slotId}&action=unblock`}
          className="slot-action-btn slot-action-btn--danger"
        >
          <LinkIcon size={14} strokeWidth={2} aria-hidden="true" />
          Desbloquear en horarios
        </a>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ClubDashboardView(props: Props) {
  const { data, loading, error, filters, updateFilters, refetch, exportSchedule } = useDashboard({
    initialData: props.initialData,
    initialError: props.initialError,
    accessToken: props.accessToken,
    defaultStartDate: props.defaultStartDate,
    defaultEndDate: props.defaultEndDate,
  });

  const [view, setView] = useState<ViewMode>('calendar');
  const [selectedMatch, setSelectedMatch] = useState<DashboardMatch | null>(null);
  const [selectedFreeSlot, setSelectedFreeSlot] = useState<ScheduleSlot | null>(null);
  const [selectedBlockedSlot, setSelectedBlockedSlot] = useState<ScheduleSlot | null>(null);
  const [showExport, setShowExport] = useState(false);

  const courts = data?.schedule
    ? [...new Map(data.schedule.map((s) => [s.courtId, { id: s.courtId, name: s.courtName }])).values()]
    : [];

  function handleReset() {
    const w = weekRange();
    updateFilters({ startDate: w.start, endDate: w.end, courtIds: undefined, matchStatuses: undefined });
  }

  return (
    <div className="dash-view">
      {data && <DashboardHeader club={data.club} metrics={data.metrics} />}
      {data?.conflicts?.length ? <ConflictAlerts conflicts={data.conflicts} /> : null}

      {/* Single compact toolbar: view switcher + filters + actions — mirrors Horarios SlotManager header */}
      <div className="dash-topbar">
        <div className="dash-topbar-left">
          <button
            className={`view-btn${view === 'calendar' ? ' active' : ''}`}
            onClick={() => setView('calendar')}
            aria-label="Vista calendario"
          >
            <CalendarRange size={15} strokeWidth={2} aria-hidden="true" />
            Calendario
          </button>
          <button
            className={`view-btn${view === 'agenda' ? ' active' : ''}`}
            onClick={() => setView('agenda')}
            aria-label="Vista agenda"
          >
            <List size={15} strokeWidth={2} aria-hidden="true" />
            Agenda
          </button>
          <DashboardFilters filters={filters} courts={courts} onChange={updateFilters} onReset={handleReset} />
        </div>
        <div className="dash-topbar-right">
          <a href="/panel-club/horarios" className="link-btn">
            <ExternalLink size={13} strokeWidth={2} aria-hidden="true" />
            Ir a horarios
          </a>
          <button className="action-btn" onClick={() => setShowExport(true)} aria-label="Exportar reporte">
            <Download size={13} strokeWidth={2} aria-hidden="true" />
            Exportar
          </button>
        </div>
      </div>

      {loading && (
        <div className="loading-bar" aria-live="polite" aria-label="Cargando dashboard">
          <Loader2 size={16} strokeWidth={2} className="spin" aria-hidden="true" />
          <span>Actualizando...</span>
        </div>
      )}

      {error && !loading && (
        <div className="error-banner" role="alert">
          {error}
          <button className="retry-btn" onClick={() => refetch(filters)}>Reintentar</button>
        </div>
      )}

      {!loading && !error && !data && (
        <div className="empty-state">No hay datos disponibles para el rango seleccionado</div>
      )}

      {data && !error && (
        <div className="view-content">
          {view === 'calendar' && (
            <ClubScheduleView
              slots={data.schedule}
              onMatchClick={setSelectedMatch}
              onFreeSlotClick={setSelectedFreeSlot}
              onBlockedSlotClick={setSelectedBlockedSlot}
              startDate={filters.startDate}
              endDate={filters.endDate}
              onWeekChange={(s, e) => updateFilters({ startDate: s, endDate: e })}
            />
          )}
          {view === 'agenda' && (
            <ClubAgendaView
              matches={data.matches}
              onMatchClick={setSelectedMatch}
              startDate={filters.startDate}
              onWeekChange={(s, e) => updateFilters({ startDate: s, endDate: e })}
            />
          )}
        </div>
      )}

      <MatchDetailModal match={selectedMatch} onClose={() => setSelectedMatch(null)} />

      {selectedFreeSlot && (
        <FreeSlotPanel slot={selectedFreeSlot} onClose={() => setSelectedFreeSlot(null)} />
      )}
      {selectedBlockedSlot && (
        <BlockedSlotPanel slot={selectedBlockedSlot} onClose={() => setSelectedBlockedSlot(null)} />
      )}

      {showExport && (
        <ExportDialog
          filters={filters}
          onExport={exportSchedule}
          onClose={() => setShowExport(false)}
        />
      )}

      <style>{`
        .dash-view { display: flex; flex-direction: column; gap: 0; }
        /* Single compact topbar merging view-switcher + filters + actions */
        .dash-topbar {
          display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap;
          gap: 0.5rem; padding: 0.75rem 0; margin-bottom: 0.875rem;
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .dash-topbar-left { display: flex; align-items: center; gap: 0.375rem; flex-wrap: wrap; }
        .dash-topbar-right { display: flex; gap: 0.5rem; flex-shrink: 0; }
        .link-btn, .action-btn {
          display: flex; align-items: center; gap: 5px;
          background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1);
          border-radius: 8px; padding: 0.3rem 0.875rem;
          font-family: 'Barlow Condensed', sans-serif; font-size: 0.8rem; font-weight: 700;
          letter-spacing: 0.05em; color: hsl(215 20% 60%); cursor: pointer; text-decoration: none;
          transition: background 0.12s, color 0.12s;
        }
        .link-btn:hover, .action-btn:hover { background: rgba(246,164,0,0.08); color: hsl(42 100% 65%); }
        .view-btn {
          display: flex; align-items: center; gap: 0.35rem;
          background: transparent; border: 1px solid rgba(255,255,255,0.08);
          border-radius: 8px; padding: 0.4rem 0.875rem;
          font-family: 'Barlow Condensed', sans-serif; font-size: 0.82rem; font-weight: 700;
          letter-spacing: 0.05em; color: hsl(215 20% 55%); cursor: pointer; transition: all 0.12s;
        }
        .view-btn.active { background: rgba(246,164,0,0.1); border-color: rgba(246,164,0,0.3); color: hsl(42 100% 65%); }
        .view-btn:hover:not(.active) { background: rgba(255,255,255,0.05); color: hsl(215 20% 75%); }
        .loading-bar {
          display: flex; align-items: center; gap: 0.5rem;
          font-family: 'Barlow', sans-serif; font-size: 0.84rem; color: hsl(215 20% 50%); margin-bottom: 0.75rem;
        }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
        .error-banner {
          display: flex; align-items: center; gap: 0.75rem;
          background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.2);
          border-radius: 8px; padding: 0.75rem 1rem; margin-bottom: 1rem;
          font-family: 'Barlow', sans-serif; font-size: 0.875rem; color: hsl(0 72% 65%);
        }
        .retry-btn {
          background: transparent; border: 1px solid rgba(239,68,68,0.3); border-radius: 6px;
          padding: 0.2rem 0.625rem; font-family: 'Barlow', sans-serif; font-size: 0.8rem;
          color: hsl(0 72% 65%); cursor: pointer;
        }
        .empty-state {
          text-align: center; padding: 3rem 0; color: hsl(215 20% 40%);
          font-family: 'Barlow', sans-serif; font-size: 0.9rem;
        }
        /* Slot action panels */
        .slot-panel-backdrop {
          position: fixed; inset: 0; z-index: 90;
          background: rgba(0,0,0,0.5); backdrop-filter: blur(3px);
          display: flex; align-items: center; justify-content: center;
        }
        .slot-panel {
          background: hsl(220 60% 10%); border: 1px solid rgba(255,255,255,0.1);
          border-radius: 12px; padding: 1.25rem; width: min(360px, 92vw);
          display: flex; flex-direction: column; gap: 0.875rem;
          box-shadow: 0 16px 48px rgba(0,0,0,0.6);
        }
        .slot-panel-header { display: flex; justify-content: space-between; align-items: flex-start; }
        .slot-panel-label {
          font-family: 'Barlow Condensed', sans-serif; font-size: 0.65rem; font-weight: 700;
          letter-spacing: 0.18em; text-transform: uppercase; color: hsl(142 71% 50%); margin-bottom: 3px;
        }
        .slot-panel-label--blocked { color: hsl(var(--destructive)); }
        .slot-panel-title {
          font-family: 'Bebas Neue', sans-serif; font-size: 1.4rem;
          color: hsl(var(--foreground)); letter-spacing: 0.04em; line-height: 1;
        }
        .slot-panel-close {
          background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1);
          border-radius: 6px; padding: 0.3rem; cursor: pointer; color: hsl(215 20% 60%);
          display: inline-flex; transition: background 0.12s;
        }
        .slot-panel-close:hover { background: rgba(255,255,255,0.12); color: #fff; }
        .slot-panel-reason { font-family: 'Barlow', sans-serif; font-size: 0.875rem; color: hsl(215 20% 60%); margin: 0; }
        .slot-panel-meta { font-family: 'Barlow', sans-serif; font-size: 0.8rem; color: hsl(215 20% 45%); margin: 0; }
        .slot-panel-actions { display: flex; flex-direction: column; gap: 0.5rem; }
        .slot-action-btn {
          display: flex; align-items: center; gap: 6px;
          background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
          border-radius: 8px; padding: 0.5rem 0.875rem; text-decoration: none;
          font-family: 'Barlow Condensed', sans-serif; font-size: 0.82rem; font-weight: 700;
          letter-spacing: 0.05em; color: hsl(215 20% 70%); transition: background 0.12s, color 0.12s;
        }
        .slot-action-btn:hover { background: rgba(255,255,255,0.1); color: #fff; }
        .slot-action-btn--primary { background: rgba(246,164,0,0.12); border-color: rgba(246,164,0,0.25); color: hsl(42 100% 65%); }
        .slot-action-btn--primary:hover { background: rgba(246,164,0,0.2); }
        .slot-action-btn--danger { background: rgba(239,68,68,0.1); border-color: rgba(239,68,68,0.25); color: hsl(0 72% 65%); }
        .slot-action-btn--danger:hover { background: rgba(239,68,68,0.18); }
        /* ── Responsive ── */
        @media (max-width: 767px) {
          .dash-topbar { padding: 0.625rem 0; }
          .dash-topbar-right { display: none; } /* action links move to mobile drawer */
          .view-btn { min-height: 44px; }
          .link-btn, .action-btn { min-height: 44px; }
          /* Slot action panel full-width on mobile */
          .slot-panel { width: 100%; max-width: 100%; border-radius: 0; position: fixed; bottom: 0; top: auto; left: 0; right: 0; border-bottom: none; }
          .slot-panel-backdrop { align-items: flex-end; }
        }
      `}</style>
    </div>
  );
}
