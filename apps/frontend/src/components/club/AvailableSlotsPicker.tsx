/**
 * AvailableSlotsPicker — Step 1 of the club match wizard: weekly calendar slot picker
 *
 * Decision Context:
 * - View: uses CalendarGrid (same base as ClubScheduleView / SlotCalendarView) so the
 *   admin sees a 7-column × 17-row weekly grid instead of a scrollable card list.
 *   Consistency with the horarios and dashboard calendars reduces cognitive overhead.
 * - 15-minute grace period: a slot is bookable if `now < slotStart + 15 min`. This lets
 *   the admin create a match for a slot that already started (e.g., 14:10 → 14:00 slot
 *   is still selectable because 14:15 > 14:10). After 14:15 the slot is shown as past.
 * - Date range: defaults to the CURRENT week (Mon–Sun) including today, not from tomorrow.
 *   Today's past slots are dimmed individually via grace-period check, not the whole day.
 * - Past days (< today): entire column is grayed, no cells are clickable.
 * - Multi-court same hour: primary court shown; extra count displayed as "+N" badge.
 * - Selected cell: gold outline + tinted background (distinct from green "available").
 * - hasMatch cell: yellow/match-open style, not clickable.
 * - Empty cell (no slot): transparent.
 * - Previously fixed bugs:
 *   - defaultRange started from tomorrow, hiding today's bookable future slots.
 *   - No time-of-day filtering: past-hour slots on today remained selectable.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Lock, MapPin, Loader2 } from 'lucide-react';
import CalendarGrid, { type CellRenderInfo, type CellRenderResult } from '../calendar/CalendarGrid';
import {
  DISPLAY_HOURS, getMonday, addDays, isSameDay, weekDaysFrom, fmtWeekRange,
} from '../../lib/calendar-utils';
import type { ClubMatchSlotOccurrence } from '../../graphql/operations/club-match';
import { AVAILABLE_SLOTS_QUERY } from '../../graphql/operations/club-match';

interface Props {
  accessToken: string;
  prefillSlotId?: string;
  prefillDate?: string;
  onSelect: (occurrence: ClubMatchSlotOccurrence) => void;
}

const BACKEND_GQL = '/api/graphql-auth';

// ISO date string from a local Date
function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * A slot is bookable if now is before slotStart + 15 min grace period.
 * Ignores hasMatch — that check is done separately.
 */
function isWithinGracePeriod(occ: ClubMatchSlotOccurrence, now: Date): boolean {
  const [hh, mm] = occ.startTime.split(':').map(Number);
  const [year, month, day] = occ.date.split('-').map(Number);
  const slotStart = new Date(year, month - 1, day, hh, mm, 0, 0);
  return now.getTime() < slotStart.getTime() + 15 * 60 * 1000;
}

