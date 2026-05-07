/**
 * CourtPricingPanel — bulk pricing management for all club courts
 *
 * Decision Context:
 * - Why bulk apply: the admin sets ONE pricing config that applies to ALL courts at once.
 *   Per-court granularity is available by toggling the court selector; the default is
 *   "apply to all" so the common case (1 court) is zero friction.
 * - Price model (maps to courtPricing table):
 *     basePrice    → default price for any slot
 *     peakDays     → int[] (0=Sun…6=Sat) — days where peakMultiplier applies
 *     peakStart/End → HH:mm time window for the peak multiplier
 *     peakMultiplier → factor applied on peak day/hour (e.g. 1.5 = +50%)
 *     offPeakDiscount → factor for off-peak hours (e.g. 0.9 = −10%)
 * - Preview table: shows the 4 resulting prices (peak day+hour, peak day off-hour,
 *   non-peak day+hour, non-peak day off-hour) so the admin sees the outcome before saving.
 * - On save: calls updateCourtPricing mutation for every court in the club via
 *   /api/graphql-auth. Loads existing config on mount.
 * - Previously fixed bugs: none relevant (new component Phase 1-close).
 */

import { useState, useEffect, useCallback } from 'react';
import { DollarSign, TrendingUp, Clock, Check, Loader2 } from 'lucide-react';
import type { ManagedClubSlot } from '../../graphql/operations/club-slots';
import { UPDATE_COURT_PRICING, GET_COURT_PRICING } from '../../graphql/operations/club-slots';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface PricingConfig {
  basePrice: string;
  peakDays: number[];        // 0=Dom…6=Sáb (JS convention)
  peakStart: string;         // HH:mm
  peakEnd: string;           // HH:mm
  peakMultiplier: string;    // numeric string
  offPeakDiscount: string;   // numeric string (factor, e.g. "0.9")
}

const DAYS = [
  { js: 1, label: 'Lun' },
  { js: 2, label: 'Mar' },
  { js: 3, label: 'Mié' },
  { js: 4, label: 'Jue' },
  { js: 5, label: 'Vie' },
  { js: 6, label: 'Sáb' },
  { js: 0, label: 'Dom' },
];

const DEFAULT_CONFIG: PricingConfig = {
  basePrice: '',
  peakDays: [6, 0],          // Sáb + Dom by default
  peakStart: '17:00',
  peakEnd: '22:00',
  peakMultiplier: '1.5',
  offPeakDiscount: '1.0',
};

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

async function gqlFetch<T>(query: string, variables: Record<string, unknown>, token: string): Promise<T> {
  const res = await fetch('/api/graphql-auth', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await res.json()) as { data?: T; errors?: Array<{ message: string }> };
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data as T;
}

function calcPrice(base: number, factor: number) {
  return Math.round(base * factor);
}

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

interface Props {
  slots: ManagedClubSlot[];
  accessToken: string;
}

