/**
 * DashboardHeader — KPI cards for the club dashboard
 *
 * Decision Context:
 * - Usa CSS variables (var(--color-card), var(--color-foreground), etc.) en lugar de
 *   valores HSL hardcodeados para adaptarse automáticamente al tema claro/oscuro.
 * - Los estilos de color de acento usan clases CSS (.kpi-value--orange, etc.) en vez de
 *   inline styles para que html.light pueda sobreescribirlos (los inline styles tienen
 *   mayor especificidad que los overrides de tema y no podían ser anulados desde el Astro
 *   page — por eso se migran a clases CSS aquí).
 * - Los overrides html.light van DENTRO del <style> del componente para garantizar que
 *   se aplican DESPUÉS del cascade inicial, ganando al estilo base del dark mode.
 * - Previously fixed bugs:
 *   - Colores hardcodeados (hsl(220 55% 11%) en kpi-card, hsl(210 20% 90%) en club name)
 *     no se adaptaban al tema claro: tarjetas permanecían oscuras y nombre del club
 *     invisible. Fix: CSS variables + html.light dentro del componente.
 */

import {
  Calendar,
  DollarSign,
  Users,
  Volleyball,
  Lock,
} from 'lucide-react';
import type { ClubMetrics, Club } from '../../graphql/operations/club-dashboard';

interface Props {
  club: Club;
  metrics: ClubMetrics;
}

const currencyFmt = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
});

type AccentColor = 'orange' | 'blue' | 'green' | 'red';

interface KpiCardProps {
  label: string;
  value: string;
  icon: React.ReactNode;
  accent?: AccentColor;
  subtext?: string;
}

function KpiCard({ label, value, icon, accent = 'orange', subtext }: KpiCardProps) {
  return (
    <div className="kpi-card">
      <div className={`kpi-icon kpi-icon--${accent}`}>
        {icon}
      </div>
      <div className="kpi-body">
        <div className={`kpi-value kpi-value--${accent}`}>{value}</div>
        <div className="kpi-label">{label}</div>
        {subtext && <div className="kpi-sub">{subtext}</div>}
      </div>
    </div>
  );
}

function OccupancyCard({ rate }: { rate: number }) {
  const pct = Math.min(100, Math.round(rate));
  const col =
    pct >= 80 ? 'hsl(142 70% 45%)' : pct >= 50 ? 'hsl(42 100% 60%)' : 'hsl(216 85% 60%)';

  return (
    <div className="kpi-card occ-card">
      <div className="occ-gauge" style={{ '--pct': `${pct}%`, '--col': col } as React.CSSProperties}>
        <span className="occ-num" style={{ color: col }}>{pct}%</span>
      </div>
      <div className="kpi-body">
        <div className="kpi-label">Ocupación</div>
        <div className="kpi-sub">slots con partido / slots activos</div>
      </div>
    </div>
  );
}

