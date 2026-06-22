/**
 * ScheduleConfigurator — the simple "open hours + price" form for ONE court.
 *
 * Decision Context:
 * - Why this exists: the old Horarios screen exposed the raw per-slot model (a 245-cell
 *   weekly grid with bulk checkboxes). Club owners think in "which days am I open, from when
 *   to when, and what does it cost" — not in individual slot rows. This form captures that
 *   intent and hands it to the applyCourtSchedule mutation, which generates/updates/removes
 *   the underlying slots and protects anything already booked or blocked.
 * - State is SEEDED from the court's current slots (open days = days with active slots,
 *   open/close = min start / max end, slotMinutes = most common duration) and from the saved
 *   courtPricing row (base + peak). So re-opening the page shows the current configuration,
 *   editable in place — not a blank form.
 * - Pricing model (user choice): one base price per court + an optional "precio especial"
 *   window (e.g. Vie–Dom 18:00–23:00). peakDays is constrained to the chosen open days.
 * - The heavy reconcile (diff, overlap, match protection) lives server-side; this component
 *   only validates the shape and shows a live preview of how many slots will be generated.
 * - Previously fixed bugs: none relevant (new component).
 */

import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, Clock, DollarSign, Sparkles, Check, Loader2, ShieldCheck } from 'lucide-react';
import { gqlAuth } from '../../lib/graphqlAuth';
import { SchedulePreview } from './SchedulePreview';
import {
  GET_COURT_PRICING,
  DAY_ORDER,
  type ManagedClubSlot,
  type ApplyCourtScheduleInput,
} from '../../graphql/operations/club-slots';

const DAY_SHORT: Record<string, string> = {
  monday: 'Lun', tuesday: 'Mar', wednesday: 'Mié', thursday: 'Jue',
  friday: 'Vie', saturday: 'Sáb', sunday: 'Dom',
};
// courtPricing.peakDays are ints (0=Sun … 6=Sat); map back to our day strings.
const INT_TO_DAY = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const DURATION_OPTIONS = [30, 60, 90, 120];

function hhmm(t: string): string { return t.slice(0, 5); }
function toMin(t: string): number { const [h, m] = hhmm(t).split(':').map(Number); return h * 60 + m; }
function fmtMoney(n: number): string { return `$U ${n.toLocaleString('es-UY')}`; }

interface CourtRef { id: string; name: string }

interface Props {
  court: CourtRef;
  courtSlots: ManagedClubSlot[];
  accessToken: string;
  onApply: (input: ApplyCourtScheduleInput) => Promise<{ success: boolean; message: string }>;
}

