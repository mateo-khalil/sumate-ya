/**
 * SchedulePreview — read-only "así queda tu semana" view for the configurator.
 *
 * Decision Context:
 * - Why: club owners asked to SEE the result of the open-hours + price form before saving —
 *   which days are open, the open block, and the price (base + special). This renders that
 *   live from the current form state, so editing a field updates the preview immediately.
 * - It mirrors the desired slots WITHOUT touching the backend; the real reconcile still runs
 *   on "Guardar". Closed days are shown muted so the whole week reads at a glance.
 * - Each open day shows a proportional bar (open block, with the special window highlighted)
 *   plus the time range and price chips. The bar scale is the open→close window, shared by
 *   every day, so peak windows line up visually.
 * - Previously fixed bugs: none relevant (new component).
 */

import { CalendarRange } from 'lucide-react';
import { DAY_ORDER, DAY_OF_WEEK_LABELS } from '../../graphql/operations/club-slots';

function toMin(t: string): number { const [h, m] = t.slice(0, 5).split(':').map(Number); return (h || 0) * 60 + (m || 0); }
function money(n: number): string { return `$U ${n.toLocaleString('es-UY')}`; }

interface Props {
  openDays: Set<string>;
  openTime: string;
  closeTime: string;
  slotMinutes: number;
  basePrice: number;
  peakEnabled: boolean;
  peakDays: Set<string>;
  peakStart: string;
  peakEnd: string;
  peakPrice: number;
}

export function SchedulePreview({
  openDays, openTime, closeTime, slotMinutes, basePrice, peakEnabled, peakDays, peakStart, peakEnd, peakPrice,
}: Props) {
  const openMin = toMin(openTime);
  const closeMin = toMin(closeTime);
  const span = Math.max(1, closeMin - openMin);
  const slotsPerDay = Math.max(0, Math.floor(span / slotMinutes));

  // Peak segment clamped into the open window (shared geometry for all peak days).
  const psRaw = toMin(peakStart);
  const peRaw = toMin(peakEnd);
  const ps = Math.min(Math.max(psRaw, openMin), closeMin);
  const pe = Math.min(Math.max(peRaw, openMin), closeMin);
  const peakLeftPct = ((ps - openMin) / span) * 100;
  const peakWidthPct = Math.max(0, ((pe - ps) / span) * 100);

  return (
    <section className="cfg-section">
      <div className="cfg-head"><CalendarRange size={15} strokeWidth={2} aria-hidden="true" /> Vista previa de la semana</div>
      <div className="prev-list">
        {DAY_ORDER.map((day) => {
          const isOpen = openDays.has(day);
          const dayIsPeak = peakEnabled && isOpen && peakDays.has(day) && peakWidthPct > 0;
          return (
            <div key={day} className={`prev-row${isOpen ? '' : ' prev-row--closed'}`}>
              <span className="prev-day">{DAY_OF_WEEK_LABELS[day]}</span>
              {isOpen ? (
                <div className="prev-detail">
                  <div className="prev-bar" aria-hidden="true">
                    <div className="prev-bar-open" />
                    {dayIsPeak && (
                      <div
                        className="prev-bar-peak"
                        style={{ left: `${peakLeftPct}%`, width: `${peakWidthPct}%` }}
                      />
                    )}
                  </div>
                  <div className="prev-meta">
                    <span className="prev-time">{openTime}–{closeTime}</span>
                    <span className="prev-slots">{slotsPerDay} turnos</span>
                    {basePrice > 0 && <span className="prev-price">{money(basePrice)}</span>}
                    {dayIsPeak && peakPrice > 0 && (
                      <span className="prev-price prev-price--peak">
                        {peakStart}–{peakEnd} · {money(peakPrice)}
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <span className="prev-closed">Cerrado</span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