export default function DashboardHeader({ club, metrics }: Props) {
  return (
    <div className="dash-header">
      <div className="dash-club-name">
        <span className="dash-club-label">CLUB</span>
        <h2 className="dash-club-title">{club.name}</h2>
      </div>

      <div className="kpi-grid">
        <KpiCard
          label="Partidos esta semana"
          value={String(metrics.matchesThisWeek)}
          icon={<Calendar size={18} strokeWidth={2} aria-hidden="true" />}
          accent="orange"
        />
        <OccupancyCard rate={metrics.occupancyRate} />
        <KpiCard
          label="Ingresos estimados"
          value={currencyFmt.format(metrics.estimatedRevenue)}
          icon={<DollarSign size={18} strokeWidth={2} aria-hidden="true" />}
          accent="green"
          subtext="slots con partido en el rango"
        />
        <KpiCard
          label="Jugadores únicos (mes)"
          value={String(metrics.uniquePlayersThisMonth)}
          icon={<Users size={18} strokeWidth={2} aria-hidden="true" />}
          accent="blue"
        />
        <KpiCard
          label="Canchas activas"
          value={String(metrics.totalActiveCourts)}
          icon={<Volleyball size={18} strokeWidth={2} aria-hidden="true" />}
          accent="orange"
        />
        <KpiCard
          label="Slots bloqueados"
          value={String(metrics.blockedSlotsCount)}
          icon={<Lock size={18} strokeWidth={2} aria-hidden="true" />}
          accent={metrics.blockedSlotsCount > 0 ? 'red' : 'blue'}
        />
      </div>

      <style>{`
        /* ══ Header ══════════════════════════════════════════════ */
        .dash-header { display: flex; flex-direction: column; gap: 1.25rem; margin-bottom: 1.5rem; }

        .dash-club-label {
          font-family: 'Barlow Condensed', sans-serif; font-size: 0.7rem; font-weight: 700;
          letter-spacing: 0.2em; color: hsl(42 100% 55%); text-transform: uppercase;
        }
        .dash-club-title {
          font-family: 'Bebas Neue', sans-serif; font-size: 2rem; font-weight: 400;
          color: var(--color-foreground, hsl(210 20% 94%));
          margin: 0; letter-spacing: 0.04em; line-height: 1;
        }

        /* ══ KPI Grid ════════════════════════════════════════════ */
        .kpi-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 0.75rem;
        }

        /* ══ KPI Card ════════════════════════════════════════════ */
        .kpi-card {
          display: flex;
          align-items: flex-start;
          gap: 0.875rem;
          background: var(--color-card, hsl(220 55% 11%));
          border: 1px solid var(--color-border, rgba(255,255,255,0.06));
          border-radius: 10px;
          padding: 1rem 1.125rem;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .kpi-card:hover {
          border-color: var(--color-ring, hsl(35 100% 48%));
          box-shadow: 0 0 0 1px var(--color-ring, hsl(35 100% 48%)) inset;
        }

        /* ══ KPI Icon ════════════════════════════════════════════ */
        .kpi-icon {
          display: inline-flex; padding: 0.5rem; border-radius: 8px;
          flex-shrink: 0; background: rgba(255,255,255,0.05);
        }
        .kpi-icon--orange { color: hsl(42 100% 60%); background: rgba(246,164,0,0.1); }
        .kpi-icon--blue   { color: hsl(216 85% 60%); background: rgba(27,105,224,0.12); }
        .kpi-icon--green  { color: hsl(142 70% 45%); background: rgba(34,197,94,0.1); }
        .kpi-icon--red    { color: hsl(0 72% 55%);   background: rgba(220,38,38,0.1); }

        /* ══ KPI Body ════════════════════════════════════════════ */
        .kpi-body { display: flex; flex-direction: column; gap: 0.125rem; }

        .kpi-value {
          font-family: 'Bebas Neue', sans-serif; font-size: 1.6rem; line-height: 1;
        }
        .kpi-value--orange { color: hsl(42 100% 62%); }
        .kpi-value--blue   { color: hsl(216 85% 65%); }
        .kpi-value--green  { color: hsl(142 70% 48%); }
        .kpi-value--red    { color: hsl(0 72% 60%); }

        .kpi-label {
          font-family: 'Barlow Condensed', sans-serif; font-size: 0.75rem; font-weight: 700;
          letter-spacing: 0.1em; text-transform: uppercase;
          color: var(--color-muted-foreground, hsl(215 20% 50%));
        }
        .kpi-sub {
          font-family: 'Barlow', sans-serif; font-size: 0.78rem;
          color: var(--color-muted-foreground, hsl(215 20% 40%));
          margin-top: 0.125rem; opacity: 0.75;
        }

        /* ══ Occupancy ═══════════════════════════════════════════ */
        .occ-card { align-items: center; }
        .occ-gauge {
          width: 52px; height: 52px; border-radius: 50%; flex-shrink: 0;
          background: conic-gradient(var(--col) var(--pct), rgba(255,255,255,0.07) 0);
          display: flex; align-items: center; justify-content: center;
        }
        .occ-num { font-family: 'Bebas Neue', sans-serif; font-size: 1rem; line-height: 1; }

        /* ══ TEMA CLARO — html.light overrides ═══════════════════
           Van dentro del componente para garantizar que estos estilos
           se apliquen DESPUÉS del estilo base (dark) en el cascade.
           Los overrides en dashboard.astro eran sobreescritos por
           los <style> del componente que se inyectan en hydration.
           ════════════════════════════════════════════════════════ */
        html.light .dash-club-title {
          color: hsl(220 72% 10%);
        }
        html.light .dash-club-label {
          color: hsl(35 100% 38%);
        }

        html.light .kpi-card {
          background: hsl(0 0% 100%);
          border-color: hsl(220 13% 88%);
          box-shadow: 0 1px 4px rgba(0,0,0,0.06);
        }
        html.light .kpi-card:hover {
          border-color: hsl(35 100% 60%);
          box-shadow: 0 0 0 2px hsl(35 100% 60%) inset, 0 2px 8px rgba(0,0,0,0.08);
        }

        html.light .kpi-icon--orange { color: hsl(35 100% 38%); background: hsl(35 100% 94%); }
        html.light .kpi-icon--blue   { color: hsl(216 85% 40%); background: hsl(216 100% 94%); }
        html.light .kpi-icon--green  { color: hsl(142 70% 30%); background: hsl(142 60% 93%); }
        html.light .kpi-icon--red    { color: hsl(0 72% 45%);   background: hsl(0 80% 94%); }

        html.light .kpi-value--orange { color: hsl(35 100% 34%); }
        html.light .kpi-value--blue   { color: hsl(216 85% 38%); }
        html.light .kpi-value--green  { color: hsl(142 70% 28%); }
        html.light .kpi-value--red    { color: hsl(0 72% 42%); }

        html.light .kpi-label { color: hsl(215 16% 40%); }
        html.light .kpi-sub   { color: hsl(215 16% 50%); opacity: 1; }

        html.light .occ-gauge {
          background: conic-gradient(var(--col) var(--pct), rgba(0,0,0,0.06) 0);
          box-shadow: 0 0 0 3px hsl(220 13% 90%);
        }
        html.light .occ-num { color: inherit; }
      `}</style>
    </div>
  );
}
