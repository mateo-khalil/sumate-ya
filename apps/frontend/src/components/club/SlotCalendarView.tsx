/**
 * SlotCalendarView — dated weekly calendar for club slot management
 *
 * Decision Context:
 * - Dated columns: each column carries a real calendar date so the admin knows exactly
 *   which Monday/Tuesday they're looking at.
 * - Past days (before today): ALL cells turn gray regardless of slot status.
 *   Shade distinction — gray-free (was available) vs gray-busy (had match/block) —
 *   lets the admin see historical occupancy at a glance.
 * - Today's past hours: the slot still shows its real status (green/amber/red) but at
 *   50% opacity so it reads as "already happened". Future hours today show full colors.
 * - Today column: orange-tinted header + subtle column background. Scroll auto-jumps to
 *   07:00 on mount so midnight dead-time is hidden.
 * - Navigation: prev/next week arrows. "Hoy" button appears when not on current week.
 * - Previously fixed bugs:
 *   - Past days incorrectly showed green because only today's past-HOURS were checked.
 *     Fix: isPastDay check on the whole date, applied before slot-status classes.
 *   - Today's future hours weren't visible because past-hour opacity (0.35) was applied
 *     to ALL of today when the test ran late at night. Fix: only dim past hours, show
 *     full color for future hours.
 */

import { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Lock } from 'lucide-react';
import type { ManagedClubSlot, BlockSlotInput } from '../../graphql/operations/club-slots';
import { DAY_OF_WEEK_LABELS, DAY_ORDER } from '../../graphql/operations/club-slots';

// ─────────────────────────────────────────────
// Date helpers
// ─────────────────────────────────────────────

const JS_TO_DOW = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];

function getMonday(d: Date): Date {
  const c   = new Date(d);
  const day = c.getDay() || 7;
  c.setDate(c.getDate() - day + 1);
  c.setHours(0, 0, 0, 0);
  return c;
}

function addDays(d: Date, n: number): Date {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear()
      && a.getMonth()    === b.getMonth()
      && a.getDate()     === b.getDate();
}

/** Returns true if `d` is strictly before today (ignoring time) */
function isBeforeToday(d: Date, today: Date): boolean {
  const dn = new Date(d); dn.setHours(0, 0, 0, 0);
  const tn = new Date(today); tn.setHours(0, 0, 0, 0);
  return dn < tn;
}

