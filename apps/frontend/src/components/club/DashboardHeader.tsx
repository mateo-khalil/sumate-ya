/**
 * DashboardHeader — KPI cards for the club dashboard
 *
 * Decision Context:
 * - Why: Surfaces the six most actionable metrics for a club admin in a single glance.
 *   Follows the FIFA dark stadium aesthetic (same tokens as horarios.astro).
 * - Revenue format: uses Intl.NumberFormat with 'es-AR' locale for peso formatting
 *   ($1.500,00) without hardcoding separator chars.
 * - occupancyRate uses a radial-style percentage bar rendered with CSS conic-gradient
 *   (no SVG dependency, no extra library) capped at 100%.
 * - Each card uses an icon from lucide-react per design-system.md rules.
 * - Previously fixed bugs: none relevant (new feature).
 */

import {
  Calendar,
  TrendingUp,
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

interface KpiCardProps {
  label: string;
  value: string;
  icon: React.ReactNode;
  accent?: 'orange' | 'blue' | 'green' | 'red';
  subtext?: string;
}

function KpiCard({ label, value, icon, accent = 'orange', subtext }: KpiCardProps) {
  const accentColor = {
    orange: 'hsl(42 100% 60%)',
    blue: 'hsl(216 85% 60%)',
    green: 'hsl(142 70% 45%)',
    red: 'hsl(0 72% 55%)',
  }[accent];

  return (
    <div className="kpi-card">
      <div className="kpi-icon" style={{ color: accentColor }}>
        {icon}
      </div>
      <div className="kpi-body">
        <div className="kpi-value" style={{ color: accentColor }}>
          {value}
        </div>
        <div className="kpi-label">{label}</div>
        {subtext && <div className="kpi-sub">{subtext}</div>}
      </div>
      <style>{`
        .kpi-card {
          display: flex;
          align-items: flex-start;
          gap: 0.875rem;
          background: hsl(220 55% 11%);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 10px;
          padding: 1rem 1.125rem;
          transition: border-color 0.15s;
        }
        .kpi-card:hover { border-color: rgba(255,255,255,0.12); }
        .kpi-icon {
          display: inline-flex;
          padding: 0.5rem;
          background: rgba(255,255,255,0.05);
          border-radius: 8px;
          flex-shrink: 0;
        }
        .kpi-body { display: flex; flex-direction: column; gap: 0.125rem; }
        .kpi-value { font-family: 'Bebas Neue', sans-serif; font-size: 1.6rem; line-height: 1; }
        .kpi-label { font-family: 'Barlow Condensed', sans-serif; font-size: 0.75rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: hsl(215 20% 50%); }
        .kpi-sub { font-family: 'Barlow', sans-serif; font-size: 0.78rem; color: hsl(215 20% 40%); margin-top: 0.125rem; }
      `}</style>
    </div>
  );
}

function OccupancyCard({ rate }: { rate: number }) {
  const pct = Math.min(100, Math.round(rate));
  const color =
    pct >= 80
      ? 'hsl(142 70% 45%)'
      : pct >= 50
        ? 'hsl(42 100% 60%)'
        : 'hsl(216 85% 60%)';

  return (
    <div className="kpi-card occ-card">
      <div className="occ-gauge" style={{ '--pct': `${pct}%`, '--col': color } as React.CSSProperties}>
        <span className="occ-num" style={{ color }}>{pct}%</span>
      </div>
      <div className="kpi-body">
        <div className="kpi-label">Ocupación</div>
        <div className="kpi-sub">slots con partido / slots activos</div>
      </div>
      <style>{`
        .occ-card { align-items: center; }
        .occ-gauge {
          width: 52px; height: 52px; border-radius: 50%; flex-shrink: 0;
          background: conic-gradient(var(--col) var(--pct), rgba(255,255,255,0.07) 0);
          display: flex; align-items: center; justify-content: center;
        }
        .occ-num { font-family: 'Bebas Neue', sans-serif; font-size: 1rem; line-height: 1; }
      `}</style>
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
        .dash-header { display: flex; flex-direction: column; gap: 1.25rem; margin-bottom: 1.5rem; }
        .dash-club-label {
          font-family: 'Barlow Condensed', sans-serif; font-size: 0.7rem; font-weight: 700;
          letter-spacing: 0.2em; color: hsl(42 100% 55%); text-transform: uppercase;
        }
        .dash-club-title {
          font-family: 'Bebas Neue', sans-serif; font-size: 1.6rem; font-weight: 400;
          color: hsl(210 20% 90%); margin: 0; letter-spacing: 0.04em; line-height: 1;
        }
        .kpi-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 0.75rem;
        }
      `}</style>
    </div>
  );
}
