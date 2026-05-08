/**
 * DashboardFilters — date, court, and status filter controls for the dashboard
 *
 * Decision Context:
 * - Why: Separates filter state/UI from the main ClubDashboardView to keep components
 *   under the 250-line limit. Receives onFiltersChange callback from the parent.
 * - Quick selectors (Hoy, Esta semana, Este mes) compute ISO date strings using
 *   the UTC helpers consistent with the service layer.
 * - courtIds and matchStatuses use simple multi-select UI (checkboxes in a dropdown)
 *   rather than a heavy Select library — keeps the bundle lean.
 * - Reset clears all optional filters back to the current week.
 * - Previously fixed bugs: none relevant (new feature).
 */

import { useState } from 'react';
import { X, CalendarRange, Filter } from 'lucide-react';
import type { ClubDashboardFilters, MatchStatus } from '../../graphql/operations/club-dashboard';

interface Court {
  id: string;
  name: string;
}

interface Props {
  filters: ClubDashboardFilters;
  courts: Court[];
  onChange: (f: Partial<ClubDashboardFilters>) => void;
  onReset: () => void;
}

const STATUSES: { value: MatchStatus; label: string }[] = [
  { value: 'OPEN', label: 'Abierto' },
  { value: 'FULL', label: 'Completo' },
  { value: 'IN_PROGRESS', label: 'En curso' },
  { value: 'COMPLETED', label: 'Finalizado' },
  { value: 'CANCELLED', label: 'Cancelado' },
];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function weekRange() {
  const now = new Date();
  const day = now.getUTCDay();
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - ((day + 6) % 7));
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return { start: monday.toISOString().slice(0, 10), end: sunday.toISOString().slice(0, 10) };
}

function monthRange() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

