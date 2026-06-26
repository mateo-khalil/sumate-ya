/**
 * ClubStatisticsView — club admin analytics (Estadísticas)
 *
 * Decision Context:
 * - Estadísticas was a "Próximo" placeholder. This island renders aggregations from the new
 *   clubStatistics query over a date range the user controls: a KPI summary plus breakdowns by
 *   match status, revenue per court, peak days, peak hours, and a daily trend.
 * - Charts are pure CSS/flex bars (no charting dependency) to keep the bundle lean and on-brand
 *   with the FIFA dark stadium look — consistent with the dashboard's hand-built gauges.
 * - SSR-hydrated initial data + accessToken prop. Changing the date range refetches client-side
 *   via the shared gqlAuth helper (the backend caches each range for cheap recomputation).
 * - occupancyRate arrives as a 0–100 percentage; cancellationRate as a 0–1 fraction.
 * - Peak-hours layout: "Horas pico" renders 24 hourly bars and is a `wide` (full-row) panel.
 *   In a 1/3-width grid cell (minmax(300px,1fr)) the 24 bars cannot fit and overflow the card's
 *   right edge. VBars also has overflow-x:auto + a non-zero flex-basis so bars scroll instead of
 *   spilling out on narrow viewports, rather than relying on shrink-to-zero (which clips labels).
 * - Previously fixed bugs: "Horas pico" bars overflowed the panel ("se sale") because the 24-bar
 *   chart shared the 7-bar Días grid cell. Fixed by making the panel wide + overflow-safe VBars.
 */

import { useEffect, useRef, useState } from 'react';
import {
  CalendarRange, Trophy, Ban, Users, DollarSign, Gauge, Volleyball, Loader2, AlertTriangle,
} from 'lucide-react';
import { gqlAuth } from '../../lib/graphqlAuth';
import {
  GET_CLUB_STATISTICS,
  MATCH_STATUS_LABELS,
  type ClubStatistics,
  type ClubStatisticsFilters,
} from '../../graphql/operations/club-statistics';

interface Props {
  initialData: ClubStatistics | null;
  initialError: string | null;
  initialFilters: ClubStatisticsFilters;
  accessToken: string;
}

