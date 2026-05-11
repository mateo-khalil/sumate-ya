/**
 * CalendarGrid — reusable weekly grid base component
 *
 * Decision Context:
 * - Extracted to eliminate the structural duplication between ClubScheduleView
 *   (dashboard) and SlotCalendarView (horarios). Both needed the same 7-column ×
 *   N-row grid with identical header, time-column, CSS, and scroll-to-hour behavior.
 * - renderCell prop pattern: each consumer passes a function that receives cell
 *   metadata (date, dow, hour, isToday, isPastDay, isPastHour) and returns
 *   { className, content?, onClick?, isClickable?, ariaLabel? }. This separates grid
 *   structure from cell business logic without prop-drilling or React context.
 * - navSlot: optional ReactNode rendered inside .cal-wrap before the header row.
 *   SlotCalendarView uses this for its prev/next-week navigation bar.
 * - legendSlot: optional ReactNode rendered after the grid body (below the rows).
 * - Today column: day header gets cal-day-head--today + orange tint. Each body cell
 *   in the today column gets cal-col--today (subtle background) so today is scannable
 *   even when the header has scrolled out of view horizontally.
 * - Scroll: bodyRef auto-scrolls to SCROLL_TO_HOUR on mount. The offset formula is
 *   (SCROLL_TO_HOUR - firstHour) * ROW_HEIGHT_PX so it works correctly whether the
 *   hours array starts at 0 (legacy all-day) or 7 (DISPLAY_HOURS).
 * - 60px time column is fixed; day columns share remaining width equally via 1fr.
 * - cal-time--now highlights the current hour label in orange for at-a-glance awareness.
 * - Previously fixed bugs: none relevant (new extracted component).
 */

import { useRef, useEffect, type ReactNode } from 'react';
import {
  SCROLL_TO_HOUR,
  ROW_HEIGHT_PX,
  DOW_ABBR,
  isSameDay,
  isBeforeToday,
  fmtDayNum,
  dowFromDate,
  type DayOfWeek,
} from '../../lib/calendar-utils';

export interface CellRenderInfo {
  date: Date;
  dow: DayOfWeek;
  hour: number;
  isToday: boolean;
  isPastDay: boolean;
  isPastHour: boolean;
}

export interface CellRenderResult {
  /** CSS modifier class for the cell background (e.g. "cal-cell--avail") */
  className: string;
  content?: ReactNode;
  onClick?: () => void;
  /** Whether to add role="button" and tabIndex=0 */
  isClickable?: boolean;
  ariaLabel?: string;
}

interface Props {
  weekDays: Date[];
  hours: number[];
  today: Date;
  nowHour: number;
  renderCell: (info: CellRenderInfo) => CellRenderResult;
  /** Optional nav bar rendered above the day-header row (inside .cal-wrap) */
  navSlot?: ReactNode;
  /** Optional legend rendered below the grid body */
  legendSlot?: ReactNode;
}

