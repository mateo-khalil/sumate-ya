/**
 * ClubScheduleView — dashboard calendar built on the shared CalendarGrid base
 *
 * Decision Context:
 * - Refactored to use CalendarGrid so this component shares grid structure, CSS, and
 *   scroll-to-hour behavior with SlotCalendarView (horarios). Eliminates ~120 lines of
 *   duplicated layout/CSS code.
 * - Uses DISPLAY_HOURS (07:00–23:00) from calendar-utils instead of all 24 hours.
 *   Midnight-to-dawn rows contained no club data and added noise to the grid.
 * - slotsMap key: "${dow}-${hour}-${courtId}" for O(1) lookup. Multiple courts can
 *   have slots at the same day+hour; the first is shown as primary, extras as "+N".
 * - Semantic color classes are now distinct per status:
 *     MATCH_OPEN → cal-cell--match-open (yellow)
 *     MATCH_FULL → cal-cell--match-full (orange) — previously both mapped to same class
 *     MATCH_IN_PROGRESS → cal-cell--inprog (blue)
 * - Week nav bar (navSlot): same visual as SlotCalendarView so the Dashboard Calendar
 *   looks identical to the Horarios calendar. onWeekChange callback propagates prev/next
 *   to ClubDashboardView → updateFilters, triggering a new GraphQL fetch.
 *   DashboardFilters still handles court/status filters and quick-select buttons.
 * - Cell click routing:
 *     match slot     → onMatchClick (opens MatchDetailModal)
 *     free slot      → onFreeSlotClick (create/block options panel)
 *     blocked slot   → onBlockedSlotClick (block info panel)
 * - Previously fixed bugs:
 *   - MATCH_OPEN and MATCH_FULL sharing the same CSS class lost semantic information.
 *     Fixed by introducing cal-cell--match-open and cal-cell--match-full.
 *   - buildWeekDays used 'T00:00:00Z' (UTC midnight), shifting displayed column dates
 *     one day back in UTC-3 (May 4 showed as May 3). Fixed by parsing YYYY-MM-DD as
 *     local date components — same fix applied to ClubAgendaView and formatDateNice.
 */