const fmtNum = (n: number) => n.toLocaleString('es-AR');
const fmtMoney = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}`;
const fmtPct = (n: number) => `${Math.round(n)}%`;

export default function ClubStatisticsView({ initialData, initialError, initialFilters, accessToken }: Props) {
  const [data, setData] = useState<ClubStatistics | null>(initialData);
  const [error, setError] = useState<string | null>(initialError);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<ClubStatisticsFilters>(initialFilters);
  const firstRun = useRef(true);

  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return; }
    let cancelled = false;
    setLoading(true);
    setError(null);
    gqlAuth<{ clubStatistics: ClubStatistics }>(GET_CLUB_STATISTICS, { filters }, accessToken)
      .then((d) => { if (!cancelled) setData(d.clubStatistics); })
      .catch((err: unknown) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Error al cargar las estadísticas'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [filters, accessToken]);

  return (
    <div className="cs-root">
      {/* Range picker */}
      <div className="cs-toolbar">
        <span className="cs-range-icon"><CalendarRange size={15} aria-hidden="true" /></span>
        <label className="cs-range-field">
          <span>Desde</span>
          <input type="date" value={filters.startDate ?? ''} onChange={(e) => setFilters({ ...filters, startDate: e.target.value || undefined })} />
        </label>
        <label className="cs-range-field">
          <span>Hasta</span>
          <input type="date" value={filters.endDate ?? ''} onChange={(e) => setFilters({ ...filters, endDate: e.target.value || undefined })} />
        </label>
        {loading && <Loader2 className="cs-spin" size={15} aria-hidden="true" />}
      </div>

      {error && !data && (
        <div className="cs-banner" role="alert"><AlertTriangle size={16} aria-hidden="true" /><span>{error}</span></div>
      )}

      {data && (
        <>
          {/* KPI summary */}
          <div className="cs-kpis">
            <Kpi icon={<Volleyball size={18} aria-hidden="true" />} label="Partidos" value={fmtNum(data.summary.totalMatches)} sub={`${fmtNum(data.summary.completedMatches)} finalizados`} />
            <Kpi icon={<Gauge size={18} aria-hidden="true" />} label="Ocupación aprox." value={fmtPct(data.summary.occupancyRate)} sub={`${data.summary.activeCourts} cancha(s) activa(s)`} />
            <Kpi icon={<DollarSign size={18} aria-hidden="true" />} label="Ingresos estimados" value={fmtMoney(data.summary.estimatedRevenue)} sub="partidos + reservas" />
            <Kpi icon={<Users size={18} aria-hidden="true" />} label="Jugadores únicos" value={fmtNum(data.summary.uniquePlayers)} sub="en el rango" />
            <Kpi icon={<CalendarRange size={18} aria-hidden="true" />} label="Reservas" value={fmtNum(data.summary.totalReservations)} sub="activas en el rango" />
            <Kpi icon={<Ban size={18} aria-hidden="true" />} label="Cancelación" value={fmtPct(data.summary.cancellationRate * 100)} sub={`${fmtNum(data.summary.cancelledMatches)} cancelados`} />
          </div>

          <div className="cs-grid">
            {/* Matches by status */}
            <Panel title="Partidos por estado" icon={<Trophy size={16} aria-hidden="true" />}>
              <HBars
                rows={data.matchesByStatus.map((s) => ({ label: MATCH_STATUS_LABELS[s.status] ?? s.status, value: s.count }))}
                fmt={fmtNum}
                empty="Sin partidos en el rango"
              />
            </Panel>

            {/* Revenue by court */}
            <Panel title="Ingresos por cancha" icon={<DollarSign size={16} aria-hidden="true" />}>
              <HBars
                rows={data.revenueByCourt.map((c) => ({ label: c.courtName, value: c.revenue, hint: `${c.matches} part.` }))}
                fmt={fmtMoney}
                empty="Sin ingresos en el rango"
              />
            </Panel>

            {/* Peak days */}
            <Panel title="Días con más partidos" icon={<CalendarRange size={16} aria-hidden="true" />}>
              <VBars items={data.matchesByDayOfWeek.map((d) => ({ label: d.label, value: d.count }))} />
            </Panel>

            {/* Peak hours — wide row: 24 hourly bars need full width or they overflow a 1/3 grid cell */}
            <Panel title="Horas pico" icon={<Gauge size={16} aria-hidden="true" />} wide>
              {data.matchesByHour.length === 0
                ? <p className="cs-empty">Sin datos de horario</p>
                : <VBars items={data.matchesByHour.map((h) => ({ label: `${String(h.hour).padStart(2, '0')}h`, value: h.count }))} />}
            </Panel>
          </div>

          {/* Trend */}
          <Panel title="Tendencia diaria de partidos" icon={<CalendarRange size={16} aria-hidden="true" />} wide>
            <Trend points={data.matchesTrend} />
          </Panel>
        </>
      )}

      <StatsStyles />
    </div>
  );
}

// =====================================================
// Sub-components
// =====================================================

function Kpi({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <div className="cs-kpi">
      <span className="cs-kpi-icon">{icon}</span>
      <div className="cs-kpi-body">
        <span className="cs-kpi-value">{value}</span>
        <span className="cs-kpi-label">{label}</span>
        <span className="cs-kpi-sub">{sub}</span>
      </div>
    </div>
  );
}

function Panel({ title, icon, children, wide }: { title: string; icon: React.ReactNode; children: React.ReactNode; wide?: boolean }) {
  return (
    <section className={`cs-panel ${wide ? 'cs-panel--wide' : ''}`}>
      <h3 className="cs-panel-title">{icon}<span>{title}</span></h3>
      {children}
    </section>
  );
}

function HBars({ rows, fmt, empty }: { rows: Array<{ label: string; value: number; hint?: string }>; fmt: (n: number) => string; empty: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (rows.length === 0 || rows.every((r) => r.value === 0)) return <p className="cs-empty">{empty}</p>;
  return (
    <div className="cs-hbars">
      {rows.map((r, i) => (
        <div key={i} className="cs-hbar">
          <span className="cs-hbar-label" title={r.label}>{r.label}</span>
          <span className="cs-hbar-track"><span className="cs-hbar-fill" style={{ width: `${(r.value / max) * 100}%` }} /></span>
          <span className="cs-hbar-val">{fmt(r.value)}{r.hint && <em> · {r.hint}</em>}</span>
        </div>
      ))}
    </div>
  );
}

function VBars({ items }: { items: Array<{ label: string; value: number }> }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="cs-vbars">
      {items.map((it, i) => (
        <div key={i} className="cs-vbar">
          <span className="cs-vbar-track"><span className="cs-vbar-fill" style={{ height: `${(it.value / max) * 100}%` }} /></span>
          <span className="cs-vbar-val">{it.value}</span>
          <span className="cs-vbar-label">{it.label}</span>
        </div>
      ))}
    </div>
  );
}

function Trend({ points }: { points: Array<{ date: string; count: number }> }) {
  const max = Math.max(1, ...points.map((p) => p.count));
  if (points.length === 0) return <p className="cs-empty">Sin datos en el rango</p>;
  const first = points[0]?.date;
  const last = points[points.length - 1]?.date;
  return (
    <div className="cs-trend">
      <div className="cs-trend-bars">
        {points.map((p, i) => (
          <span key={i} className="cs-trend-bar" title={`${p.date}: ${p.count}`} style={{ height: `${(p.count / max) * 100}%` }} />
        ))}
      </div>
      <div className="cs-trend-axis"><span>{first}</span><span>{last}</span></div>
    </div>
  );
}

// =====================================================
// Styles
// =====================================================

function StatsStyles() {
  return (
    <style>{`
      .cs-root { display: flex; flex-direction: column; gap: 1.25rem; }
      .cs-spin { animation: cs-spin 0.8s linear infinite; color: hsl(35 100% 60%); }
      @keyframes cs-spin { to { transform: rotate(360deg); } }

      .cs-toolbar { display: flex; align-items: flex-end; gap: 0.75rem; flex-wrap: wrap; }
      .cs-range-icon { color: hsl(35 100% 60%); padding-bottom: 0.5rem; }
      .cs-range-field { display: flex; flex-direction: column; gap: 0.25rem; }
      .cs-range-field span { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.06em; color: hsl(215 20% 55%); }
      .cs-range-field input {
        padding: 0.45rem 0.6rem; border-radius: 8px; font-size: 0.85rem; font-family: inherit;
        background: var(--color-input, hsl(220 30% 16%)); border: 1px solid var(--color-border, hsl(220 30% 22%)); color: var(--color-foreground, #fff);
      }

      .cs-banner { display: flex; align-items: center; gap: 0.5rem; padding: 0.7rem 0.9rem; border-radius: 8px; font-size: 0.85rem; background: rgba(239,68,68,0.12); border: 1px solid rgba(239,68,68,0.3); color: hsl(0 72% 72%); }

      .cs-kpis { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 0.85rem; }
      .cs-kpi { display: flex; align-items: center; gap: 0.7rem; padding: 0.95rem 1rem; border-radius: 13px; background: var(--color-card, hsl(220 55% 11%)); border: 1px solid var(--color-border, hsl(220 30% 20%)); }
      .cs-kpi-icon { display: inline-flex; align-items: center; justify-content: center; width: 38px; height: 38px; border-radius: 10px; background: rgba(246,164,0,0.14); color: hsl(35 100% 60%); flex-shrink: 0; }
      .cs-kpi-body { display: flex; flex-direction: column; min-width: 0; }
      .cs-kpi-value { font-family: 'Bebas Neue', sans-serif; font-size: 1.5rem; line-height: 1; color: var(--color-foreground, #fff); }
      .cs-kpi-label { font-size: 0.78rem; font-weight: 600; color: hsl(215 20% 70%); margin-top: 0.15rem; }
      .cs-kpi-sub { font-size: 0.7rem; color: hsl(215 20% 50%); }

      .cs-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1rem; }
      .cs-panel { padding: 1.1rem 1.2rem; border-radius: 14px; background: var(--color-card, hsl(220 55% 11%)); border: 1px solid var(--color-border, hsl(220 30% 20%)); }
      .cs-panel--wide { grid-column: 1 / -1; }
      .cs-panel-title { display: flex; align-items: center; gap: 0.5rem; margin: 0 0 1rem; font-family: 'Barlow Condensed', sans-serif; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; font-size: 0.85rem; color: hsl(215 20% 70%); }
      .cs-panel-title :global(svg) { color: hsl(35 100% 60%); }
      .cs-empty { color: hsl(215 20% 50%); font-size: 0.85rem; margin: 0.5rem 0; }

      /* Horizontal bars */
      .cs-hbars { display: flex; flex-direction: column; gap: 0.6rem; }
      .cs-hbar { display: grid; grid-template-columns: 7rem 1fr auto; align-items: center; gap: 0.6rem; }
      .cs-hbar-label { font-size: 0.8rem; color: hsl(215 20% 70%); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .cs-hbar-track { height: 10px; border-radius: 6px; background: rgba(255,255,255,0.06); overflow: hidden; }
      .cs-hbar-fill { display: block; height: 100%; border-radius: 6px; background: linear-gradient(90deg, hsl(35 100% 50%), hsl(42 100% 60%)); }
      .cs-hbar-val { font-size: 0.8rem; font-weight: 600; color: var(--color-foreground, #fff); white-space: nowrap; }
      .cs-hbar-val em { color: hsl(215 20% 55%); font-style: normal; font-weight: 400; }

      /* Vertical bars — overflow-safe: bars grow to fill when there is room, scroll instead of
         spilling out of the card when cramped (the 24-bar "Horas pico" chart on narrow viewports). */
      .cs-vbars { display: flex; align-items: flex-end; gap: 0.5rem; height: 160px; overflow-x: auto; padding-bottom: 0.25rem; }
      .cs-vbar { flex: 1 0 1.4rem; min-width: 1.4rem; display: flex; flex-direction: column; align-items: center; gap: 0.25rem; height: 100%; justify-content: flex-end; }
      .cs-vbar-track { width: 100%; max-width: 34px; flex: 1; display: flex; align-items: flex-end; }
      .cs-vbar-fill { width: 100%; border-radius: 5px 5px 0 0; background: linear-gradient(180deg, hsl(216 85% 60%), hsl(216 85% 45%)); min-height: 2px; }
      .cs-vbar-val { font-size: 0.72rem; font-weight: 600; color: var(--color-foreground, #fff); white-space: nowrap; }
      .cs-vbar-label { font-size: 0.68rem; color: hsl(215 20% 55%); white-space: nowrap; }

      /* Trend */
      .cs-trend { display: flex; flex-direction: column; gap: 0.4rem; }
      .cs-trend-bars { display: flex; align-items: flex-end; gap: 2px; height: 120px; }
      .cs-trend-bar { flex: 1; min-width: 2px; border-radius: 2px 2px 0 0; background: hsl(35 100% 55%); min-height: 1px; }
      .cs-trend-axis { display: flex; justify-content: space-between; font-size: 0.68rem; color: hsl(215 20% 50%); }

      /* Light theme */
      :global(html.light) .cs-kpi, :global(html.light) .cs-panel { background: #fff; border-color: rgba(0,0,0,0.1); }
      :global(html.light) .cs-kpi-value, :global(html.light) .cs-hbar-val, :global(html.light) .cs-vbar-val { color: hsl(220 72% 12%); }
      :global(html.light) .cs-range-field input { background: hsl(0 0% 98%); border-color: rgba(0,0,0,0.15); color: hsl(220 72% 12%); }
      :global(html.light) .cs-hbar-track { background: rgba(0,0,0,0.06); }

      @media (max-width: 600px) {
        .cs-hbar { grid-template-columns: 5rem 1fr auto; }
      }
    `}</style>
  );
}
