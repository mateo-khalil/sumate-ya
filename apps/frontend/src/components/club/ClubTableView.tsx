/**
 * ClubTableView — sortable detailed table of matches for the dashboard
 *
 * Decision Context:
 * - Why: Table view gives the admin full column visibility and sortability for detailed
 *   analysis (e.g., sort by revenue, filter by court). Complements the calendar/agenda views.
 * - Sortable columns: date, court, status, participants. Sorting is client-side (no
 *   refetch) since the dataset is already loaded.
 * - No inline SQL or backend calls: sorting and filtering happen on the in-memory match list.
 * - Click on any row opens the MatchDetailModal (same onMatchClick callback).
 * - Previously fixed bugs: none relevant (new feature).
 */

import { useState } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import type { DashboardMatch } from '../../graphql/operations/club-dashboard';
import { FORMAT_LABELS, STATUS_LABELS } from '../../graphql/operations/club-dashboard';

interface Props {
  matches: DashboardMatch[];
  onMatchClick: (match: DashboardMatch) => void;
}

type SortKey = 'date' | 'court' | 'status' | 'participants' | 'format';
type SortDir = 'asc' | 'desc';

function statusBadgeBg(s: DashboardMatch['status']) {
  const map: Record<string, string> = {
    OPEN: 'rgba(246,164,0,0.15)',
    FULL: 'rgba(246,120,0,0.15)',
    IN_PROGRESS: 'rgba(59,130,246,0.15)',
    COMPLETED: 'rgba(255,255,255,0.05)',
    CANCELLED: 'rgba(239,68,68,0.12)',
  };
  return map[s] ?? 'rgba(255,255,255,0.05)';
}

function statusBadgeColor(s: DashboardMatch['status']) {
  const map: Record<string, string> = {
    OPEN: 'hsl(42 100% 65%)',
    FULL: 'hsl(30 100% 65%)',
    IN_PROGRESS: 'hsl(216 85% 70%)',
    COMPLETED: 'hsl(215 20% 50%)',
    CANCELLED: 'hsl(0 72% 60%)',
  };
  return map[s] ?? 'hsl(215 20% 55%)';
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

export default function ClubTableView({ matches, onMatchClick }: Props) {
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'date', dir: 'asc' });

  function toggleSort(key: SortKey) {
    setSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' },
    );
  }

  const sorted = [...matches].sort((a, b) => {
    let cmp = 0;
    switch (sort.key) {
      case 'date':
        cmp = a.scheduledAt.localeCompare(b.scheduledAt);
        break;
      case 'court':
        cmp = (a.courtName ?? '').localeCompare(b.courtName ?? '');
        break;
      case 'status':
        cmp = a.status.localeCompare(b.status);
        break;
      case 'participants':
        cmp = a.participantCount - b.participantCount;
        break;
      case 'format':
        cmp = a.format.localeCompare(b.format);
        break;
    }
    return sort.dir === 'asc' ? cmp : -cmp;
  });

  function SortIcon({ col }: { col: SortKey }) {
    if (sort.key !== col) return <ArrowUpDown size={12} strokeWidth={2} aria-hidden="true" />;
    return sort.dir === 'asc'
      ? <ArrowUp size={12} strokeWidth={2} aria-hidden="true" />
      : <ArrowDown size={12} strokeWidth={2} aria-hidden="true" />;
  }

  if (!matches.length) {
    return <p style={{ color: 'hsl(215 20% 40%)', fontFamily: 'Barlow,sans-serif', textAlign: 'center', padding: '2rem 0' }}>No hay partidos para mostrar</p>;
  }

  return (
    <div className="table-wrap">
      <table className="match-table">
        <thead>
          <tr>
            {(['date', 'court', 'format', 'status', 'participants'] as SortKey[]).map((col) => (
              <th key={col}>
                <button className="th-btn" onClick={() => toggleSort(col)}>
                  {col === 'date' && 'Fecha / Hora'}
                  {col === 'court' && 'Cancha'}
                  {col === 'format' && 'Formato'}
                  {col === 'status' && 'Estado'}
                  {col === 'participants' && 'Jugadores'}
                  <SortIcon col={col} />
                </button>
              </th>
            ))}
            <th>Organizador</th>
            <th>Próximo</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((m) => (
            <tr key={m.id} className="match-tr" onClick={() => onMatchClick(m)} tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && onMatchClick(m)}>
              <td>
                <div className="td-date">{formatDate(m.scheduledAt)}</div>
                <div className="td-time">{formatTime(m.scheduledAt)}</div>
              </td>
              <td className="td-court">{m.courtName ?? '—'}</td>
              <td className="td-format">{FORMAT_LABELS[m.format]}</td>
              <td>
                <span className="status-badge" style={{ background: statusBadgeBg(m.status), color: statusBadgeColor(m.status) }}>
                  {STATUS_LABELS[m.status]}
                </span>
              </td>
              <td>
                <div className="td-cap">
                  <div className="cap-bar">
                    <div
                      className="cap-fill"
                      style={{
                        width: `${m.capacity > 0 ? Math.min(100, (m.participantCount / m.capacity) * 100) : 0}%`,
                        background: m.participantCount >= m.capacity ? '#ef4444' : '#22c55e',
                      }}
                    />
                  </div>
                  <span>{m.participantCount}/{m.capacity}</span>
                </div>
              </td>
              <td className="td-org">{m.organizer.displayName}</td>
              <td className="td-tsl">{m.timeStatusLabel}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <style>{`
        .table-wrap { overflow-x: auto; }
        .match-table { width: 100%; border-collapse: collapse; font-family: 'Barlow', sans-serif; font-size: 0.84rem; }
        .match-table thead tr { border-bottom: 1px solid rgba(255,255,255,0.08); }
        .match-table th { padding: 0.5rem 0.75rem; text-align: left; white-space: nowrap; }
        .th-btn {
          display: flex; align-items: center; gap: 4px; background: none; border: none;
          color: hsl(215 20% 50%); font-family: 'Barlow Condensed', sans-serif;
          font-size: 0.72rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase;
          cursor: pointer; transition: color 0.12s;
        }
        .th-btn:hover { color: hsl(42 100% 60%); }
        .match-tr { border-bottom: 1px solid rgba(255,255,255,0.04); cursor: pointer; transition: background 0.1s; }
        .match-tr:hover { background: rgba(255,255,255,0.03); }
        .match-table td { padding: 0.625rem 0.75rem; color: hsl(210 20% 80%); vertical-align: middle; }
        .td-date { font-weight: 600; font-size: 0.82rem; }
        .td-time { font-size: 0.75rem; color: hsl(215 20% 50%); margin-top: 1px; }
        .td-court { color: hsl(215 20% 65%); }
        .td-format { font-family: 'Barlow Condensed', sans-serif; font-weight: 700; letter-spacing: 0.05em; color: hsl(215 20% 55%); text-transform: uppercase; font-size: 0.78rem; }
        .status-badge { border-radius: 4px; padding: 2px 8px; font-family: 'Barlow Condensed', sans-serif; font-size: 0.7rem; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase; }
        .td-cap { display: flex; align-items: center; gap: 6px; }
        .cap-bar { width: 48px; height: 4px; background: rgba(255,255,255,0.08); border-radius: 2px; overflow: hidden; }
        .cap-fill { height: 100%; border-radius: 2px; }
        .td-org { color: hsl(215 20% 65%); max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .td-tsl { color: hsl(215 20% 45%); font-size: 0.78rem; white-space: nowrap; }
      `}</style>
    </div>
  );
}