import { useMemo } from 'react';
import { Lock, Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import CalendarGrid, { type CellRenderInfo, type CellRenderResult } from '../calendar/CalendarGrid';
import {
  DISPLAY_HOURS, getMonday, addDays, isSameDay, weekDaysFrom, fmtWeekRange,
} from '../../lib/calendar-utils';
import type { ScheduleSlot, DashboardMatch } from '../../graphql/operations/club-dashboard';

interface Props {
  slots: ScheduleSlot[];
  onMatchClick: (match: DashboardMatch) => void;
  onFreeSlotClick?: (slot: ScheduleSlot) => void;
  onBlockedSlotClick?: (slot: ScheduleSlot) => void;
  startDate?: string;
  endDate?: string;
  onWeekChange?: (startDate: string, endDate: string) => void;
}

function localISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function buildWeekDays(startDateStr?: string, endDateStr?: string): Date[] {
  if (!startDateStr || !endDateStr) return weekDaysFrom(getMonday(new Date()));
  const [sy, sm, sd] = startDateStr.split('-').map(Number);
  const [ey, em, ed] = endDateStr.split('-').map(Number);
  const start = new Date(sy, sm - 1, sd);
  const end = new Date(ey, em - 1, ed);
  const days: Date[] = [];
  const cur = new Date(start);
  while (cur <= end && days.length < 14) {
    days.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

function slotCellClass(slot: ScheduleSlot | undefined, info: CellRenderInfo): string {
  if (info.isPastDay) {
    if (!slot) return 'cal-cell--past-day-free';
    const isBusy = slot.status !== 'AVAILABLE' && slot.status !== 'PAST' && slot.status !== 'INACTIVE';
    return isBusy ? 'cal-cell--past-day-busy' : 'cal-cell--past-day-free';
  }
  if (!slot) return 'cal-cell--empty';

  const map: Record<ScheduleSlot['status'], string> = {
    AVAILABLE: 'cal-cell--avail',
    MATCH_OPEN: 'cal-cell--match-open',
    MATCH_FULL: 'cal-cell--match-full',
    MATCH_IN_PROGRESS: 'cal-cell--inprog',
    MATCH_COMPLETED: 'cal-cell--completed',
    BLOCKED: 'cal-cell--blocked',
    INACTIVE: 'cal-cell--inactive',
    PAST: 'cal-cell--past-day-free',
  };

  const base = map[slot.status] ?? 'cal-cell--empty';
  return info.isPastHour ? `${base} cal-cell--dimmed` : base;
}

export default function ClubScheduleView({
  slots, onMatchClick, onFreeSlotClick, onBlockedSlotClick,
  startDate, endDate, onWeekChange,
}: Props) {
  const today = new Date();
  const nowHour = today.getHours();

  const weekDays = useMemo(() => buildWeekDays(startDate, endDate), [startDate, endDate]);

  // Compute Monday of the current filter week for nav and "Hoy" detection
  const filterMonday = useMemo(() => {
    if (!startDate) return getMonday(today);
    const [y, m, d] = startDate.split('-').map(Number);
    return new Date(y, m - 1, d);
  }, [startDate]);

  const isThisWeek = isSameDay(filterMonday, getMonday(today));

  function navigate(direction: -1 | 1) {
    if (!onWeekChange) return;
    const newMon = addDays(filterMonday, direction * 7);
    onWeekChange(localISO(newMon), localISO(addDays(newMon, 6)));
  }

  function goToToday() {
    if (!onWeekChange) return;
    const mon = getMonday(today);
    onWeekChange(localISO(mon), localISO(addDays(mon, 6)));
  }

  const slotsMap = useMemo(() => {
    const map = new Map<string, ScheduleSlot>();
    for (const slot of slots) {
      const hour = parseInt(slot.startTime.slice(0, 2), 10);
      map.set(`${slot.dayOfWeek}-${hour}-${slot.courtId}`, slot);
    }
    return map;
  }, [slots]);

  const courts = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of slots) { if (!m.has(s.courtId)) m.set(s.courtId, s.courtName); }
    return Array.from(m.entries()).map(([id, name]) => ({ id, name }));
  }, [slots]);

  function renderCell(info: CellRenderInfo): CellRenderResult {
    const { dow, hour, isPastDay } = info;
    const cellSlots = courts
      .map((c) => slotsMap.get(`${dow}-${hour}-${c.id}`))
      .filter(Boolean) as ScheduleSlot[];
    const primary = cellSlots[0];
    const extraCount = cellSlots.length > 1 ? cellSlots.length - 1 : 0;
    const className = slotCellClass(primary, info);

    if (!primary) return { className: 'cal-cell--empty' };

    const hasMatch = !!primary.match;
    const isBlocked = primary.status === 'BLOCKED';
    const isFree = primary.status === 'AVAILABLE';

    let onClick: (() => void) | undefined;
    let isClickable = false;

    if (hasMatch && primary.match) {
      onClick = () => onMatchClick(primary.match!);
      isClickable = true;
    } else if (isBlocked && !isPastDay && onBlockedSlotClick) {
      onClick = () => onBlockedSlotClick(primary);
      isClickable = true;
    } else if (isFree && !isPastDay && onFreeSlotClick) {
      onClick = () => onFreeSlotClick(primary);
      isClickable = true;
    }

    const courtLabel = primary.courtName.length > 10
      ? primary.courtName.slice(0, 9) + '…'
      : primary.courtName;

    const content = (
      <>
        {isBlocked && <Lock size={10} strokeWidth={2.5} className="sched-icon" aria-hidden="true" />}
        {isFree && !isPastDay && onFreeSlotClick && (
          <Plus size={10} strokeWidth={2.5} className="sched-icon sched-icon--faint" aria-hidden="true" />
        )}
        {hasMatch && <span className="sched-pip" aria-hidden="true" />}
        {extraCount > 0 && <span className="sched-extra">+{extraCount}</span>}
        <span className="cal-court-label">{courtLabel}</span>
      </>
    );

    return {
      className, content, onClick, isClickable,
      ariaLabel: `${dow} ${String(hour).padStart(2, '0')}:00 — ${primary.status}`,
    };
  }

  if (!slots.length) {
    return (
      <div style={{ padding: '3rem 1rem', textAlign: 'center', color: 'hsl(var(--muted-foreground))', fontFamily: "'Barlow', sans-serif" }}>
        No hay datos de ocupación para los filtros seleccionados.
      </div>
    );
  }

  const nav = onWeekChange ? (
    <div className="slot-nav">
      <button className="slot-nav-btn" onClick={() => navigate(-1)} aria-label="Semana anterior">
        <ChevronLeft size={16} strokeWidth={2} aria-hidden="true" />
      </button>
      <span className="slot-week-label">{fmtWeekRange(filterMonday)}</span>
      <button className="slot-nav-btn" onClick={() => navigate(1)} aria-label="Semana siguiente">
        <ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
      </button>
      {!isThisWeek && (
        <button className="slot-today-btn" onClick={goToToday}>Hoy</button>
      )}
      <style>{`
        .slot-nav { display:flex; align-items:center; gap:.5rem; padding:.625rem .875rem; border-bottom:1px solid hsl(var(--border)); }
        .slot-nav-btn { background:none; border:1px solid hsl(var(--border)); border-radius:6px; padding:.25rem; color:hsl(var(--muted-foreground)); cursor:pointer; display:inline-flex; transition:background .12s; }
        .slot-nav-btn:hover { background:hsl(var(--muted)/.3); color:hsl(var(--foreground)); }
        .slot-week-label { font-family:'Barlow Condensed',sans-serif; font-size:.82rem; font-weight:700; letter-spacing:.04em; color:hsl(var(--foreground)); }
        .slot-today-btn { background:hsl(var(--primary)/.12); border:1px solid hsl(var(--primary)/.3); border-radius:6px; padding:.2rem .625rem; font-family:'Barlow Condensed',sans-serif; font-size:.7rem; font-weight:700; letter-spacing:.08em; color:hsl(var(--primary)); cursor:pointer; text-transform:uppercase; }
      `}</style>
    </div>
  ) : undefined;

  const legend = (
    <div className="cal-legend">
      {([
        ['cal-led--avail',      'Libre'],
        ['cal-led--match-open', 'Partido abierto'],
        ['cal-led--match-full', 'Partido completo'],
        ['cal-led--inprog',     'En curso'],
        ['cal-led--blocked',    'Bloqueado'],
        ['cal-led--past-free',  'Pasado'],
      ] as const).map(([cls, label]) => (
        <span key={label} className="cal-legend-item">
          <span className={`cal-led ${cls}`} aria-hidden="true" />
          {label}
        </span>
      ))}
      <style>{`
        .sched-icon { position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); color:hsl(var(--destructive-foreground)); }
        .sched-icon--faint { opacity:.22; color:hsl(var(--muted-foreground)); }
        .sched-pip { position:absolute; top:4px; left:4px; width:6px; height:6px; border-radius:50%; background:hsl(42 100% 55%); }
        .sched-extra { position:absolute; bottom:2px; right:4px; font-size:.62rem; font-weight:700; color:hsl(var(--muted-foreground)); font-family:'Barlow Condensed',sans-serif; }
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
