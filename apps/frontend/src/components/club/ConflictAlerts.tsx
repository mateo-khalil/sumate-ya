/**
 * ConflictAlerts — banner list of detected scheduling conflicts
 *
 * Decision Context:
 * - Why: Surfaces data-integrity issues the admin may not notice otherwise.
 *   Conflicts detected server-side (clubDashboardService) are rendered here as
 *   actionable alerts with a type-based icon and description.
 * - Types: NO_PARTICIPANTS (match < 24h, 0 players), SLOT_BLOCKED, SLOT_INACTIVE.
 *   Phase 2 will add OVERLAP detection.
 * - Dismiss: client-side only (no persistence) — conflicts reappear on next load
 *   until the underlying issue is resolved.
 * - Previously fixed bugs: none relevant (new feature).
 */

import { useState } from 'react';
import { TriangleAlert, X } from 'lucide-react';
import type { ConflictAlert } from '../../graphql/operations/club-dashboard';

interface Props {
  conflicts: ConflictAlert[];
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }) +
    ' ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

export default function ConflictAlerts({ conflicts }: Props) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const visible = conflicts.filter((c) => !dismissed.has(c.matchId + c.type));
  if (!visible.length) return null;

  function dismiss(c: ConflictAlert) {
    setDismissed((prev) => new Set([...prev, c.matchId + c.type]));
  }

  return (
    <div className="alerts-wrap">
      <div className="alerts-header">
        <TriangleAlert size={15} strokeWidth={2} aria-hidden="true" />
        <span>{visible.length} conflicto{visible.length !== 1 ? 's' : ''} detectado{visible.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="alerts-list">
        {visible.map((c) => (
          <div key={c.matchId + c.type} className="alert-item">
            <TriangleAlert size={13} strokeWidth={2} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
            <div className="alert-body">
              <div className="alert-desc">{c.description}</div>
              <div className="alert-meta">{c.courtName} · {formatTime(c.scheduledAt)}</div>
            </div>
            <button
              className="alert-dismiss"
              onClick={() => dismiss(c)}
              aria-label="Descartar alerta"
            >
              <X size={13} strokeWidth={2} aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>

      <style>{`
        .alerts-wrap {
          background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.2);
          border-radius: 10px; padding: 0.875rem 1rem; margin-bottom: 1.25rem;
        }
        .alerts-header {
          display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.625rem;
          font-family: 'Barlow Condensed', sans-serif; font-size: 0.8rem; font-weight: 700;
          letter-spacing: 0.1em; text-transform: uppercase; color: hsl(0 72% 65%);
        }
        .alerts-list { display: flex; flex-direction: column; gap: 0.5rem; }
        .alert-item {
          display: flex; align-items: flex-start; gap: 0.625rem;
          color: hsl(0 72% 65%); font-family: 'Barlow', sans-serif;
        }
        .alert-body { flex: 1; min-width: 0; }
        .alert-desc { font-size: 0.84rem; color: hsl(0 72% 70%); }
        .alert-meta { font-size: 0.75rem; color: hsl(0 72% 50%); margin-top: 2px; }
        .alert-dismiss {
          background: none; border: none; cursor: pointer; color: hsl(0 72% 50%);
          display: inline-flex; align-items: center; justify-content: center;
          min-width: 44px; min-height: 44px; flex-shrink: 0;
          transition: color 0.12s;
        }
        .alert-dismiss:hover { color: hsl(0 72% 70%); }
      `}</style>
    </div>
  );
}
