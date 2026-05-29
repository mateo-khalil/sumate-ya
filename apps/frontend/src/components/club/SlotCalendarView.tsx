/**
 * SlotCalendarView — horarios weekly calendar, refactored onto the shared CalendarGrid base
 *
 * Decision Context:
 * - Refactored to use CalendarGrid, eliminating the ~130 lines of duplicated grid
 *   structure, CSS class definitions, and scroll-to-hour logic it previously shared
 *   with ClubScheduleView. Both views now have a single source of truth for cell
 *   classes and layout CSS (in CalendarGrid.tsx and calendar-utils.ts).
 * - Navigation (prev/next week) is injected via CalendarGrid's navSlot prop so it
 *   renders inside .cal-wrap without needing a separate wrapper div.
 * - slotsMap key: "${dayOfWeek}-${hour}" — multiple courts map to the same key
 *   (an array), so the checkbox selection and +N extras still work correctly.
 * - Past days: cells are grayed regardless of slot status (isPastDay check fires before
 *   any status-based class). Today's past hours are dimmed at 42% opacity.
 * - Checkbox: rendered inside the cell as an absolute-positioned element so it doesn't
 *   affect the cell's flex layout. stopPropagation prevents triggering onEdit.
 * - Previously fixed bugs:
 *   - Past days incorrectly showed green because only today's past-HOURS were checked.
 *     Fix: isPastDay check on the whole date, applied before slot-status classes.
 *   - Today's future hours weren't visible at full color because past-hour opacity was
 *     applied to ALL of today. Fix: only dim hours where isToday && hour < nowHour.
 *   - `.slot-price` and `.cal-court-label` both lived in the bottom-left corner of the
 *     cell after the CalendarGrid extraction (the shared label was added without moving
 *     the existing price), so prices like "$26000" overlapped court names like
 *     "Cancha 1". Fix: relocate `.slot-price` to the top-left corner with the smaller
 *     font + green color used by AvailableSlotsPicker's `.pk-price`, and hide it on
 *     match-status slots (same rule as the Crear Partido picker, since an occupied
 *     slot isn't bookable so the price has no actionable value there).
 */

import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Lock } from 'lucide-react';
import CalendarGrid, { type CellRenderInfo, type CellRenderResult } from '../calendar/CalendarGrid';
import {
  DISPLAY_HOURS,
  getMonday,
  addDays,
  isSameDay,
  weekDaysFrom,
  fmtWeekRange,
} from '../../lib/calendar-utils';
import type { ManagedClubSlot, BlockSlotInput } from '../../graphql/operations/club-slots';

type SlotStatus = 'available' | 'match' | 'blocked' | 'inactive';

function getSlotStatus(s: ManagedClubSlot): SlotStatus {
  if (!s.isActive) return 'inactive';
  if (s.isBlocked) return 'blocked';
  if (s.hasScheduledMatch) return 'match';
  return 'available';
}