export default function AvailableSlotsPicker({ accessToken, prefillSlotId, prefillDate, onSelect }: Props) {
  const today = new Date();
  const nowHour = today.getHours();

  const [weekStart, setWeekStart] = useState<Date>(() => getMonday(today));
  const [slots, setSlots] = useState<ClubMatchSlotOccurrence[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ClubMatchSlotOccurrence | null>(null);

  const weekDays = useMemo(() => weekDaysFrom(weekStart), [weekStart]);

  const fetchSlots = useCallback(async (startDate: string, endDate: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(BACKEND_GQL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          query: AVAILABLE_SLOTS_QUERY,
          variables: { filters: { startDate, endDate, includeNonBookable: true } },
        }),
      });
      const json = (await res.json()) as {
        data?: { availableSlotsForClubMatch?: ClubMatchSlotOccurrence[] };
        errors?: Array<{ message: string }>;
      };
      if (json.errors?.length) throw new Error(json.errors[0].message);
      const result = json.data?.availableSlotsForClubMatch ?? [];
      setSlots(result);

      if (prefillSlotId && prefillDate) {
        const match = result.find(
          (o) => o.slotId === prefillSlotId && o.date === prefillDate && !o.hasMatch,
        );
        if (match) { setSelected(match); onSelect(match); }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar horarios disponibles');
    } finally {
      setLoading(false);
    }
  }, [accessToken, prefillSlotId, prefillDate, onSelect]);

  // Fetch when week changes
  useEffect(() => {
    fetchSlots(toISO(weekStart), toISO(addDays(weekStart, 6)));
  }, [weekStart]); // eslint-disable-line react-hooks/exhaustive-deps

  // Map "YYYY-MM-DD-HH" → occurrences for O(1) cell lookup
  const slotsMap = useMemo(() => {
    const map = new Map<string, ClubMatchSlotOccurrence[]>();
    for (const occ of slots) {
      const hour = parseInt(occ.startTime.slice(0, 2), 10);
      const key = `${occ.date}-${hour}`;
      const arr = map.get(key) ?? [];
      arr.push(occ);
      map.set(key, arr);
    }
    return map;
  }, [slots]);

  function handleSelect(occ: ClubMatchSlotOccurrence) {
    setSelected(occ);
    onSelect(occ);
  }

  function renderCell(info: CellRenderInfo): CellRenderResult {
    const { date, hour, isPastDay } = info;
    const now = new Date();
    const dateISO = toISO(date);
    const cellOccs = slotsMap.get(`${dateISO}-${hour}`) ?? [];
    const primary = cellOccs[0];
    const extraCount = cellOccs.length - 1;

    // Past days: gray, no interaction
    if (isPastDay || !primary) {
      return { className: isPastDay ? 'cal-cell--past-day-free' : 'cal-cell--empty' };
    }

    const withinGrace = isWithinGracePeriod(primary, now);
    const isSelectable = !primary.hasMatch && withinGrace;
    const isSelected = selected?.slotId === primary.slotId && selected?.date === primary.date;

    let className: string;
    if (primary.hasMatch) {
      className = 'cal-cell--match-open';
    } else if (!withinGrace) {
      // Past grace period — treat like a past slot (gray)
      className = isSameDay(date, today) ? 'cal-cell--past-day-free cal-cell--dimmed' : 'cal-cell--past-day-free';
    } else if (isSelected) {
      className = 'cal-cell--avail picker-sel';
    } else {
      className = 'cal-cell--avail';
    }

    const courtLabel = primary.courtName.length > 10
      ? primary.courtName.slice(0, 9) + '…'
      : primary.courtName;

    const content = (
      <>
        <span className="cal-court-label">{courtLabel}</span>
        {primary.hasMatch && <Lock size={9} strokeWidth={2.5} className="pk-icon" aria-hidden="true" />}
        {primary.priceArs != null && !primary.hasMatch && withinGrace && (
          <span className="pk-price">${Math.round(primary.priceArs)}</span>
        )}
        {extraCount > 0 && <span className="pk-extra">+{extraCount}</span>}
      </>
    );

    return {
      className,
      content,
      onClick: isSelectable ? () => handleSelect(primary) : undefined,
      isClickable: isSelectable,
      ariaLabel: `${primary.courtName} ${primary.startTime.slice(0, 5)}–${primary.endTime.slice(0, 5)} el ${dateISO}`,
    };
  }

  const isThisWeek = isSameDay(weekStart, getMonday(today));

  const nav = (
    <div className="pk-nav">
      <button className="pk-nav-btn" onClick={() => setWeekStart((d) => addDays(d, -7))} aria-label="Semana anterior">
        <ChevronLeft size={16} strokeWidth={2} aria-hidden="true" />
      </button>
      <span className="pk-week-label">{fmtWeekRange(weekStart)}</span>
      <button className="pk-nav-btn" onClick={() => setWeekStart((d) => addDays(d, 7))} aria-label="Semana siguiente">
        <ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
      </button>
      {!isThisWeek && (
        <button className="pk-today-btn" onClick={() => setWeekStart(getMonday(today))}>
          Hoy
        </button>
      )}
      {loading && <Loader2 size={14} strokeWidth={2} className="pk-spin" aria-hidden="true" />}
      <style>{`
        .pk-nav { display:flex; align-items:center; gap:.5rem; padding:.625rem .875rem; border-bottom:1px solid hsl(var(--border)); }
        .pk-nav-btn { background:none; border:1px solid hsl(var(--border)); border-radius:6px; padding:.25rem; color:hsl(var(--muted-foreground)); cursor:pointer; display:inline-flex; transition:background .12s; }
        .pk-nav-btn:hover { background:hsl(var(--muted)/.3); }
        .pk-week-label { font-family:'Barlow Condensed',sans-serif; font-size:.82rem; font-weight:700; letter-spacing:.04em; color:hsl(var(--foreground)); }
        .pk-today-btn { background:hsl(var(--primary)/.12); border:1px solid hsl(var(--primary)/.3); border-radius:6px; padding:.2rem .625rem; font-family:'Barlow Condensed',sans-serif; font-size:.7rem; font-weight:700; letter-spacing:.08em; color:hsl(var(--primary)); cursor:pointer; text-transform:uppercase; }
        @keyframes pk-spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        .pk-spin { animation:pk-spin 1s linear infinite; color:hsl(var(--muted-foreground)); margin-left:.25rem; }
      `}</style>
    </div>
  );

  const legend = (
    <div className="cal-legend">
      {([
        ['cal-led--avail',      'Disponible'],
        ['cal-led--match-open', 'Ocupado'],
        ['cal-led--past-free',  'Pasado / sin gracia'],
      ] as const).map(([cls, label]) => (
        <span key={label} className="cal-legend-item">
          <span className={`cal-led ${cls}`} aria-hidden="true" />
          {label}
        </span>
      ))}
      {selected && (
        <span className="pk-selected-info">
          <MapPin size={11} strokeWidth={2} aria-hidden="true" />
          {selected.courtName} · {selected.startTime.slice(0, 5)} — {selected.date}
        </span>
      )}
      <style>{`
        
        .pk-icon { position:absolute; top:50%; left:50%; transform:translate(-50%,-60%); color:hsl(var(--destructive-foreground)); }
        .pk-price { position:absolute; top:3px; right:4px; font-size:.62rem; font-weight:700; color:hsl(142 70% 55%); font-family:'Barlow Condensed',sans-serif; }
        .pk-extra { position:absolute; top:3px; left:4px; font-size:.62rem; font-weight:700; color:hsl(var(--muted-foreground)); font-family:'Barlow Condensed',sans-serif; }
        .picker-sel { background:hsl(42 100% 55% / 0.2) !important; outline:2px solid hsl(42 100% 55%); outline-offset:-2px; }
        .pk-selected-info { display:flex; align-items:center; gap:4px; margin-left:auto; font-family:'Barlow',sans-serif; font-size:.72rem; color:hsl(42 100% 60%); font-weight:600; }
      `}</style>
    </div>
  );

  return (
    <div className="picker-wrap">
      {error && <div className="pk-error" role="alert">{error}</div>}

      <CalendarGrid
        weekDays={weekDays}
        hours={DISPLAY_HOURS}
        today={today}
        nowHour={nowHour}
        renderCell={renderCell}
        navSlot={nav}
        legendSlot={legend}
      />

      <style>{`
        .picker-wrap { display:flex; flex-direction:column; gap:.75rem; }
        .pk-error { background:rgba(239,68,68,.1); border:1px solid rgba(239,68,68,.25); border-radius:8px; padding:.625rem 1rem; font-family:'Barlow',sans-serif; font-size:.875rem; color:hsl(0 72% 65%); }
      `}</style>
    </div>
  );
}
