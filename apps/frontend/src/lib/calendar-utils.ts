/**
 * calendar-utils — shared date and display helpers for weekly grid calendars
 *
 * Decision Context:
 * - Extracted from ClubScheduleView and SlotCalendarView to eliminate the duplicated
 *   date helpers (getMonday, addDays, isSameDay, isBeforeToday, etc.) that both
 *   components had defined identically.
 * - DISPLAY_HOURS restricts the visible range to 07:00–23:00 (the club operational
 *   window) instead of all 24 hours. Midnight-to-dawn rows contain no club data and
 *   add visual noise that makes the grid harder to scan.
 * - JS_TO_DOW: JavaScript's Date.getDay() returns 0 for Sunday. DB dayOfWeek strings
 *   use lowercase English (monday, tuesday…). This array maps JS index → DB string.
 * - DOW_ABBR: canonical Spanish 3-letter abbreviations for calendar column headers —
 *   LUN/MAR/MIE/JUE/VIE/SAB/DOM — consistent with the existing horarios calendar.
 * - All date helpers use LOCAL time (not UTC) for display logic. Day header labels,
 *   "is today?", and "is past?" checks must reflect the user's local clock.
 *   ScheduleSlot.startTime is stored as a local HH:mm string from the backend.
 * - ROW_HEIGHT_PX: auto-scroll calculation depends on this value matching the min-height
 *   defined in CalendarGrid's .cal-row CSS rule (38px). Update both together.
 * - Previously fixed bugs: none relevant (new utility file).
 */

export const JS_TO_DOW = [
  'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
] as const;

export type DayOfWeek = (typeof JS_TO_DOW)[number];

/** Spanish 3-letter abbreviations used in calendar column headers */
export const DOW_ABBR: Record<DayOfWeek, string> = {
  monday: 'LUN', tuesday: 'MAR', wednesday: 'MIE',
  thursday: 'JUE', friday: 'VIE', saturday: 'SAB', sunday: 'DOM',
};

/** Hours rendered in the weekly grid (07:00–23:00 = club operational window) */
export const DISPLAY_HOURS = Array.from({ length: 17 }, (_, i) => i + 7);

/** Pixel height per calendar row — must match .cal-row min-height in CalendarGrid */
export const ROW_HEIGHT_PX = 52;

/** The hour to auto-scroll into view on calendar mount */
export const SCROLL_TO_HOUR = 7;

/** Returns the Monday of the week containing `d` (local time) */
export function getMonday(d: Date): Date {
  const c = new Date(d);
  const day = c.getDay() || 7; // treat Sunday (0) as 7 so Mon–Sun range works
  c.setDate(c.getDate() - day + 1);
  c.setHours(0, 0, 0, 0);
  return c;
}

/** Returns a new Date that is `n` days after `d` (local time) */
export function addDays(d: Date, n: number): Date {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}

/** True if `a` and `b` represent the same calendar day (local time) */
export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** True if `d` is strictly before today, ignoring time-of-day */
export function isBeforeToday(d: Date, today: Date): boolean {
  const dn = new Date(d); dn.setHours(0, 0, 0, 0);
  const tn = new Date(today); tn.setHours(0, 0, 0, 0);
  return dn < tn;
}

/** Format a date as "day/month" for column sub-headers, e.g. "4/5" */
export function fmtDayNum(d: Date): string {
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

/** Format a week range label, e.g. "4 – 10 May 2026" */
export function fmtWeekRange(mon: Date): string {
  const sun = addDays(mon, 6);
  const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  if (mon.getMonth() === sun.getMonth()) {
    return `${mon.getDate()} – ${sun.getDate()} ${months[sun.getMonth()]} ${sun.getFullYear()}`;
  }
  return `${mon.getDate()} ${months[mon.getMonth()]} – ${sun.getDate()} ${months[sun.getMonth()]} ${sun.getFullYear()}`;
}

/** Returns the dayOfWeek DB string (e.g. "monday") for a Date */
export function dowFromDate(d: Date): DayOfWeek {
  return JS_TO_DOW[d.getDay()];
}

/** Returns an array of `count` consecutive dates starting from `start` */
export function weekDaysFrom(start: Date, count = 7): Date[] {
  return Array.from({ length: count }, (_, i) => addDays(start, i));
}