function fmtWeekRange(mon: Date): string {
  const sun = addDays(mon, 6);
  const mo  = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  if (mon.getMonth() === sun.getMonth())
    return `${mon.getDate()} – ${sun.getDate()} ${mo[sun.getMonth()]} ${sun.getFullYear()}`;
  return `${mon.getDate()} ${mo[mon.getMonth()]} – ${sun.getDate()} ${mo[sun.getMonth()]} ${sun.getFullYear()}`;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const SCROLL_TO_HOUR = 7;

// ─────────────────────────────────────────────
// Cell class logic (centralised)
// ─────────────────────────────────────────────

type SlotStatus = 'available' | 'match' | 'blocked' | 'inactive';

function getSlotStatus(s: ManagedClubSlot): SlotStatus {
  if (!s.isActive)          return 'inactive';
  if (s.isBlocked)          return 'blocked';
  if (s.hasScheduledMatch)  return 'match';
  return 'available';
}

/**
 * Returns the CSS modifier class for a calendar cell.
 * Priority: past-day > today-past-hour > normal status > empty
 */
function cellClass(
  slot: ManagedClubSlot | undefined,
  date: Date,
  hour: number,
  today: Date,
  nowHour: number,
  isToday: boolean,
): string {
  const pastDay  = isBeforeToday(date, today);
  const pastHour = isToday && hour < nowHour;

  if (pastDay) {
    if (!slot) return 'cal-cell--past-day-free';
    const busy = slot.hasScheduledMatch || slot.isBlocked;
    return busy ? 'cal-cell--past-day-busy' : 'cal-cell--past-day-free';
  }

  if (!slot) return 'cal-cell--empty';

  const status = getSlotStatus(slot);
  const map: Record<SlotStatus, string> = {
    available: 'cal-cell--avail',
    match:     'cal-cell--match',
    blocked:   'cal-cell--blocked',
    inactive:  'cal-cell--inactive',
  };

  return pastHour ? `${map[status]} cal-cell--dimmed` : map[status];
}

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

interface Props {
  slots: ManagedClubSlot[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onEdit: (slot: ManagedClubSlot) => void;
  onBlock: (input: BlockSlotInput) => void;
}

export function SlotCalendarView({ slots, selectedIds, onToggleSelect, onEdit }: Props) {
  const today   = new Date();
  const nowHour = today.getHours();
  const [weekStart, setWeekStart] = useState<Date>(() => getMonday(today));
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = SCROLL_TO_HOUR * 38;
    }
  }, []);

  const weekDays    = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const isThisWeek  = isSameDay(weekStart, getMonday(today));

  // Build dayOfWeek+hour → slot[] lookup
  const map = new Map<string, ManagedClubSlot[]>();
  for (const s of slots) {
    const h   = parseInt(s.startTime.slice(0, 2), 10);
    const key = `${s.dayOfWeek}-${h}`;
    const arr = map.get(key) ?? [];
    arr.push(s);
    map.set(key, arr);
  }

  return (
    <div className="cal-wrap">

      {/* ── Nav bar ─────────────────────────── */}
      <div className="cal-nav">
        <button
          className="cal-nav-btn"
          onClick={() => setWeekStart(d => addDays(d, -7))}
          aria-label="Semana anterior"
        >
          <ChevronLeft size={16} strokeWidth={2} aria-hidden="true" />
        </button>
        <span className="cal-week-label">{fmtWeekRange(weekStart)}</span>
        <button
          className="cal-nav-btn"
          onClick={() => setWeekStart(d => addDays(d, 7))}
          aria-label="Semana siguiente"
        >
          <ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
        </button>
        {!isThisWeek && (
          <button className="cal-today-btn" onClick={() => setWeekStart(getMonday(today))}>
            Hoy
          </button>
        )}
      </div>

      {/* ── Day headers ─────────────────────── */}
      <div className="cal-header-row">
        <div className="cal-corner" />
        {weekDays.map((d, i) => {
          const isToday   = isSameDay(d, today);
          const isPastDay = isBeforeToday(d, today);
          const dow       = DAY_ORDER[i];
          return (
            <div
              key={i}
              className={`cal-day-head${isToday ? ' cal-day-head--today' : ''}${isPastDay ? ' cal-day-head--past' : ''}`}
            >
              <span className="cal-day-name">
                {(DAY_OF_WEEK_LABELS[dow] ?? dow).slice(0, 3).toUpperCase()}
              </span>
              <span className={`cal-day-num${isToday ? ' cal-day-num--today' : ''}${isPastDay ? ' cal-day-num--past' : ''}`}>
                {d.getDate()}/{d.getMonth() + 1}
              </span>
            </div>
          );
        })}
      </div>

      {/* ── Body ────────────────────────────── */}
      <div className="cal-body" ref={bodyRef}>
        {HOURS.map((h) => (
          <div key={h} className="cal-row">
            <div className="cal-time">{String(h).padStart(2,'0')}:00</div>

            {weekDays.map((d, colIdx) => {
              const isToday   = isSameDay(d, today);
              const isPastDay = isBeforeToday(d, today);
              const dow       = JS_TO_DOW[d.getDay()];
              const cellSlots = map.get(`${dow}-${h}`);
              const primary   = cellSlots?.[0];
              const extra     = (cellSlots?.length ?? 0) - 1;
              const sel       = primary ? selectedIds.has(primary.id) : false;

              const modClass = cellClass(primary, d, h, today, nowHour, isToday);
              const colCls   = isToday ? ' cal-col--today' : isPastDay ? ' cal-col--past' : '';

              return (
                <div
                  key={colIdx}
                  role={primary && !isPastDay ? 'button' : undefined}
                  tabIndex={primary && !isPastDay ? 0 : undefined}
                  className={`cal-cell ${modClass}${sel ? ' cal-cell--sel' : ''}${colCls}`}
                  onClick={primary && !isPastDay ? () => onEdit(primary) : undefined}
                  onKeyDown={primary && !isPastDay ? (e) => e.key === 'Enter' && onEdit(primary) : undefined}
                  aria-label={primary ? `${dow} ${String(h).padStart(2,'0')}:00` : undefined}
                >
                  {primary && !isPastDay && (
                    <input
                      type="checkbox"
                      className="cal-chk"
                      checked={sel}
                      aria-label="Seleccionar"
                      onClick={(e) => { e.stopPropagation(); onToggleSelect(primary.id); }}
                      onChange={() => {}}
                    />
                  )}
                  {primary && !isPastDay && primary.priceArs != null && (
                    <span className="cal-price">$U{primary.priceArs}</span>
                  )}
                  {primary && !isPastDay && getSlotStatus(primary) === 'blocked' && (
                    <Lock size={10} strokeWidth={2.5} className="cal-icon" aria-hidden="true" />
                  )}
                  {primary && !isPastDay && getSlotStatus(primary) === 'match' && (
                    <span className="cal-match-pip" aria-hidden="true" />
                  )}
                  {extra > 0 && !isPastDay && (
                    <span className="cal-extra">+{extra}</span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* ── Legend ──────────────────────────── */}
      <div className="cal-legend">
        {([
          ['cal-led--avail',    'Disponible'],
          ['cal-led--match',    'Con partido'],
          ['cal-led--blocked',  'Bloqueado'],
          ['cal-led--past-free','Pasado libre'],
          ['cal-led--past-busy','Pasado ocupado'],
        ] as const).map(([cls, label]) => (
          <span key={label} className="cal-legend-item">
            <span className={`cal-led ${cls}`} aria-hidden="true" />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
