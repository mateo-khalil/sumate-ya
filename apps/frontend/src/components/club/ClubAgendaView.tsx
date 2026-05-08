/**
 * ClubAgendaView — chronological list view of matches
 *
 * Decision Context:
 * - Why: Linear agenda format is easier to scan than the calendar grid for clubs with
 *   many matches across multiple courts. Groups by date with sticky headers.
 * - timeStatusLabel rendered inline per match for instant situational awareness.
 * - Participant bar uses same CapacityBar pattern as ClubScheduleView.
 * - Tabs "Próximos" / "Pasados" split future vs. past matches to reduce noise.
 * - Previously fixed bugs: none relevant (new feature).
 */

import { useState } from 'react';
import { Users, Clock, MapPin } from 'lucide-react';
import type { DashboardMatch } from '../../graphql/operations/club-dashboard';
import { FORMAT_LABELS, STATUS_LABELS } from '../../graphql/operations/club-dashboard';

interface Props {
  matches: DashboardMatch[];
  onMatchClick: (match: DashboardMatch) => void;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

function CapacityBar({ count, capacity }: { count: number; capacity: number }) {
  const pct = capacity > 0 ? Math.min(100, (count / capacity) * 100) : 0;
  const color = pct >= 90 ? '#ef4444' : pct >= 60 ? '#f6a400' : '#22c55e';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
      <Users size={12} strokeWidth={2} color="hsl(215 20% 45%)" aria-hidden="true" />
      <div style={{ flex: 1, height: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', overflow: 'hidden', maxWidth: '100px' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color }} />
      </div>
      <span style={{ fontSize: '0.75rem', color: 'hsl(215 20% 55%)', fontFamily: 'Barlow Condensed,sans-serif' }}>
        {count}/{capacity}
      </span>
    </div>
  );
}

function statusBadgeStyle(status: DashboardMatch['status']): React.CSSProperties {
  const map: Record<string, React.CSSProperties> = {
    OPEN: { background: 'rgba(246,164,0,0.12)', color: 'hsl(42 100% 65%)', border: '1px solid rgba(246,164,0,0.25)' },
    FULL: { background: 'rgba(246,120,0,0.12)', color: 'hsl(30 100% 65%)', border: '1px solid rgba(246,120,0,0.25)' },
    IN_PROGRESS: { background: 'rgba(59,130,246,0.12)', color: 'hsl(216 85% 70%)', border: '1px solid rgba(59,130,246,0.25)' },
    COMPLETED: { background: 'rgba(255,255,255,0.05)', color: 'hsl(215 20% 50%)', border: '1px solid rgba(255,255,255,0.08)' },
    CANCELLED: { background: 'rgba(239,68,68,0.1)', color: 'hsl(0 72% 60%)', border: '1px solid rgba(239,68,68,0.2)' },
  };
  return map[status] ?? map.OPEN;
}

function MatchRow({ match, onClick }: { match: DashboardMatch; onClick: () => void }) {
  return (
    <button className="match-row" onClick={onClick}>
      <div className="match-time">
        <Clock size={13} strokeWidth={2} aria-hidden="true" />
        <span>{formatTime(match.scheduledAt)}</span>
      </div>

      <div className="match-main">
        <div className="match-top">
          <span className="match-organizer">{match.organizer.displayName}</span>
          <span className="match-format">{FORMAT_LABELS[match.format]}</span>
        </div>

        {match.courtName && (
          <div className="match-court">
            <MapPin size={11} strokeWidth={2} aria-hidden="true" />
            <span>{match.courtName}</span>
          </div>
        )}

        <CapacityBar count={match.participantCount} capacity={match.capacity} />
      </div>

      <div className="match-right">
        <div className="match-status-badge" style={statusBadgeStyle(match.status)}>
          {STATUS_LABELS[match.status]}
        </div>
        <div className="match-time-label">{match.timeStatusLabel}</div>
      </div>

      <style>{`
        .match-row {
          display: flex; align-items: flex-start; gap: 1rem; width: 100%;
          background: hsl(220 55% 11%); border: 1px solid rgba(255,255,255,0.06);
          border-radius: 10px; padding: 0.875rem 1rem; cursor: pointer;
          text-align: left; font-family: 'Barlow', sans-serif; color: inherit;
          transition: border-color 0.12s, background 0.12s;
        }
        .match-row:hover { border-color: rgba(246,164,0,0.2); background: hsl(220 55% 13%); }
        .match-time {
          display: flex; flex-direction: column; align-items: center; gap: 3px;
          min-width: 44px; color: hsl(215 20% 50%); font-size: 0.8rem; font-weight: 600;
          font-family: 'Barlow Condensed', sans-serif;
        }
        .match-main { flex: 1; min-width: 0; }
        .match-top { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 3px; }
        .match-organizer { font-weight: 600; font-size: 0.9rem; color: hsl(210 20% 85%); }
        .match-format {
          font-family: 'Barlow Condensed', sans-serif; font-size: 0.7rem; font-weight: 700;
          color: hsl(215 20% 45%); letter-spacing: 0.06em; text-transform: uppercase;
        }
        .match-court {
          display: flex; align-items: center; gap: 4px;
          color: hsl(215 20% 45%); font-size: 0.78rem; margin-top: 2px;
        }
        .match-right { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; flex-shrink: 0; }
        .match-status-badge {
          font-family: 'Barlow Condensed', sans-serif; font-size: 0.7rem; font-weight: 700;
          letter-spacing: 0.08em; text-transform: uppercase; border-radius: 4px; padding: 2px 8px;
        }
        .match-time-label { font-size: 0.75rem; color: hsl(215 20% 45%); }
      `}</style>
    </button>
  );
}

export default function ClubAgendaView({ matches, onMatchClick }: Props) {
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  const now = Date.now();

  const upcoming = matches.filter((m) => new Date(m.scheduledAt).getTime() >= now - 60_000);
  const past = matches.filter((m) => new Date(m.scheduledAt).getTime() < now - 60_000);

  const displayed = tab === 'upcoming' ? upcoming : past;

  // Group by date
  const grouped = new Map<string, DashboardMatch[]>();
  for (const m of displayed) {
    const day = m.scheduledAt.slice(0, 10);
    if (!grouped.has(day)) grouped.set(day, []);
    grouped.get(day)!.push(m);
  }

  return (
    <div className="agenda-wrap">
      <div className="agenda-tabs">
        <button
          className={`agenda-tab ${tab === 'upcoming' ? 'active' : ''}`}
          onClick={() => setTab('upcoming')}
        >
          Próximos ({upcoming.length})
        </button>
        <button
          className={`agenda-tab ${tab === 'past' ? 'active' : ''}`}
          onClick={() => setTab('past')}
        >
          Pasados ({past.length})
        </button>
      </div>

      {displayed.length === 0 ? (
        <p className="agenda-empty">No hay partidos para mostrar</p>
      ) : (
        [...grouped.entries()].map(([day, dayMatches]) => (
          <div key={day} className="agenda-day-group">
            <div className="agenda-day-header">{formatDate(day)}</div>
            <div className="agenda-day-list">
              {dayMatches.map((m) => (
                <MatchRow key={m.id} match={m} onClick={() => onMatchClick(m)} />
              ))}
            </div>
          </div>
        ))
      )}

      <style>{`
        .agenda-wrap { display: flex; flex-direction: column; gap: 1.25rem; }
        .agenda-tabs { display: flex; gap: 0.375rem; margin-bottom: 0.25rem; }
        .agenda-tab {
          background: transparent; border: 1px solid rgba(255,255,255,0.1);
          border-radius: 6px; padding: 0.35rem 1rem; font-size: 0.82rem;
          font-family: 'Barlow Condensed', sans-serif; font-weight: 700; letter-spacing: 0.05em;
          color: hsl(215 20% 55%); cursor: pointer; transition: all 0.12s;
        }
        .agenda-tab.active {
          background: rgba(246,164,0,0.1); border-color: rgba(246,164,0,0.3);
          color: hsl(42 100% 65%);
        }
        .agenda-empty { color: hsl(215 20% 40%); font-family: 'Barlow', sans-serif; padding: 2rem 0; text-align: center; }
        .agenda-day-group { display: flex; flex-direction: column; gap: 0.5rem; }
        .agenda-day-header {
          font-family: 'Barlow Condensed', sans-serif; font-size: 0.8rem; font-weight: 700;
          letter-spacing: 0.1em; text-transform: uppercase; color: hsl(42 100% 55%);
          padding: 0.25rem 0; border-bottom: 1px solid rgba(255,255,255,0.05); margin-bottom: 0.25rem;
        }
        .agenda-day-list { display: flex; flex-direction: column; gap: 0.5rem; }
      `}</style>
    </div>
  );
}