export function ScheduleConfigurator({ court, courtSlots, accessToken, onApply }: Props) {
  // ── Seed open days / hours / duration from the court's current active slots ──
  const seed = useMemo(() => {
    const active = courtSlots.filter((s) => s.isActive);
    const days = new Set(active.map((s) => s.dayOfWeek));
    const durations = active.map((s) => s.duration).filter(Boolean);
    const commonDuration = durations.length
      ? durations.sort((a, b) =>
          durations.filter((d) => d === a).length - durations.filter((d) => d === b).length,
        ).pop() ?? 60
      : 60;
    const starts = active.map((s) => toMin(s.startTime));
    const ends = active.map((s) => toMin(s.endTime));
    const min = (xs: number[]) => (xs.length ? Math.min(...xs) : null);
    const max = (xs: number[]) => (xs.length ? Math.max(...xs) : null);
    const mm = (v: number | null, fallback: string) =>
      v == null ? fallback : `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
    const prices = active.map((s) => s.priceArs).filter((p): p is number => p != null);
    const basePrice = prices.length
      ? prices.sort((a, b) => prices.filter((p) => p === a).length - prices.filter((p) => p === b).length).pop()!
      : 0;
    return {
      openDays: days.size ? days : new Set(['monday', 'tuesday', 'wednesday', 'thursday', 'friday']),
      openTime: mm(min(starts), '08:00'),
      closeTime: mm(max(ends), '23:00'),
      slotMinutes: DURATION_OPTIONS.includes(commonDuration) ? commonDuration : 60,
      basePrice: basePrice ? String(basePrice) : '',
    };
  }, [courtSlots]);

  const [openDays, setOpenDays] = useState<Set<string>>(seed.openDays);
  const [openTime, setOpenTime] = useState(seed.openTime);
  const [closeTime, setCloseTime] = useState(seed.closeTime);
  const [slotMinutes, setSlotMinutes] = useState(seed.slotMinutes);
  const [basePrice, setBasePrice] = useState(seed.basePrice);

  const [peakEnabled, setPeakEnabled] = useState(false);
  const [peakDays, setPeakDays] = useState<Set<string>>(new Set(['friday', 'saturday', 'sunday']));
  const [peakStart, setPeakStart] = useState('18:00');
  const [peakEnd, setPeakEnd] = useState('23:00');
  const [peakPrice, setPeakPrice] = useState('');

  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  // Re-seed when the selected court changes.
  useEffect(() => {
    setOpenDays(seed.openDays);
    setOpenTime(seed.openTime);
    setCloseTime(seed.closeTime);
    setSlotMinutes(seed.slotMinutes);
    setBasePrice(seed.basePrice);
    setFeedback(null);
  }, [seed]);

  // Load saved pricing (base + peak window) so the form round-trips the real config.
  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    gqlAuth<{ courtPricing?: {
      basePrice: number; peakDays: number[]; peakStart?: string | null;
      peakEnd?: string | null; peakMultiplier: number;
    } | null }>(GET_COURT_PRICING, { courtId: court.id }, accessToken)
      .then((data) => {
        const p = data.courtPricing;
        if (cancelled || !p) return;
        if (p.basePrice) setBasePrice(String(p.basePrice));
        const hasPeak = (p.peakDays?.length ?? 0) > 0 && !!p.peakStart && !!p.peakEnd && p.peakMultiplier > 1;
        if (hasPeak) {
          setPeakEnabled(true);
          setPeakDays(new Set(p.peakDays.map((i) => INT_TO_DAY[i]).filter(Boolean)));
          setPeakStart(hhmm(p.peakStart!));
          setPeakEnd(hhmm(p.peakEnd!));
          setPeakPrice(String(Math.round(p.basePrice * p.peakMultiplier)));
        }
      })
      .catch(() => {/* no saved config — keep seeded defaults */});
    return () => { cancelled = true; };
  }, [court.id, accessToken]);

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, day: string) => {
    const next = new Set(set);
    next.has(day) ? next.delete(day) : next.add(day);
    setter(next);
  };

  // ── Live preview ──
  const slotsPerDay = Math.max(0, Math.floor((toMin(closeTime) - toMin(openTime)) / slotMinutes));
  const totalSlots = slotsPerDay * openDays.size;
  const base = parseFloat(basePrice) || 0;
  const peak = parseFloat(peakPrice) || 0;

  const validationError = (): string | null => {
    if (openDays.size === 0) return 'Elegí al menos un día de apertura';
    if (toMin(closeTime) - toMin(openTime) < slotMinutes) return 'El cierre debe ser al menos un turno después de la apertura';
    if (!base || base <= 0) return 'Ingresá un precio base válido';
    if (peakEnabled) {
      if (!peak || peak <= 0) return 'Ingresá el precio especial';
      if (toMin(peakEnd) <= toMin(peakStart)) return 'El horario especial: el fin debe ser mayor que el inicio';
      if ([...peakDays].every((d) => !openDays.has(d))) return 'Elegí al menos un día abierto para el precio especial';
    }
    return null;
  };

  const handleSave = async () => {
    const err = validationError();
    if (err) { setFeedback({ ok: false, msg: err }); return; }
    setSaving(true);
    setFeedback(null);
    const input: ApplyCourtScheduleInput = {
      courtId: court.id,
      openDays: DAY_ORDER.filter((d) => openDays.has(d)),
      openTime, closeTime, slotMinutes,
      basePrice: base,
      peakEnabled,
      ...(peakEnabled
        ? {
            peakDays: DAY_ORDER.filter((d) => openDays.has(d) && peakDays.has(d)),
            peakStart, peakEnd, peakPrice: peak,
          }
        : {}),
    };
    const res = await onApply(input);
    setSaving(false);
    setFeedback({ ok: res.success, msg: res.message });
  };

  return (
    <div className="cfg-card">
      <div className="cfg-grid">
        {/* ── Días abiertos ── */}
        <section className="cfg-section">
          <div className="cfg-head"><CalendarClock size={15} strokeWidth={2} aria-hidden="true" /> Días abiertos</div>
          <div className="cfg-days">
            {DAY_ORDER.map((day) => (
              <button
                key={day}
                type="button"
                className={`cfg-day${openDays.has(day) ? ' cfg-day--on' : ''}`}
                onClick={() => toggle(openDays, setOpenDays, day)}
                aria-pressed={openDays.has(day)}
              >
                {DAY_SHORT[day]}
              </button>
            ))}
          </div>
        </section>

        {/* ── Horario ── */}
        <section className="cfg-section">
          <div className="cfg-head"><Clock size={15} strokeWidth={2} aria-hidden="true" /> Horario de atención</div>
          <div className="cfg-row">
            <label className="cfg-field">
              <span className="cfg-label">Abre</span>
              <input className="cfg-input" type="time" value={openTime} onChange={(e) => setOpenTime(e.target.value)} />
            </label>
            <label className="cfg-field">
              <span className="cfg-label">Cierra</span>
              <input className="cfg-input" type="time" value={closeTime} onChange={(e) => setCloseTime(e.target.value)} />
            </label>
            <label className="cfg-field">
              <span className="cfg-label">Duración del turno</span>
              <select className="cfg-input" value={slotMinutes} onChange={(e) => setSlotMinutes(Number(e.target.value))}>
                {DURATION_OPTIONS.map((d) => <option key={d} value={d}>{d} min</option>)}
              </select>
            </label>
          </div>
        </section>

        {/* ── Precio base ── */}
        <section className="cfg-section">
          <div className="cfg-head"><DollarSign size={15} strokeWidth={2} aria-hidden="true" /> Precio por turno</div>
          <label className="cfg-field cfg-field--price">
            <span className="cfg-label">Precio base</span>
            <div className="cfg-price-wrap">
              <span className="cfg-currency">$U</span>
              <input
                className="cfg-input" type="number" min="0" max="999999" placeholder="Ej: 8000"
                value={basePrice} onChange={(e) => setBasePrice(e.target.value)}
              />
              <span className="cfg-suffix">/ turno</span>
            </div>
          </label>
        </section>

        {/* ── Precio especial (peak) ── */}
        <section className="cfg-section">
          <label className="cfg-toggle">
            <input type="checkbox" checked={peakEnabled} onChange={(e) => setPeakEnabled(e.target.checked)} />
            <span className="cfg-head cfg-head--inline"><Sparkles size={15} strokeWidth={2} aria-hidden="true" /> Precio especial (noche / fin de semana)</span>
          </label>
          {peakEnabled && (
            <div className="cfg-peak">
              <div className="cfg-days cfg-days--peak">
                {DAY_ORDER.filter((d) => openDays.has(d)).map((day) => (
                  <button
                    key={day} type="button"
                    className={`cfg-day${peakDays.has(day) ? ' cfg-day--peak-on' : ''}`}
                    onClick={() => toggle(peakDays, setPeakDays, day)}
                    aria-pressed={peakDays.has(day)}
                  >
                    {DAY_SHORT[day]}
                  </button>
                ))}
              </div>
              <div className="cfg-row">
                <label className="cfg-field">
                  <span className="cfg-label">Desde</span>
                  <input className="cfg-input" type="time" value={peakStart} onChange={(e) => setPeakStart(e.target.value)} />
                </label>
                <label className="cfg-field">
                  <span className="cfg-label">Hasta</span>
                  <input className="cfg-input" type="time" value={peakEnd} onChange={(e) => setPeakEnd(e.target.value)} />
                </label>
                <label className="cfg-field cfg-field--price">
                  <span className="cfg-label">Precio especial</span>
                  <div className="cfg-price-wrap">
                    <span className="cfg-currency">$U</span>
                    <input className="cfg-input" type="number" min="0" max="999999" placeholder="Ej: 10000"
                      value={peakPrice} onChange={(e) => setPeakPrice(e.target.value)} />
                  </div>
                </label>
              </div>
            </div>
          )}
        </section>

        {/* ── Vista previa de la semana ── */}
        <SchedulePreview
          openDays={openDays}
          openTime={openTime}
          closeTime={closeTime}
          slotMinutes={slotMinutes}
          basePrice={base}
          peakEnabled={peakEnabled}
          peakDays={peakDays}
          peakStart={peakStart}
          peakEnd={peakEnd}
          peakPrice={peak}
        />
      </div>

      {/* ── Resumen + acción ── */}
      <div className="cfg-summary">
        <div className="cfg-summary-text">
          <strong>{totalSlots}</strong> turnos por semana en {openDays.size} día(s)
          {base > 0 && <> · {fmtMoney(base)}{peakEnabled && peak > 0 ? ` – ${fmtMoney(peak)}` : ''}</>}
        </div>
        <p className="cfg-note">
          <ShieldCheck size={13} strokeWidth={2} aria-hidden="true" />
          Los turnos con partidos o bloqueos se conservan automáticamente.
        </p>
      </div>

      <div className="cfg-actions">
        {feedback && (
          <span className={feedback.ok ? 'cfg-feedback cfg-feedback--ok' : 'cfg-feedback cfg-feedback--err'}>
            {feedback.ok && <Check size={13} strokeWidth={2.5} aria-hidden="true" />} {feedback.msg}
          </span>
        )}
        <button className="btn-primary" onClick={handleSave} disabled={saving}>
          {saving
            ? <><Loader2 size={14} strokeWidth={2} className="spin" aria-hidden="true" /> Guardando...</>
            : `Guardar horarios de ${court.name}`}
        </button>
      </div>
    </div>
  );
}
