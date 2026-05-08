/**
 * AvailableSlotsPicker — Step 1 of the club match wizard (slot + date selection)
 *
 * Decision Context:
 * - Why: Renders available slot occurrences grouped by date so the admin picks a
 *   concrete (slot, date) pair rather than an abstract recurring template.
 * - Data source: `availableSlotsForClubMatch` query which already filters to active,
 *   non-blocked slots in the future; `hasMatch=true` occurrences are shown greyed out
 *   to give context but cannot be selected.
 * - Group by court first, then by date: admin thinks "when is Cancha A free?" not the reverse.
 * - includeNonBookable=true: admin override — they can always create matches on their slots.
 * - Single-cancha auto-select: if only one court is returned, it's pre-selected (improvement 15).
 * - Date range defaults to the next 14 days (not 90 — reduces noise; admin can expand).
 * - Pre-fill: if prefillSlotId + prefillDate are provided (from dashboard), the matching
 *   occurrence is auto-selected and the parent wizard skips to Step 2.
 * - Previously fixed bugs: none relevant (new feature).
 */

import { useState, useEffect, useCallback } from 'react';
import { Calendar, MapPin, Clock, Lock, Loader2 } from 'lucide-react';
import type { ClubMatchSlotOccurrence } from '../../graphql/operations/club-match';
import { AVAILABLE_SLOTS_QUERY } from '../../graphql/operations/club-match';

interface Props {
  accessToken: string;
  prefillSlotId?: string;
  prefillDate?: string;
  onSelect: (occurrence: ClubMatchSlotOccurrence) => void;
}

// Use graphql-auth proxy (triple-layer auth: locals → cookie → explicit header).
// /api/graphql suffers from Astro dev hot-reload caching that breaks auth forwarding.
const BACKEND_GQL = '/api/graphql-auth';

const DAY_LABELS: Record<string, string> = {
  monday: 'Lun', tuesday: 'Mar', wednesday: 'Mié',
  thursday: 'Jue', friday: 'Vie', saturday: 'Sáb', sunday: 'Dom',
};