export default function CalendarGrid({
  weekDays,
  hours,
  today,
  nowHour,
  renderCell,
  navSlot,
  legendSlot,
}: Props) {
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (bodyRef.current && hours.length > 0) {
      const firstHour = hours[0]!;
      bodyRef.current.scrollTop = Math.max(0, SCROLL_TO_HOUR - firstHour) * ROW_HEIGHT_PX;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const cols = weekDays.length;
  const gridCols = `60px repeat(${cols}, 1fr)`;

  return (
    <div className="cal-wrap">
      {navSlot}

      {/* cal-scroll-area: on mobile this becomes the horizontal scroll container
          so header and body columns stay aligned when scrolling left/right */}
      <div className="cal-scroll-area">

      {/* Day headers */}
      <div className="cal-header-row" style={{ gridTemplateColumns: gridCols }}>
        <div className="cal-corner" />
        {weekDays.map((d, i) => {
          const isToday = isSameDay(d, today);
          const isPastDay = isBeforeToday(d, today);
          const dow = dowFromDate(d);
          return (
            <div
              key={i}
              className={`cal-day-head${isToday ? ' cal-day-head--today' : ''}${isPastDay ? ' cal-day-head--past' : ''}`}
            >
              <span className="cal-day-name">{DOW_ABBR[dow]}</span>
              <span
                className={`cal-day-num${isToday ? ' cal-day-num--today' : ''}${isPastDay ? ' cal-day-num--past' : ''}`}
              >
                {fmtDayNum(d)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Grid body */}
      <div className="cal-body" ref={bodyRef}>
        {hours.map((h) => (
          <div key={h} className="cal-row" style={{ gridTemplateColumns: gridCols }}>
            <div className={`cal-time${h === nowHour ? ' cal-time--now' : ''}`}>
              {String(h).padStart(2, '0')}:00
            </div>
            {weekDays.map((d, colIdx) => {
              const isToday = isSameDay(d, today);
              const isPastDay = isBeforeToday(d, today);
              const dow = dowFromDate(d);
              const info: CellRenderInfo = {
                date: d, dow, hour: h,
                isToday, isPastDay,
                isPastHour: isToday && h < nowHour,
              };
              const cell = renderCell(info);
              const colTint = isToday ? ' cal-col--today' : isPastDay ? ' cal-col--past' : '';
              return (
                <div
                  key={colIdx}
                  className={`cal-cell ${cell.className}${colTint}`}
                  role={cell.isClickable ? 'button' : undefined}
                  tabIndex={cell.isClickable ? 0 : undefined}
                  onClick={cell.onClick}
                  onKeyDown={
                    cell.onClick
                      ? (e) => { if (e.key === 'Enter' || e.key === ' ') cell.onClick!(); }
                      : undefined
                  }
                  aria-label={cell.ariaLabel}
                >
                  {cell.content}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      </div>{/* end cal-scroll-area */}

      {legendSlot}

      <style>{`
        .cal-wrap {
          font-family: 'Barlow', sans-serif;
          border: 1px solid hsl(var(--border));
          border-radius: 0.5rem;
          background-color: hsl(var(--card));
          overflow: hidden;
        }
        .cal-header-row {
          display: grid;
          border-bottom: 1px solid hsl(var(--border));
          position: sticky;
          top: 0;
          z-index: 2;
          background: hsl(var(--card));
        }
        .cal-corner { border-right: 1px solid hsl(var(--border)); }
        .cal-day-head {
          text-align: center;
          padding: 0.5rem 0.25rem;
          border-right: 1px solid hsl(var(--border));
        }
        .cal-day-head:last-child { border-right: none; }
        .cal-day-head--today { background-color: hsl(var(--primary) / 0.08); }
        .cal-day-head--past { opacity: 0.6; }
        .cal-day-name {
          display: block;
          font-size: 0.72rem;
          font-weight: 700;
          color: hsl(var(--muted-foreground));
          font-family: 'Barlow Condensed', sans-serif;
          letter-spacing: 0.06em;
        }
        .cal-day-num {
          font-size: 0.8rem;
          font-weight: 500;
          color: hsl(var(--foreground));
        }
        .cal-day-num--today {
          color: hsl(var(--primary-foreground));
          background-color: hsl(var(--primary));
          border-radius: 50%;
          padding: 2px 5px;
          font-weight: 700;
        }
        .cal-day-num--past { color: hsl(var(--muted-foreground)); }
        .cal-body { max-height: 68vh; overflow-y: auto; }
        .cal-row {
          display: grid;
          min-height: 52px;
        }
        .cal-row:not(:last-child) { border-bottom: 1px solid hsl(var(--border) / 0.4); }
        .cal-time {
          font-family: 'Barlow Condensed', sans-serif;
          font-size: 0.68rem;
          font-weight: 600;
          text-align: center;
          color: hsl(var(--muted-foreground));
          border-right: 1px solid hsl(var(--border));
          padding: 0.75rem 0;
          line-height: 1;
        }
        .cal-time--now {
          color: hsl(var(--primary));
          font-weight: 700;
        }
        .cal-cell {
          position: relative;
          border-right: 1px solid hsl(var(--border) / 0.6);
          transition: filter 0.12s;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 52px;
        }
        /* Shared court label — used by ClubScheduleView, SlotCalendarView, AvailableSlotsPicker */
        .cal-court-label {
          position: absolute; bottom: 4px; left: 5px; right: 5px;
          font-family: 'Barlow Condensed', sans-serif; font-size: 0.68rem; font-weight: 700;
          letter-spacing: 0.04em; color: inherit; white-space: nowrap;
          overflow: hidden; text-overflow: ellipsis; line-height: 1;
        }
        .cal-cell:last-child { border-right: none; }
        .cal-cell[role="button"] { cursor: pointer; }
        .cal-cell[role="button"]:hover { filter: brightness(1.18); }
        .cal-col--today { background-color: hsl(var(--primary) / 0.025); }
        .cal-col--past { opacity: 0.85; }
        /* ── Status modifier classes ── */
        .cal-cell--empty { background-color: transparent; }
        .cal-cell--avail { background-color: hsl(142 71% 45% / 0.14); }
        .cal-cell--match-open { background-color: hsl(42 100% 55% / 0.18); }
        .cal-cell--match-full { background-color: hsl(28 100% 55% / 0.2); }
        .cal-cell--inprog { background-color: hsl(216 85% 55% / 0.22); }
        .cal-cell--completed { background-color: hsl(var(--muted) / 0.2); }
        .cal-cell--blocked { background-color: hsl(var(--destructive) / 0.16); }
        .cal-cell--inactive { background-color: hsl(var(--muted) / 0.12); }
        .cal-cell--past-day-free { background-color: hsl(var(--muted) / 0.18); }
        .cal-cell--past-day-busy {
          background: repeating-linear-gradient(
            45deg,
            hsl(var(--muted) / 0.18) 0 5px,
            hsl(var(--muted) / 0.28) 5px 10px
          );
        }
        .cal-cell--dimmed { opacity: 0.42; }
        .cal-cell--sel {
          outline: 2px solid hsl(var(--primary));
          outline-offset: -2px;
        }
        /* ── Legend (shared structure) ── */
        .cal-legend {
          display: flex;
          flex-wrap: wrap;
          gap: 0.875rem;
          padding: 0.625rem 1rem;
          border-top: 1px solid hsl(var(--border));
          background: hsl(var(--card));
        }
        .cal-legend-item {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          font-size: 0.71rem;
          color: hsl(var(--muted-foreground));
          font-family: 'Barlow', sans-serif;
        }
        .cal-led {
          width: 11px;
          height: 11px;
          border-radius: 3px;
          flex-shrink: 0;
        }
        .cal-led--avail { background: hsl(142 71% 45% / 0.22); border: 1px solid hsl(142 71% 45% / 0.55); }
        .cal-led--match-open { background: hsl(42 100% 55% / 0.22); border: 1px solid hsl(42 100% 55% / 0.55); }
        .cal-led--match-full { background: hsl(28 100% 55% / 0.22); border: 1px solid hsl(28 100% 55% / 0.55); }
        .cal-led--inprog { background: hsl(216 85% 55% / 0.25); border: 1px solid hsl(216 85% 65% / 0.55); }
        .cal-led--blocked { background: hsl(var(--destructive) / 0.2); border: 1px solid hsl(var(--destructive) / 0.55); }
        .cal-led--past-free { background: hsl(var(--muted) / 0.22); border: 1px solid hsl(var(--muted-foreground) / 0.35); }
        .cal-led--past-busy {
          background: repeating-linear-gradient(45deg, hsl(var(--muted)/0.2) 0 4px, hsl(var(--muted)/0.32) 4px 8px);
          border: 1px solid hsl(var(--muted-foreground) / 0.35);
        }
        /* ── Mobile: horizontal scroll + sticky time column ──────── */
        /* On mobile the 7-column grid exceeds the screen width.
         * cal-scroll-area becomes the horizontal scroll container so
         * header and body rows scroll together and stay aligned.
         * The time column (left) and corner are made sticky-left so
         * the hour labels remain visible when scrolling right.
         * Previously fixed bugs: none relevant (new responsive feature). */
        .cal-scroll-area { } /* desktop: transparent wrapper */
        @media (max-width: 767px) {
          .cal-scroll-area {
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
          }
          /* Minimum column width prevents day columns from being too narrow */
          .cal-day-head { min-width: 74px; }
          .cal-cell     { min-width: 74px; }
          /* Sticky time column so hours stay visible when scrolling right */
          .cal-time {
            position: sticky;
            left: 0;
            z-index: 2;
            background: hsl(var(--card));
          }
          /* Sticky corner (top-left intersection of header + time column) */
          .cal-corner {
            position: sticky;
            left: 0;
            z-index: 4;
            background: hsl(var(--card));
          }
          /* Header stays at top within the scroll area */
          .cal-header-row { z-index: 3; }
          /* Reduce legend text on very small screens */
          .cal-legend { gap: 0.5rem; padding: 0.5rem 0.75rem; }
          .cal-legend-item { font-size: 0.65rem; }
        }
      `}</style>
    </div>
  );
}
