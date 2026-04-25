/**
 * SlotSelector — Step 2 of the create-match wizard
 * Date picker + available slot list for the selected club.
 *
 * Decision Context:
 * - Date range: today + 30 days. min/max HTML attributes on <input type="date"> handle
 *   validation natively and prevent picking past dates without JS.
 * - Slots are fetched client-side when the date changes (not SSR) because they depend on
 *   the selected date — pre-fetching all 30 days at load time would be wasteful.
 * - The GET_CLUB_SLOTS query goes to the same GraphQL endpoint used by other components.
 *   We use plain fetch (not urql) to keep the component dependency-free and simple.
 * - Empty/loading states use text feedback; no skeleton is needed given the fast local query.
 * - Previously fixed bugs: none relevant.
 */

import { useEffect, useState } from 'react';
import { GET_CLUB_SLOTS, type ClubSlot } from '../../../graphql/operations/matches';

interface Props {
  clubId: string;
  clubName: string;
  selectedSlot: ClubSlot | null;
  onSelect: (slot: ClubSlot, date: string) => void;
}

const FORMAT_LABEL: Record<string, string> = {
  FIVE_VS_FIVE: '5v5',
  SEVEN_VS_SEVEN: '7v7',
  TEN_VS_TEN: '10v10',
  ELEVEN_VS_ELEVEN: '11v11',
};

function toLocalDateString(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const TODAY = toLocalDateString(new Date());
const MAX_DATE = (() => {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return toLocalDateString(d);
})();

export default function SlotSelector({ clubId, clubName, selectedSlot, onSelect }: Props) {
  const [date, setDate] = useState(TODAY);
  const [slots, setSlots] = useState<ClubSlot[]>([]);
  const [loading, setLoading] = useState(true); // true on mount — effect fires immediately
  const [error, setError] = useState<string | null>(null);

  const graphqlUrl = '/api/graphql';

  useEffect(() => {
    setSlots([]);
    setError(null);
    setLoading(true);

    fetch(graphqlUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: GET_CLUB_SLOTS,
        variables: { clubId, date },
      }),
    })
      .then((r) => r.json())
      .then((res: { data?: { clubSlots: ClubSlot[] }; errors?: { message: string }[] }) => {
        if (res.errors?.length) {
          setError(res.errors[0].message);
        } else {
          setSlots(res.data?.clubSlots ?? []);
        }
      })
      .catch(() => setError('Error de red al cargar los horarios'))
      .finally(() => setLoading(false));
  }, [clubId, date, graphqlUrl]);

  return (
    <div className="slot-step">
      <div className="date-row">
        <label className="step-label" htmlFor="slot-date">
          Fecha del partido
        </label>
        <input
          id="slot-date"
          type="date"
          value={date}
          min={TODAY}
          max={MAX_DATE}
          onChange={(e) => setDate(e.target.value)}
          className="date-input"
        />
        <span className="club-hint">{clubName}</span>
      </div>

      {loading && (
        <p className="slot-feedback">Cargando horarios...</p>
      )}
      {error && (
        <p className="slot-feedback slot-feedback--error" role="alert">{error}</p>
      )}
      {!loading && !error && slots.length === 0 && (
        <p className="slot-feedback">No hay horarios disponibles para esta fecha.</p>
      )}

      {!loading && slots.length > 0 && (
        <div className="slot-list">
          {slots.map((slot) => {
            const isSelected = slot.id === selectedSlot?.id;
            return (
              <button
                key={slot.id}
                type="button"
                className={`slot-card${isSelected ? ' slot-card--selected' : ''}`}
                onClick={() => onSelect(slot, date)}
                aria-pressed={isSelected}
              >
                <div className="slot-time">
                  {slot.startTime.slice(0, 5)} – {slot.endTime.slice(0, 5)}
                </div>
                <div className="slot-court">
                  <span className="court-name">{slot.court.name}</span>
                  <span className="court-format">
                    hasta {FORMAT_LABEL[slot.court.maxFormat] ?? slot.court.maxFormat}
                  </span>
                </div>
                {slot.priceArs != null && (
                  <div className="slot-price">${slot.priceArs.toLocaleString('es-AR')}</div>
                )}
                {isSelected && <span className="slot-check" aria-hidden="true">✓</span>}
              </button>
            );
          })}
        </div>
      )}

      <style>{`
        .slot-step { display: flex; flex-direction: column; gap: 1rem; }
        .date-row { display: flex; flex-direction: column; gap: 0.35rem; }
        .step-label {
          font-family: 'Barlow Condensed', sans-serif;
          font-size: 0.75rem; font-weight: 700;
          letter-spacing: 0.15em; text-transform: uppercase;
          color: hsl(35 100% 55%);
        }
        .date-input {
          padding: 0.55rem 0.875rem;
          background: hsl(220 30% 16%);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 6px;
          color: hsl(210 20% 94%);
          font-size: 0.9rem; font-family: 'Barlow', sans-serif;
          cursor: pointer;
          max-width: 200px;
        }
        .club-hint {
          font-family: 'Barlow', sans-serif;
          font-size: 0.78rem; color: hsl(215 20% 50%);
        }
        .slot-feedback {
          font-family: 'Barlow', sans-serif; font-size: 0.875rem;
          color: hsl(215 20% 50%); text-align: center; padding: 1rem 0;
        }
        .slot-feedback--error { color: hsl(0 72% 70%); }
        .slot-list { display: flex; flex-direction: column; gap: 0.6rem; }
        .slot-card {
          display: flex; align-items: center; gap: 1rem;
          padding: 0.875rem 1.25rem;
          background: hsl(220 55% 11%);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 0.625rem; cursor: pointer; text-align: left;
          transition: border-color 0.15s; width: 100%; position: relative;
        }
        .slot-card:hover { border-color: rgba(255,255,255,0.18); }
        .slot-card--selected { border-color: hsl(35 100% 48%); }
        .slot-time {
          font-family: 'Bebas Neue', sans-serif;
          font-size: 1.3rem; letter-spacing: 0.05em; color: #fff;
          min-width: 110px;
        }
        .slot-court { display: flex; flex-direction: column; gap: 0.15rem; }
        .court-name {
          font-family: 'Barlow', sans-serif; font-size: 0.85rem;
          color: hsl(210 20% 90%);
        }
        .court-format {
          font-family: 'Barlow Condensed', sans-serif;
          font-size: 0.72rem; font-weight: 700; letter-spacing: 0.12em;
          text-transform: uppercase; color: hsl(216 85% 65%);
        }
        .slot-price {
          margin-left: auto; margin-right: 1.5rem;
          font-family: 'Barlow Condensed', sans-serif;
          font-size: 0.95rem; color: hsl(142 72% 60%);
        }
        .slot-check {
          position: absolute; right: 1rem; top: 50%; transform: translateY(-50%);
          color: hsl(35 100% 55%); font-size: 1.1rem; font-weight: bold;
        }
      `}</style>
    </div>
  );
}