export function CourtPricingPanel({ slots, accessToken }: Props) {
  // Derive unique courts from loaded slots
  const courts = Array.from(
    new Map(slots.map((s) => [s.courtId, { id: s.courtId, name: s.court.name }])).values(),
  );

  const [config, setConfig]     = useState<PricingConfig>(DEFAULT_CONFIG);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Load existing pricing from first court on mount
  useEffect(() => {
    if (!courts.length || !accessToken) return;
    gqlFetch<{ courtPricing?: {
      basePrice: number; peakDays: number[]; peakStart?: string;
      peakEnd?: string; peakMultiplier: number; offPeakDiscount: number;
    } | null }>(GET_COURT_PRICING, { courtId: courts[0].id }, accessToken)
      .then((data) => {
        const p = data.courtPricing;
        if (!p) return;
        setConfig({
          basePrice:       String(p.basePrice ?? ''),
          peakDays:        p.peakDays ?? [6, 0],
          peakStart:       p.peakStart ?? '17:00',
          peakEnd:         p.peakEnd   ?? '22:00',
          peakMultiplier:  String(p.peakMultiplier ?? '1.5'),
          offPeakDiscount: String(p.offPeakDiscount ?? '1.0'),
        });
      })
      .catch(() => {/* no existing config — keep defaults */});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  const toggleDay = useCallback((js: number) => {
    setConfig((c) => ({
      ...c,
      peakDays: c.peakDays.includes(js)
        ? c.peakDays.filter((d) => d !== js)
        : [...c.peakDays, js],
    }));
  }, []);

  const handleSave = useCallback(async () => {
    if (!courts.length) return;
    setSaving(true); setSaved(false); setSaveError(null);
    try {
      const input = {
        basePrice:       parseFloat(config.basePrice) || 0,
        peakDays:        config.peakDays,
        peakStart:       config.peakStart || null,
        peakEnd:         config.peakEnd   || null,
        peakMultiplier:  parseFloat(config.peakMultiplier) || 1.0,
        offPeakDiscount: parseFloat(config.offPeakDiscount) || 1.0,
      };
      // Apply to ALL courts of the club
      await Promise.all(
        courts.map((court) =>
          gqlFetch(UPDATE_COURT_PRICING, { input: { courtId: court.id, ...input } }, accessToken),
        ),
      );
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Error al guardar precios');
    } finally {
      setSaving(false);
    }
  }, [config, courts, accessToken]);

  // Preview calculations
  const base   = parseFloat(config.basePrice) || 0;
  const mult   = parseFloat(config.peakMultiplier) || 1;
  const disc   = parseFloat(config.offPeakDiscount) || 1;
  const hasPeak = config.peakDays.length > 0 && config.peakStart && config.peakEnd;

  return (
    <div className="pricing-panel">
      <div className="pricing-grid">

        {/* ── Precio base ─────────────────── */}
        <section className="pricing-section">
          <div className="pricing-section-head">
            <DollarSign size={14} strokeWidth={2} aria-hidden="true" />
            Precio base
          </div>
          <label className="pricing-field">
            <span className="pricing-label">Precio por slot ($U)</span>
            <div className="pricing-input-wrap">
              <span className="pricing-currency">$U</span>
              <input
                className="pricing-input"
                type="number"
                min="0"
                max="999999"
                placeholder="Ej: 500"
                value={config.basePrice}
                onChange={(e) => setConfig((c) => ({ ...c, basePrice: e.target.value }))}
              />
            </div>
            <span className="pricing-hint">Se aplica a todos los slots sin precio asignado</span>
          </label>
        </section>

        {/* ── Días pico ───────────────────── */}
        <section className="pricing-section">
          <div className="pricing-section-head">
            <TrendingUp size={14} strokeWidth={2} aria-hidden="true" />
            Días con mayor demanda
          </div>
          <div className="pricing-days">
            {DAYS.map(({ js, label }) => (
              <button
                key={js}
                type="button"
                className={`day-btn${config.peakDays.includes(js) ? ' day-btn--active' : ''}`}
                onClick={() => toggleDay(js)}
                aria-pressed={config.peakDays.includes(js)}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="pricing-field">
            <span className="pricing-label">Multiplicador pico (ej: 1.5 = +50%)</span>
            <input
              className="pricing-input"
              type="number"
              step="0.1"
              min="1"
              max="10"
              value={config.peakMultiplier}
              onChange={(e) => setConfig((c) => ({ ...c, peakMultiplier: e.target.value }))}
            />
          </label>
        </section>

        {/* ── Horario pico ────────────────── */}
        <section className="pricing-section">
          <div className="pricing-section-head">
            <Clock size={14} strokeWidth={2} aria-hidden="true" />
            Horario pico (dentro de días pico)
          </div>
          <div className="pricing-time-row">
            <label className="pricing-field">
              <span className="pricing-label">Desde</span>
              <input
                className="pricing-input"
                type="time"
                value={config.peakStart}
                onChange={(e) => setConfig((c) => ({ ...c, peakStart: e.target.value }))}
              />
            </label>
            <label className="pricing-field">
              <span className="pricing-label">Hasta</span>
              <input
                className="pricing-input"
                type="time"
                value={config.peakEnd}
                onChange={(e) => setConfig((c) => ({ ...c, peakEnd: e.target.value }))}
              />
            </label>
          </div>
          <label className="pricing-field">
            <span className="pricing-label">Factor fuera de horario pico (ej: 0.9 = −10%)</span>
            <input
              className="pricing-input"
              type="number"
              step="0.05"
              min="0.1"
              max="1"
              value={config.offPeakDiscount}
              onChange={(e) => setConfig((c) => ({ ...c, offPeakDiscount: e.target.value }))}
            />
          </label>
        </section>

        {/* ── Preview ─────────────────────── */}
        {base > 0 && (
          <section className="pricing-section pricing-section--preview">
            <div className="pricing-section-head">Vista previa de precios</div>
            <table className="price-preview">
              <thead>
                <tr>
                  <th>Escenario</th>
                  <th>Precio</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Precio base</td>
                  <td className="price-value">$U {base.toLocaleString('es-UY')}</td>
                </tr>
                {hasPeak && (
                  <>
                    <tr>
                      <td>Día pico + horario pico</td>
                      <td className="price-value price-value--peak">$U {calcPrice(base, mult).toLocaleString('es-UY')}</td>
                    </tr>
                    <tr>
                      <td>Día pico + fuera horario pico</td>
                      <td className="price-value">$U {calcPrice(base, mult * disc).toLocaleString('es-UY')}</td>
                    </tr>
                    <tr>
                      <td>Día normal + fuera horario pico</td>
                      <td className="price-value price-value--off">$U {calcPrice(base, disc).toLocaleString('es-UY')}</td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
            {courts.length > 1 && (
              <p className="pricing-hint">Se aplicará a {courts.length} canchas: {courts.map((c) => c.name).join(', ')}</p>
            )}
          </section>
        )}
      </div>

      {/* ── Actions ─────────────────────────── */}
      <div className="pricing-actions">
        {saveError && <span className="pricing-error">{saveError}</span>}
        {saved && (
          <span className="pricing-saved">
            <Check size={13} strokeWidth={2.5} aria-hidden="true" /> Precios guardados
          </span>
        )}
        <button
          className="btn-primary"
          onClick={handleSave}
          disabled={saving || !config.basePrice}
        >
          {saving
            ? <><Loader2 size={13} strokeWidth={2} className="spin" aria-hidden="true" /> Guardando...</>
            : `Aplicar a ${courts.length === 1 ? courts[0]?.name ?? 'cancha' : `${courts.length} canchas`}`}
        </button>
      </div>
    </div>
  );
}