interface Props {
  slots: ManagedClubSlot[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onEdit: (slot: ManagedClubSlot) => void;
  onBlock: (input: BlockSlotInput) => void;
}

export function SlotCalendarView({ slots, selectedIds, onToggleSelect, onEdit }: Props) {
  const today = new Date();
  const nowHour = today.getHours();
  const [weekStart, setWeekStart] = useState<Date>(() => getMonday(today));

  const weekDays = useMemo(() => weekDaysFrom(weekStart), [weekStart]);
  const isThisWeek = isSameDay(weekStart, getMonday(today));

  const slotsMap = useMemo(() => {
    const map = new Map<string, ManagedClubSlot[]>();
    for (const s of slots) {
      const h = parseInt(s.startTime.slice(0, 2), 10);
      const key = `${s.dayOfWeek}-${h}`;
      const arr = map.get(key) ?? [];
      arr.push(s);
      map.set(key, arr);
    }
    return map;
  }, [slots]);

  function renderCell(info: CellRenderInfo): CellRenderResult {
    const { dow, hour, isPastDay, isPastHour } = info;
    const cellSlots = slotsMap.get(`${dow}-${hour}`);
    const primary = cellSlots?.[0];
    const extra = (cellSlots?.length ?? 0) - 1;
    const sel = primary ? selectedIds.has(primary.id) : false;

    if (isPastDay) {
      if (!primary) return { className: 'cal-cell--past-day-free' };
      const busy = primary.hasScheduledMatch || primary.isBlocked;
      return { className: busy ? 'cal-cell--past-day-busy' : 'cal-cell--past-day-free' };
    }

    if (!primary) return { className: 'cal-cell--empty' };

    const status = getSlotStatus(primary);
    const statusMap: Record<SlotStatus, string> = {
      available: 'cal-cell--avail',
      match: 'cal-cell--match-open',
      blocked: 'cal-cell--blocked',
      inactive: 'cal-cell--inactive',
    };

    const base = isPastHour ? `${statusMap[status]} cal-cell--dimmed` : statusMap[status];
    const className = `${base}${sel ? ' cal-cell--sel' : ''}`;

    const content = (
      <>
        <input
          type="checkbox"
          className="slot-chk"
          checked={sel}
          aria-label="Seleccionar slot"
          onClick={(e) => { e.stopPropagation(); onToggleSelect(primary.id); }}
          onChange={() => {}}
        />
        {primary.priceArs != null && status !== 'match' && (
          <span className="slot-price">${primary.priceArs}</span>
        )}
        {status === 'blocked' && (
          <Lock size={10} strokeWidth={2.5} className="slot-icon" aria-hidden="true" />
        )}
        {status === 'match' && <span className="slot-pip" aria-hidden="true" />}
        {extra > 0 && <span className="slot-extra">+{extra}</span>}
        <span className="cal-court-label">{primary.court.name}</span>
      </>
    );

    return {
      className,
      content,
      onClick: () => onEdit(primary),
      isClickable: true,
      ariaLabel: `${dow} ${String(hour).padStart(2, '0')}:00`,
    };
  }

  const nav = (
    <div className="slot-nav">
      <button
        className="slot-nav-btn"
        onClick={() => setWeekStart((d) => addDays(d, -7))}
        aria-label="Semana anterior"
      >
        <ChevronLeft size={16} strokeWidth={2} aria-hidden="true" />
      </button>
      <span className="slot-week-label">{fmtWeekRange(weekStart)}</span>
      <button
        className="slot-nav-btn"
        onClick={() => setWeekStart((d) => addDays(d, 7))}
        aria-label="Semana siguiente"
      >
        <ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
      </button>
      {!isThisWeek && (
        <button
          className="slot-today-btn"
          onClick={() => setWeekStart(getMonday(today))}
        >
          Hoy
        </button>
      )}
      <style>{`
        .slot-nav {
          display: flex; align-items: center; gap: 0.5rem;
          padding: 0.625rem 0.875rem;
          border-bottom: 1px solid hsl(var(--border));
        }
        .slot-nav-btn {
          background: none; border: 1px solid hsl(var(--border)); border-radius: 6px;
          padding: 0.25rem; color: hsl(var(--muted-foreground)); cursor: pointer;
          display: inline-flex; transition: background 0.12s;
        }
        .slot-nav-btn:hover { background: hsl(var(--muted) / 0.3); color: hsl(var(--foreground)); }
        .slot-week-label {
          font-family: 'Barlow Condensed', sans-serif; font-size: 0.82rem; font-weight: 700;
          letter-spacing: 0.04em; color: hsl(var(--foreground));
        }
        .slot-today-btn {
          background: hsl(var(--primary) / 0.12); border: 1px solid hsl(var(--primary) / 0.3);
          border-radius: 6px; padding: 0.2rem 0.625rem;
          font-family: 'Barlow Condensed', sans-serif; font-size: 0.7rem; font-weight: 700;
          letter-spacing: 0.08em; color: hsl(var(--primary)); cursor: pointer; text-transform: uppercase;
        }
      `}</style>
    </div>
  );

  const legend = (
    <div className="cal-legend">
      {([
        ['cal-led--avail',     'Disponible'],
        ['cal-led--match-open','Con partido'],
        ['cal-led--blocked',   'Bloqueado'],
        ['cal-led--past-free', 'Pasado libre'],
        ['cal-led--past-busy', 'Pasado ocupado'],
      ] as const).map(([cls, label]) => (
        <span key={label} className="cal-legend-item">
          <span className={`cal-led ${cls}`} aria-hidden="true" />
          {label}
        </span>
      ))}
      <style>{`
        .slot-chk {
          position: absolute; top: 3px; right: 3px;
          width: 11px; height: 11px; accent-color: hsl(var(--primary)); cursor: pointer;
        }
        /* Top-left corner. Previously was bottom-left which overlapped with
           .cal-court-label (also bottom-left after the shared-grid refactor).
           Mirrors AvailableSlotsPicker's .pk-price corner + color so both
           calendars match the epic #110 criterion ("Se ve igual que calendario
           Crear Partido"). Hidden when status === 'match' (consistent with the
           Crear Partido picker which hides price for occupied slots). */
        .slot-price {
          position: absolute; top: 3px; left: 4px;
          font-family: 'Barlow Condensed', sans-serif; font-size: 0.62rem; font-weight: 700;
          color: hsl(142 70% 55%);
        }
        .slot-icon {
          position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%);
          color: hsl(var(--destructive-foreground));
        }
        .slot-pip {
          position: absolute; top: 4px; left: 4px;
          width: 6px; height: 6px; border-radius: 50%; background: hsl(42 100% 55%);
        }
        .slot-extra {
          position: absolute; bottom: 2px; right: 4px;
          font-size: 0.62rem; font-weight: 700; color: hsl(var(--muted-foreground));
          font-family: 'Barlow Condensed', sans-serif;
        }
      `}</style>
    </div>
  );

  return (
    <CalendarGrid
      weekDays={weekDays}
      hours={DISPLAY_HOURS}
      today={today}
      nowHour={nowHour}
      renderCell={renderCell}
      navSlot={nav}
      legendSlot={legend}
    />
  );
}
