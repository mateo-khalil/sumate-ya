/**
 * SlotHistoryTab — audit log viewer for a single club slot
 *
 * Decision Context:
 * - Why separate file: SlotEditModal was approaching the 250-line soft limit. Extracting
 *   this tab keeps both files focused and under the 600-line hard limit.
 * - Fetch on mount: posts to the authenticated /api/graphql-auth proxy (not the shared
 *   urqlClient, and not the useClubSlots hook) because the history is lazy-loaded only when
 *   the "Historial" tab is opened, avoiding unnecessary round-trips on other tabs.
 * - changedBy.displayName is currently '' (stub) until audit log enrichment is wired;
 *   the fallback shows "Administrador" since only club admins can mutate slots.
 * - Diff visual: previousValue and newValue are JSON strings. We parse them and show
 *   changed keys as "campo: antes → después". Keys absent in one snapshot are shown
 *   as added/removed with '—' for the missing side.
 * - formatRelativeDate: lightweight implementation without date-fns to avoid adding a
 *   dependency just for one use case.
 * - Previously fixed bugs:
 *   - History always showed "No se pudo cargar el historial". The shared urqlClient posts
 *     to the unauthenticated /api/graphql proxy, which cannot read the HttpOnly cookie, so
 *     slotAuditLog failed with "Authentication required". Fixed by posting to
 *     /api/graphql-auth with the SSR-provided accessToken as a Bearer header — the same
 *     strategy every mutation in useClubSlots already uses.
 */

import { useEffect, useState } from 'react';
import { Loader2, Clock, TriangleAlert } from 'lucide-react';
import type { SlotAuditLog } from '../../graphql/operations/club-slots';
import { SLOT_AUDIT_LOG, SLOT_ACTION_LABELS } from '../../graphql/operations/club-slots';

// =====================================================
// Utilities
// =====================================================

function formatRelativeDate(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'justo ahora';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `hace ${days} día${days !== 1 ? 's' : ''}`;
  return new Date(isoString).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function parseJsonBlob(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function DiffView({ prev, next }: { prev: string | null; next: string | null }) {
  const prevObj = parseJsonBlob(prev);
  const nextObj = parseJsonBlob(next);
  const keys = Array.from(new Set([...Object.keys(prevObj), ...Object.keys(nextObj)]));

  if (keys.length === 0) return null;

  const changed = keys.filter((k) => String(prevObj[k] ?? '—') !== String(nextObj[k] ?? '—'));
  if (changed.length === 0) return <span className="diff-nochange">Sin cambios de datos</span>;

  return (
    <dl className="diff-list">
      {changed.map((k) => (
        <div key={k} className="diff-row">
          <dt className="diff-key">{k}</dt>
          <dd className="diff-value">
            <span className="diff-before">{String(prevObj[k] ?? '—')}</span>
            <span className="diff-arrow"> → </span>
            <span className="diff-after">{String(nextObj[k] ?? '—')}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

// =====================================================
// Main component
// =====================================================

interface SlotHistoryTabProps {
  slotId: string;
  accessToken: string;
}

export function SlotHistoryTab({ slotId, accessToken }: SlotHistoryTabProps) {
  const [entries, setEntries] = useState<SlotAuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    // Post to the authenticated proxy with an explicit Bearer token — the HttpOnly cookie
    // is not readable from JS, so the shared urqlClient (/api/graphql) fails auth here.
    fetch('/api/graphql-auth', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({ query: SLOT_AUDIT_LOG, variables: { slotId, limit: 30, offset: 0 } }),
    })
      .then((res) => res.json())
      .then((json: { data?: { slotAuditLog: SlotAuditLog[] }; errors?: Array<{ message: string }> }) => {
        if (cancelled) return;
        if (json.errors?.length) {
          setError(json.errors[0].message);
        } else {
          setEntries(json.data?.slotAuditLog ?? []);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Error al cargar el historial');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [slotId, accessToken]);

  if (loading) {
    return (
      <div className="history-state">
        <Loader2 size={20} strokeWidth={2} className="history-spinner" aria-hidden="true" />
        <span>Cargando historial...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="history-state history-state--error">
        <TriangleAlert size={18} strokeWidth={2} aria-hidden="true" />
        <span>No se pudo cargar el historial</span>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="history-state">
        <Clock size={20} strokeWidth={2} aria-hidden="true" />
        <span>Sin cambios registrados</span>
      </div>
    );
  }

  return (
    <ul className="history-list">
      {entries.map((entry) => (
        <li key={entry.id} className="history-entry">
          <div className="history-entry-header">
            <span className="history-action">
              {SLOT_ACTION_LABELS[entry.action] ?? entry.action}
            </span>
            <span className="history-who">
              {entry.changedBy?.displayName || 'Administrador'}
            </span>
            <span className="history-when">{formatRelativeDate(entry.createdAt)}</span>
          </div>
          {entry.reason && (
            <p className="history-reason">Motivo: {entry.reason}</p>
          )}
          <DiffView prev={entry.previousValue} next={entry.newValue} />
        </li>
      ))}
    </ul>
  );
}