export default function DashboardFilters({ filters, courts, onChange, onReset }: Props) {
  const [showCourtMenu, setShowCourtMenu] = useState(false);
  const [showStatusMenu, setShowStatusMenu] = useState(false);

  const activeFiltersCount = [
    filters.courtIds?.length,
    filters.matchStatuses?.length,
  ].filter(Boolean).length;

  function toggleCourt(id: string) {
    const current = filters.courtIds ?? [];
    const next = current.includes(id) ? current.filter((c) => c !== id) : [...current, id];
    onChange({ courtIds: next.length ? next : undefined });
  }

  function toggleStatus(s: MatchStatus) {
    const current = filters.matchStatuses ?? [];
    const next = current.includes(s) ? current.filter((x) => x !== s) : [...current, s];
    onChange({ matchStatuses: next.length ? next : undefined });
  }

  return (
    <div className="filters-bar">
      {/* Quick range selectors */}
      <div className="quick-btns">
        <button
          className="quick-btn"
          onClick={() => onChange({ startDate: todayISO(), endDate: todayISO() })}
        >
          Hoy
        </button>
        <button
          className="quick-btn"
          onClick={() => {
            const r = weekRange();
            onChange({ startDate: r.start, endDate: r.end });
          }}
        >
          Esta semana
        </button>
        <button
          className="quick-btn"
          onClick={() => {
            const r = monthRange();
            onChange({ startDate: r.start, endDate: r.end });
          }}
        >
          Este mes
        </button>
      </div>

      {/* Date range inputs */}
      <div className="date-range">
        <span className="filter-icon"><CalendarRange size={14} strokeWidth={2} aria-hidden="true" /></span>
        <input
          type="date"
          className="date-input"
          value={filters.startDate ?? ''}
          onChange={(e) => onChange({ startDate: e.target.value })}
          aria-label="Fecha de inicio"
        />
        <span className="date-sep">—</span>
        <input
          type="date"
          className="date-input"
          value={filters.endDate ?? ''}
          onChange={(e) => onChange({ endDate: e.target.value })}
          aria-label="Fecha de fin"
        />
      </div>

      {/* Court multi-select */}
      {courts.length > 0 && (
        <div className="dropdown-wrap">
          <button className="filter-btn" onClick={() => setShowCourtMenu((v) => !v)}>
            <Filter size={13} strokeWidth={2} aria-hidden="true" />
            Cancha {filters.courtIds?.length ? `(${filters.courtIds.length})` : ''}
          </button>
          {showCourtMenu && (
            <div className="dropdown-menu">
              {courts.map((c) => (
                <label key={c.id} className="dropdown-item">
                  <input
                    type="checkbox"
                    checked={(filters.courtIds ?? []).includes(c.id)}
                    onChange={() => toggleCourt(c.id)}
                  />
                  {c.name}
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Status multi-select */}
      <div className="dropdown-wrap">
        <button className="filter-btn" onClick={() => setShowStatusMenu((v) => !v)}>
          <Filter size={13} strokeWidth={2} aria-hidden="true" />
          Estado {filters.matchStatuses?.length ? `(${filters.matchStatuses.length})` : ''}
        </button>
        {showStatusMenu && (
          <div className="dropdown-menu">
            {STATUSES.map((s) => (
              <label key={s.value} className="dropdown-item">
                <input
                  type="checkbox"
                  checked={(filters.matchStatuses ?? []).includes(s.value)}
                  onChange={() => toggleStatus(s.value)}
                />
                {s.label}
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Reset */}
      {activeFiltersCount > 0 && (
        <button className="reset-btn" onClick={onReset} aria-label="Limpiar filtros">
          <X size={13} strokeWidth={2} aria-hidden="true" />
          Limpiar
        </button>
      )}

      <style>{`
        .filters-bar {
          display: flex; align-items: center; gap: 0.625rem; flex-wrap: wrap;
          padding: 0.875rem 0; margin-bottom: 1rem;
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .quick-btns { display: flex; gap: 0.375rem; }
        .quick-btn {
          background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
          border-radius: 6px; padding: 0.3rem 0.75rem; font-size: 0.8rem;
          font-family: 'Barlow Condensed', sans-serif; font-weight: 700;
          letter-spacing: 0.05em; color: hsl(215 20% 65%); cursor: pointer;
          transition: background 0.12s, color 0.12s;
        }
        .quick-btn:hover { background: rgba(246,164,0,0.1); color: hsl(42 100% 65%); }
        .date-range {
          display: flex; align-items: center; gap: 0.375rem;
          background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.09);
          border-radius: 8px; padding: 0.3rem 0.625rem;
        }
        .filter-icon { display: inline-flex; color: hsl(215 20% 50%); }
        .date-input {
          background: transparent; border: none; color: hsl(210 20% 80%);
          font-size: 0.8rem; font-family: 'Barlow', sans-serif; outline: none;
          cursor: pointer;
        }
        .date-sep { color: hsl(215 20% 40%); font-size: 0.75rem; }
        .dropdown-wrap { position: relative; }
        .filter-btn {
          display: flex; align-items: center; gap: 0.35rem;
          background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.09);
          border-radius: 8px; padding: 0.3rem 0.75rem; font-size: 0.8rem;
          font-family: 'Barlow Condensed', sans-serif; font-weight: 700; letter-spacing: 0.04em;
          color: hsl(215 20% 60%); cursor: pointer; transition: background 0.12s;
        }
        .filter-btn:hover { background: rgba(255,255,255,0.08); color: hsl(210 20% 85%); }
        .dropdown-menu {
          position: absolute; top: calc(100% + 4px); left: 0; z-index: 30;
          background: hsl(220 55% 11%); border: 1px solid rgba(255,255,255,0.1);
          border-radius: 8px; padding: 0.375rem 0; min-width: 160px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.5);
        }
        .dropdown-item {
          display: flex; align-items: center; gap: 0.5rem;
          padding: 0.4rem 0.75rem; font-size: 0.82rem;
          font-family: 'Barlow', sans-serif; color: hsl(215 20% 65%);
          cursor: pointer; transition: background 0.1s;
        }
        .dropdown-item:hover { background: rgba(255,255,255,0.05); color: hsl(210 20% 90%); }
        .dropdown-item input[type=checkbox] { accent-color: hsl(42 100% 55%); }
        .reset-btn {
          display: flex; align-items: center; gap: 0.3rem;
          background: transparent; border: 1px solid rgba(246,164,0,0.2);
          border-radius: 6px; padding: 0.3rem 0.625rem; font-size: 0.8rem;
          font-family: 'Barlow', sans-serif; color: hsl(42 100% 60%); cursor: pointer;
          transition: background 0.12s;
        }
        .reset-btn:hover { background: rgba(246,164,0,0.08); }
      `}</style>
    </div>
  );
}
