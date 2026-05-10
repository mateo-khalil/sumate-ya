/**
 * DashboardFilters — quick selectors and court/status filters for the dashboard
 *
 * Decision Context:
 * - Simplified: date range inputs and week pagination arrows were removed because
 *   ClubScheduleView and ClubAgendaView now have their own internal "< week >" nav bar
 *   (same as SlotCalendarView in horarios), making the date picker in this toolbar
 *   redundant. Keeping two navigation systems cluttered the layout and diverged visually
 *   from the clean horarios page.
 * - What remains: three quick-select buttons (Hoy / Esta semana / Este mes) that jump
 *   to the relevant week, plus court and status multi-select dropdowns for filtering.
 *   The calendar's internal arrows handle week-by-week navigation from there.
 * - "Este mes" sets startDate to the first day of the month; the calendar nav computes
 *   the Monday of that week and shows it as the initial view.
 * - courtIds and matchStatuses use simple multi-select dropdowns.
 * - Previously fixed bugs:
 *   - "Invalid request body" from empty strings for dates (fixed by converting '' → undefined).
 *   - Date picker week nav duplicated the calendar's internal nav, causing two conflicting
 *     navigation systems. Fixed by removing it from this component entirely.
 */

import { useState } from 'react';
import { Filter, X } from 'lucide-react';
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

function localISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function currentWeek(): { start: string; end: string } {
  const now = new Date();
  const day = now.getDay() || 7;
  const mon = new Date(now);
  mon.setDate(now.getDate() - day + 1);
  mon.setHours(0, 0, 0, 0);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  return { start: localISO(mon), end: localISO(sun) };
}

function currentMonthStart(): { start: string; end: string } {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { start: localISO(first), end: localISO(last) };
}

function todayRange(): { start: string; end: string } {
  const s = localISO(new Date());
  return { start: s, end: s };
}

export default function DashboardFilters({ filters, courts, onChange, onReset }: Props) {
  const [showCourtMenu, setShowCourtMenu] = useState(false);
  const [showStatusMenu, setShowStatusMenu] = useState(false);

  const activeFiltersCount = [filters.courtIds?.length, filters.matchStatuses?.length].filter(Boolean).length;

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
          onClick={() => { const r = todayRange(); onChange({ startDate: r.start, endDate: r.end }); }}
        >
          Hoy
        </button>
        <button
          className="quick-btn"
          onClick={() => { const r = currentWeek(); onChange({ startDate: r.start, endDate: r.end }); }}
        >
          Esta semana
        </button>
        <button
          className="quick-btn"
          onClick={() => { const r = currentMonthStart(); onChange({ startDate: r.start, endDate: r.end }); }}
        >
          Este mes
        </button>
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
                  <input type="checkbox" checked={(filters.courtIds ?? []).includes(c.id)} onChange={() => toggleCourt(c.id)} />
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
                <input type="checkbox" checked={(filters.matchStatuses ?? []).includes(s.value)} onChange={() => toggleStatus(s.value)} />
                {s.label}
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Reset active filters */}
      {activeFiltersCount > 0 && (
        <button className="reset-btn" onClick={onReset} aria-label="Limpiar filtros">
          <X size={13} strokeWidth={2} aria-hidden="true" />
          Limpiar
        </button>
      )}

      <style>{`
        .filters-bar {
          display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;
          padding: 0.625rem 0; margin-bottom: 0.75rem;
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
