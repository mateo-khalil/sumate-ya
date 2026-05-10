/**
 * ClubAgendaView — weekly CalendarGrid view of scheduled matches for the dashboard
 *
 * Decision Context:
 * - Refactored from a chronological list to a weekly CalendarGrid so the Agenda tab
 *   has the same visual format as the Crear Partido picker and the Calendar tab.
 *   "Se ve igual que calendario Crear Partido" — UX epic criteria.
 * - Complementary to ClubScheduleView (Calendar tab): Calendar shows ALL slot states
 *   (available, blocked, occupied, inactive); Agenda shows ONLY scheduled matches,
 *   color-coded by match status. The two tabs answer different questions:
 *     Calendar → "What is the occupancy of my courts?"
 *     Agenda   → "What matches are happening and what's their status?"
 * - Date alignment: weekDays derived from startDate prop (Monday of that week, local
 *   time). No own navigation — the DashboardFilters controls the date range.
 * - Match indexing: uses local date + local hour from scheduledAt timestamp so match
 *   cells align with the correct column/row in the user's timezone.
 * - Multiple matches at the same hour/day: primary shown, rest as "+N" badge.
 * - Status colors mirror ClubScheduleView for visual consistency across dashboard tabs.
 * - Previously fixed bugs:
 *   - Previous list view used new Date(iso + 'T00:00:00Z') for date headers, causing
 *     off-by-one dates in UTC-3. Grid uses local Date parsing throughout.
 */

import { useMemo } from 'react';
import CalendarGrid, { type CellRenderInfo, type CellRenderResult } from '../calendar/CalendarGrid';
import {
  DISPLAY_HOURS,
  getMonday,
  weekDaysFrom,
} from '../../lib/calendar-utils';
import type { DashboardMatch } from '../../graphql/operations/club-dashboard';
import { FORMAT_LABELS, STATUS_LABELS } from '../../graphql/operations/club-dashboard';

interface Props {
  matches: DashboardMatch[];
  onMatchClick: (match: DashboardMatch) => void;
  startDate?: string;
}

function buildWeekDays(startDate?: string): Date[] {
  if (!startDate) return weekDaysFrom(getMonday(new Date()));
  // Parse as LOCAL date components to avoid UTC-midnight shifting the date in UTC-3.
  const [year, month, day] = startDate.split('-').map(Number);
  return weekDaysFrom(getMonday(new Date(year, month - 1, day)));
}

function localDateISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function matchStatusClass(status: DashboardMatch['status']): string {
  const map: Record<DashboardMatch['status'], string> = {
    OPEN: 'cal-cell--match-open',
    FULL: 'cal-cell--match-full',
    IN_PROGRESS: 'cal-cell--inprog',
    COMPLETED: 'cal-cell--completed',
    CANCELLED: 'cal-cell--inactive',
  };
  return map[status] ?? 'cal-cell--match-open';
}

export default function ClubAgendaView({ matches, onMatchClick, startDate }: Props) {
  const today = new Date();
  const nowHour = today.getHours();
  const weekDays = useMemo(() => buildWeekDays(startDate), [startDate]);

  // Index matches by "YYYY-MM-DD-HH" using LOCAL date/time
  const matchesMap = useMemo(() => {
    const map = new Map<string, DashboardMatch[]>();
    for (const m of matches) {
      const dt = new Date(m.scheduledAt);
      const key = `${localDateISO(dt)}-${dt.getHours()}`;
      const arr = map.get(key) ?? [];
      arr.push(m);
      map.set(key, arr);
    }
    return map;
  }, [matches]);

  function renderCell(info: CellRenderInfo): CellRenderResult {
    const { date, hour, isPastDay } = info;
    const dateISO = localDateISO(date);
    const cellMatches = matchesMap.get(`${dateISO}-${hour}`) ?? [];
    const primary = cellMatches[0];
    const extraCount = cellMatches.length - 1;

    if (isPastDay || !primary) {
      return { className: isPastDay ? 'cal-cell--past-day-free' : 'cal-cell--empty' };
    }

    const isPastHour = info.isToday && hour < nowHour;
    const base = matchStatusClass(primary.status);
    const className = isPastHour ? `${base} cal-cell--dimmed` : base;

    const content = (
      <>
        <span className="ag-format">{FORMAT_LABELS[primary.format]}</span>
        <span className="ag-cap">{primary.participantCount}/{primary.capacity}</span>
        {extraCount > 0 && <span className="ag-extra">+{extraCount}</span>}
      </>
    );

    return {
      className,
      content,
      onClick: () => onMatchClick(primary),
      isClickable: true,
      ariaLabel: `${primary.courtName ?? ''} ${String(hour).padStart(2, '0')}:00 — ${STATUS_LABELS[primary.status]}`,
    };
  }

  const legend = (
    <div className="cal-legend">
      {([
        ['cal-led--match-open', 'Abierto'],
        ['cal-led--match-full', 'Completo'],
        ['cal-led--inprog',     'En curso'],
        ['cal-led--completed',  'Finalizado'],
        ['cal-led--past-free',  'Sin partidos'],
      ] as const).map(([cls, label]) => (
        <span key={label} className="cal-legend-item">
          <span className={`cal-led ${cls}`} aria-hidden="true" />
          {label}
        </span>
      ))}
      <style>{`
        .ag-format {
          position: absolute; bottom: 3px; left: 5px; right: 5px;
          font-family: 'Barlow Condensed', sans-serif; font-size: 0.66rem; font-weight: 700;
          letter-spacing: 0.04em; color: inherit; white-space: nowrap;
          overflow: hidden; text-overflow: ellipsis;
        }
        .ag-cap {
          position: absolute; top: 3px; right: 4px;
          font-family: 'Barlow Condensed', sans-serif; font-size: 0.62rem;
          font-weight: 700; color: inherit; opacity: 0.8;
        }
        .ag-extra {
          position: absolute; top: 3px; left: 4px;
          font-family: 'Barlow Condensed', sans-serif; font-size: 0.62rem;
          font-weight: 700; color: hsl(var(--muted-foreground));
        }
        .cal-led--completed { background: hsl(var(--muted)/.25); border: 1px solid hsl(var(--muted-foreground)/.35); }
      `}</style>
    </div>
  );

  if (!matches.length) {
    return (
      <div style={{ padding: '3rem 1rem', textAlign: 'center', color: 'hsl(var(--muted-foreground))', fontFamily: "'Barlow', sans-serif" }}>
        No hay partidos para el rango seleccionado.
      </div>
    );
  }

  return (
    <CalendarGrid
      weekDays={weekDays}
      hours={DISPLAY_HOURS}
      today={today}
      nowHour={nowHour}
      renderCell={renderCell}
      legendSlot={legend}
    />
  );
}