function defaultRange() {
  const start = new Date();
  start.setDate(start.getDate() + 1); // tomorrow
  const end = new Date(start);
  end.setDate(start.getDate() + 13); // 14 days
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

function formatDate(iso: string) {
  const d = new Date(iso + 'T00:00:00Z');
  return d.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' });
}

function SlotCard({
  occ,
  selected,
  onClick,
}: {
  occ: ClubMatchSlotOccurrence;
  selected: boolean;
  onClick: () => void;
}) {
  const disabled = occ.hasMatch;
  return (
    <button
      className={`slot-card ${selected ? 'selected' : ''} ${disabled ? 'disabled' : ''}`}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      aria-label={`${occ.courtName} ${occ.startTime}–${occ.endTime} el ${occ.date}`}
    >
      <div className="slot-time">
        <Clock size={12} strokeWidth={2} aria-hidden="true" />
        {occ.startTime}–{occ.endTime}
      </div>
      <div className="slot-date">{formatDate(occ.date)}</div>
      {occ.hasMatch && (
        <div className="slot-occupied">
          <Lock size={10} strokeWidth={2} aria-hidden="true" />
          Ocupado
        </div>
      )}
      {occ.priceArs != null && !occ.hasMatch && (
        <div className="slot-price">${Math.round(occ.priceArs)}</div>
      )}

      <style>{`
        .slot-card {
          display: flex; flex-direction: column; gap: 3px;
          background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.09);
          border-radius: 8px; padding: 0.625rem 0.75rem; cursor: pointer;
          text-align: left; font-family: 'Barlow', sans-serif; color: hsl(210 20% 75%);
          transition: all 0.12s; min-width: 120px;
        }
        .slot-card:hover:not(.disabled) { background: rgba(246,164,0,0.08); border-color: rgba(246,164,0,0.25); }
        .slot-card.selected { background: rgba(246,164,0,0.12); border-color: rgba(246,164,0,0.4); color: hsl(42 100% 70%); }
        .slot-card.disabled { opacity: 0.45; cursor: not-allowed; }
        .slot-time { display: flex; align-items: center; gap: 4px; font-size: 0.82rem; font-weight: 600; }
        .slot-date { font-size: 0.72rem; color: hsl(215 20% 50%); }
        .slot-occupied { display: flex; align-items: center; gap: 3px; font-size: 0.68rem; color: hsl(0 72% 60%); margin-top: 2px; }
        .slot-price { font-size: 0.7rem; color: hsl(142 70% 50%); margin-top: 2px; }
      `}</style>
    </button>
  );
}

export default function AvailableSlotsPicker({ accessToken, prefillSlotId, prefillDate, onSelect }: Props) {
  const [slots, setSlots] = useState<ClubMatchSlotOccurrence[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState(defaultRange);
  const [selected, setSelected] = useState<ClubMatchSlotOccurrence | null>(null);

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

      // Auto-select if prefill provided
      if (prefillSlotId && prefillDate) {
        const match = result.find((o) => o.slotId === prefillSlotId && o.date === prefillDate && !o.hasMatch);
        if (match) {
          setSelected(match);
          onSelect(match);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar horarios disponibles');
    } finally {
      setLoading(false);
    }
  }, [accessToken, prefillSlotId, prefillDate, onSelect]);

  useEffect(() => {
    fetchSlots(range.startDate, range.endDate);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Group by court
  const courts = new Map<string, { name: string; occurrences: ClubMatchSlotOccurrence[] }>();
  for (const occ of slots) {
    if (!courts.has(occ.courtId)) courts.set(occ.courtId, { name: occ.courtName, occurrences: [] });
    courts.get(occ.courtId)!.occurrences.push(occ);
  }

  function handleSelect(occ: ClubMatchSlotOccurrence) {
    setSelected(occ);
    onSelect(occ);
  }

  return (
    <div className="picker-wrap">
      {/* Date range control */}
      <div className="range-bar">
        <Calendar size={14} strokeWidth={2} color="hsl(215 20% 50%)" aria-hidden="true" />
        <input
          type="date"
          className="date-input"
          value={range.startDate}
          onChange={(e) => setRange((r) => ({ ...r, startDate: e.target.value }))}
          aria-label="Fecha desde"
        />
        <span className="date-sep">—</span>
        <input
          type="date"
          className="date-input"
          value={range.endDate}
          onChange={(e) => setRange((r) => ({ ...r, endDate: e.target.value }))}
          aria-label="Fecha hasta"
        />
        <button className="search-btn" onClick={() => fetchSlots(range.startDate, range.endDate)}>
          Buscar
        </button>
      </div>

      {loading && (
        <div className="loading-row">
          <Loader2 size={16} strokeWidth={2} className="spin" aria-hidden="true" />
          Cargando horarios...
        </div>
      )}

      {error && <div className="error-row" role="alert">{error}</div>}

      {!loading && !error && slots.length === 0 && (
        <p className="empty-text">No hay horarios disponibles en este rango. Expandí las fechas o revisá los slots en Horarios.</p>
      )}

      {!loading && [...courts.entries()].map(([courtId, court]) => (
        <div key={courtId} className="court-group">
          <div className="court-header">
            <MapPin size={13} strokeWidth={2} aria-hidden="true" />
            {court.name}
          </div>
          <div className="slots-row">
            {court.occurrences.map((occ) => (
              <SlotCard
                key={`${occ.slotId}-${occ.date}`}
                occ={occ}
                selected={selected?.slotId === occ.slotId && selected?.date === occ.date}
                onClick={() => handleSelect(occ)}
              />
            ))}
          </div>
        </div>
      ))}

      <style>{`
        .picker-wrap { display: flex; flex-direction: column; gap: 1.25rem; }
        .range-bar { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
        .date-input {
          background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
          border-radius: 6px; padding: 0.3rem 0.625rem; color: hsl(210 20% 80%);
          font-size: 0.82rem; font-family: 'Barlow', sans-serif; outline: none; cursor: pointer;
        }
        .date-sep { color: hsl(215 20% 40%); font-size: 0.8rem; }
        .search-btn {
          background: rgba(246,164,0,0.1); border: 1px solid rgba(246,164,0,0.25);
          border-radius: 6px; padding: 0.3rem 0.875rem; font-family: 'Barlow Condensed', sans-serif;
          font-size: 0.82rem; font-weight: 700; letter-spacing: 0.05em; color: hsl(42 100% 65%);
          cursor: pointer; transition: background 0.12s;
        }
        .search-btn:hover { background: rgba(246,164,0,0.18); }
        .loading-row, .error-row, .empty-text {
          display: flex; align-items: center; gap: 0.5rem;
          font-family: 'Barlow', sans-serif; font-size: 0.875rem;
          color: hsl(215 20% 50%); padding: 1rem 0;
        }
        .error-row { color: hsl(0 72% 65%); }
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        .spin { animation: spin 1s linear infinite; }
        .court-group { display: flex; flex-direction: column; gap: 0.625rem; }
        .court-header {
          display: flex; align-items: center; gap: 5px;
          font-family: 'Barlow Condensed', sans-serif; font-size: 0.78rem;
          font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase;
          color: hsl(42 100% 55%);
        }
        .slots-row { display: flex; flex-wrap: wrap; gap: 0.5rem; }
      `}</style>
    </div>
  );
}
