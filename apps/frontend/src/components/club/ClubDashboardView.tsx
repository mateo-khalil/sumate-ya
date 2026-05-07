/**
 * ClubDashboardView — main orchestrator React island for the club dashboard
 *
 * Decision Context:
 * - Why island: needs interactivity (view switching, filters, modal, export).
 *   Receives SSR-hydrated initialData from dashboard.astro so first render is instant.
 * - View state (calendar/agenda/table) held in local React state — no nanostore needed
 *   since this state is local to the dashboard and not shared with other islands.
 * - Courts derived from schedule data to avoid an extra query: the schedule already
 *   includes courtId/courtName per slot, so we deduplicate them here for the filter UI.
 * - DashboardFilters.onReset resets to the current week (same default as SSR prefetch).
 * - Export button opens ExportDialog which calls useDashboard.exportSchedule.
 * - Conflict alerts shown only when there are conflicts.
 * - Phase 2 notes (documented here, not implemented):
 *   - Quick action "Bloquear slot" from calendar cell (requires toggleSlotBlock mutation).
 *   - Audit log panel (requires slotAuditLog query integration).
 * - Previously fixed bugs: none relevant (new feature).
 */

import { useState } from 'react';
import { CalendarRange, List, Table2, Download, ExternalLink, Loader2 } from 'lucide-react';
import { useDashboard } from './useDashboard';
import DashboardHeader from './DashboardHeader';
import DashboardFilters from './DashboardFilters';
import ClubScheduleView from './ClubScheduleView';
import ClubAgendaView from './ClubAgendaView';
import ClubTableView from './ClubTableView';
import MatchDetailModal from './MatchDetailModal';
import ConflictAlerts from './ConflictAlerts';
import ExportDialog from './ExportDialog';
import type { ClubDashboardData, DashboardMatch } from '../../graphql/operations/club-dashboard';

interface Props {
  initialData: ClubDashboardData | null;
  initialError: string | null;
  accessToken: string;
  defaultStartDate: string;
  defaultEndDate: string;
}

type ViewMode = 'calendar' | 'agenda' | 'table';

function weekRange() {
  const now = new Date();
  const day = now.getUTCDay();
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - ((day + 6) % 7));
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return { start: monday.toISOString().slice(0, 10), end: sunday.toISOString().slice(0, 10) };
}

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
  const [showExport, setShowExport] = useState(false);

  // Derive unique courts from schedule for the filter dropdown
  const courts =
    data?.schedule
      ? [
          ...new Map(
            data.schedule.map((s) => [s.courtId, { id: s.courtId, name: s.courtName }]),
          ).values(),
        ]
      : [];

  function handleReset() {
    const w = weekRange();
    updateFilters({ startDate: w.start, endDate: w.end, courtIds: undefined, matchStatuses: undefined });
  }

  return (
    <div className="dash-view">
      {/* KPI Header */}
      {data && <DashboardHeader club={data.club} metrics={data.metrics} />}

      {/* Conflict alerts */}
      {data?.conflicts?.length ? <ConflictAlerts conflicts={data.conflicts} /> : null}

      {/* Filters + actions bar */}
      <div className="toolbar">
        <DashboardFilters
          filters={filters}
          courts={courts}
          onChange={updateFilters}
          onReset={handleReset}
        />
        <div className="toolbar-actions">
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

      {/* View mode switcher */}
      <div className="view-switcher">
        <button
          className={`view-btn ${view === 'calendar' ? 'active' : ''}`}
          onClick={() => setView('calendar')}
          aria-label="Vista calendario"
        >
          <CalendarRange size={15} strokeWidth={2} aria-hidden="true" />
          Calendario
        </button>
        <button
          className={`view-btn ${view === 'agenda' ? 'active' : ''}`}
          onClick={() => setView('agenda')}
          aria-label="Vista agenda"
        >
          <List size={15} strokeWidth={2} aria-hidden="true" />
          Agenda
        </button>
        <button
          className={`view-btn ${view === 'table' ? 'active' : ''}`}
          onClick={() => setView('table')}
          aria-label="Vista tabla"
        >
          <Table2 size={15} strokeWidth={2} aria-hidden="true" />
          Tabla
        </button>
      </div>

      {/* Loading overlay */}
      {loading && (
        <div className="loading-bar" aria-live="polite" aria-label="Cargando dashboard">
          <Loader2 size={16} strokeWidth={2} className="spin" aria-hidden="true" />
          <span>Actualizando...</span>
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div className="error-banner" role="alert">
          {error}
          <button className="retry-btn" onClick={() => refetch()}>Reintentar</button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && !data && (
        <div className="empty-state">No hay datos disponibles para el rango seleccionado</div>
      )}

      {/* Views */}
      {data && !error && (
        <div className="view-content">
          {view === 'calendar' && (
            <ClubScheduleView slots={data.schedule} onMatchClick={setSelectedMatch} />
          )}
          {view === 'agenda' && (
            <ClubAgendaView matches={data.matches} onMatchClick={setSelectedMatch} />
          )}
          {view === 'table' && (
            <ClubTableView matches={data.matches} onMatchClick={setSelectedMatch} />
          )}
        </div>
      )}

      {/* Match detail modal */}
      <MatchDetailModal match={selectedMatch} onClose={() => setSelectedMatch(null)} />

      {/* Export dialog */}
      {showExport && (
        <ExportDialog
          filters={filters}
          onExport={exportSchedule}
          onClose={() => setShowExport(false)}
        />
      )}

      <style>{`
        .dash-view { display: flex; flex-direction: column; gap: 0; }
        .toolbar { display: flex; align-items: flex-end; justify-content: space-between; flex-wrap: wrap; gap: 0.5rem; }
        .toolbar-actions { display: flex; gap: 0.5rem; padding-bottom: 1rem; flex-shrink: 0; }
        .link-btn, .action-btn {
          display: flex; align-items: center; gap: 5px;
          background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1);
          border-radius: 8px; padding: 0.3rem 0.875rem; font-family: 'Barlow Condensed', sans-serif;
          font-size: 0.8rem; font-weight: 700; letter-spacing: 0.05em;
          color: hsl(215 20% 60%); cursor: pointer; text-decoration: none;
          transition: background 0.12s, color 0.12s;
        }
        .link-btn:hover, .action-btn:hover { background: rgba(246,164,0,0.08); color: hsl(42 100% 65%); }
        .view-switcher {
          display: flex; gap: 4px; margin-bottom: 1.25rem;
          border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 0.875rem;
        }
        .view-btn {
          display: flex; align-items: center; gap: 0.35rem;
          background: transparent; border: 1px solid rgba(255,255,255,0.08);
          border-radius: 8px; padding: 0.4rem 0.875rem; font-family: 'Barlow Condensed', sans-serif;
          font-size: 0.82rem; font-weight: 700; letter-spacing: 0.05em;
          color: hsl(215 20% 55%); cursor: pointer; transition: all 0.12s;
        }
        .view-btn.active {
          background: rgba(246,164,0,0.1); border-color: rgba(246,164,0,0.3);
          color: hsl(42 100% 65%);
        }
        .view-btn:hover:not(.active) { background: rgba(255,255,255,0.05); color: hsl(215 20% 75%); }
        .loading-bar {
          display: flex; align-items: center; gap: 0.5rem;
          font-family: 'Barlow', sans-serif; font-size: 0.84rem; color: hsl(215 20% 50%);
          margin-bottom: 0.75rem;
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
        .view-content { }
      `}</style>
    </div>
  );
}
