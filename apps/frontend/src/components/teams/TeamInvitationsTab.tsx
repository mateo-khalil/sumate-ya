/**
 * TeamInvitationsTab — tab del capitán para gestionar invitaciones enviadas.
 *
 * Decision Context:
 * - Fetchea TEAM_INVITATIONS (todas las invitaciones del equipo, todas las status).
 * - El capitán puede cancelar invitaciones pendientes.
 * - onInviteNew abre InvitePlayerDialog desde el padre (TeamDashboard).
 * - Previously fixed bugs: none relevant.
 */

import { useState, useEffect } from 'react';
import { UserPlus, Loader2, X, Clock, Check, XCircle, Mail } from 'lucide-react';
import type { TeamInvitation } from '../../graphql/operations/teams';
import { TEAM_INVITATIONS, CANCEL_INVITATION } from '../../graphql/operations/teams';

interface Props {
  teamId: string;
  onInviteNew: () => void;
}

async function gqlAuthPost<T>(query: string, variables?: Record<string, unknown>): Promise<{ data?: T; error?: string }> {
  try {
    const res = await fetch('/api/graphql-auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    });
    const json = await res.json() as { data?: T; errors?: { message: string }[] };
    if (json.errors?.length) return { error: json.errors[0].message };
    return { data: json.data };
  } catch {
    return { error: 'Error de red' };
  }
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  PENDING:  { label: 'Pendiente', className: 'status-pending'  },
  ACCEPTED: { label: 'Aceptada',  className: 'status-accepted' },
  REJECTED: { label: 'Rechazada', className: 'status-rejected' },
  EXPIRED:  { label: 'Expirada',  className: 'status-expired'  },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function TeamInvitationsTab({ teamId, onInviteNew }: Props) {
  const [invitations, setInvitations] = useState<TeamInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [canceling, setCanceling] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data, error } = await gqlAuthPost<{ teamInvitations: TeamInvitation[] }>(
      TEAM_INVITATIONS, { teamId }
    );
    if (error) setFetchError(error);
    else setInvitations(data?.teamInvitations ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [teamId]);

  async function handleCancel(invId: string, playerName: string) {
    if (!confirm(`¿Cancelar la invitación a ${playerName}?`)) return;
    setCanceling(invId);
    const { data, error } = await gqlAuthPost<{ cancelInvitation: { success: boolean; message: string } }>(
      CANCEL_INVITATION, { invitationId: invId }
    );
    if (error || !data?.cancelInvitation.success) {
      alert(error ?? data?.cancelInvitation.message ?? 'Error al cancelar');
    } else {
      setInvitations(prev => prev.filter(i => i.id !== invId));
    }
    setCanceling(null);
  }

  const pending  = invitations.filter(i => i.status === 'PENDING');
  const others   = invitations.filter(i => i.status !== 'PENDING');

  return (
    <div className="invitations-tab">
      <div className="tab-header">
        <span className="inv-count">
          <Mail size={15} strokeWidth={2} aria-hidden="true" />
          {invitations.length} invitación{invitations.length !== 1 ? 'es' : ''}
        </span>
        <button className="new-inv-btn" onClick={onInviteNew}>
          <UserPlus size={15} strokeWidth={2} aria-hidden="true" /> Invitar jugador
        </button>
      </div>

      {loading && (
        <div className="loading-state">
          <Loader2 size={24} strokeWidth={2} aria-hidden="true" className="spin" />
          <span>Cargando invitaciones...</span>
        </div>
      )}

      {fetchError && <div className="error-msg" role="alert">{fetchError}</div>}

      {!loading && !fetchError && invitations.length === 0 && (
        <div className="empty-state">
          <Mail size={36} strokeWidth={1.5} aria-hidden="true" className="empty-icon" />
          <p>No hay invitaciones enviadas aún.</p>
          <button className="empty-invite-btn" onClick={onInviteNew}>
            <UserPlus size={15} strokeWidth={2} aria-hidden="true" /> Invitar el primer jugador
          </button>
        </div>
      )}

      {!loading && pending.length > 0 && (
        <div className="inv-section">
          <h3 className="section-title">Pendientes ({pending.length})</h3>
          <div className="inv-list">
            {pending.map(inv => (
              <div key={inv.id} className="inv-row">
                <div className="inv-avatar">
                  {inv.invitedPlayer.avatarUrl
                    ? <img src={inv.invitedPlayer.avatarUrl} alt={inv.invitedPlayer.displayName} />
                    : <span className="avatar-initial">{inv.invitedPlayer.displayName[0]}</span>
                  }
                </div>
                <div className="inv-info">
                  <span className="inv-name">{inv.invitedPlayer.displayName}</span>
                  <span className="inv-meta">
                    <Clock size={12} strokeWidth={2} aria-hidden="true" />
                    Expira {formatDate(inv.expiresAt)}
                  </span>
                  {inv.message && <span className="inv-msg">"{inv.message}"</span>}
                </div>
                <span className={`inv-status ${STATUS_CONFIG['PENDING'].className}`}>
                  {STATUS_CONFIG['PENDING'].label}
                </span>
                <button
                  className="cancel-inv-btn"
                  onClick={() => handleCancel(inv.id, inv.invitedPlayer.displayName)}
                  disabled={canceling === inv.id}
                  aria-label="Cancelar invitación"
                >
                  {canceling === inv.id
                    ? <Loader2 size={14} strokeWidth={2} aria-hidden="true" className="spin" />
                    : <X size={14} strokeWidth={2} aria-hidden="true" />
                  }
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && others.length > 0 && (
        <div className="inv-section">
          <h3 className="section-title">Historial</h3>
          <div className="inv-list">
            {others.map(inv => {
              const cfg = STATUS_CONFIG[inv.status] ?? STATUS_CONFIG['EXPIRED'];
              return (
                <div key={inv.id} className="inv-row inv-row--history">
                  <div className="inv-avatar inv-avatar--dim">
                    {inv.invitedPlayer.avatarUrl
                      ? <img src={inv.invitedPlayer.avatarUrl} alt={inv.invitedPlayer.displayName} />
                      : <span className="avatar-initial">{inv.invitedPlayer.displayName[0]}</span>
                    }
                  </div>
                  <div className="inv-info">
                    <span className="inv-name inv-name--dim">{inv.invitedPlayer.displayName}</span>
                    {inv.respondedAt && (
                      <span className="inv-meta">{formatDate(inv.respondedAt)}</span>
                    )}
                  </div>
                  <span className={`inv-status ${cfg.className}`}>{cfg.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <style>{`
        .invitations-tab { display: flex; flex-direction: column; gap: 1.25rem; }
        .tab-header { display: flex; align-items: center; justify-content: space-between; }
        .inv-count { display: flex; align-items: center; gap: 0.4rem; font-size: 0.875rem; color: var(--color-muted-foreground); }
        .new-inv-btn {
          display: flex; align-items: center; gap: 0.4rem; padding: 0.45rem 0.9rem;
          background: var(--color-primary); color: hsl(0 0% 5%);
          border: none; border-radius: 8px; font-size: 0.8rem; font-weight: 600; cursor: pointer;
        }
        .loading-state { display: flex; align-items: center; gap: 0.75rem; color: var(--color-muted-foreground); padding: 2rem 0; }
        .error-msg { background: hsl(0 60% 15%); border: 1px solid hsl(0 72% 40%); color: hsl(0 80% 70%); padding: 0.6rem 0.8rem; border-radius: 8px; font-size: 0.85rem; }
        .empty-state { display: flex; flex-direction: column; align-items: center; gap: 0.75rem; padding: 3rem 1rem; color: var(--color-muted-foreground); }
        .empty-icon { opacity: 0.3; }
        .empty-state p { margin: 0; font-size: 0.9rem; }
        .empty-invite-btn {
          display: flex; align-items: center; gap: 0.4rem; padding: 0.5rem 1rem;
          background: var(--color-primary); color: hsl(0 0% 5%);
          border: none; border-radius: 8px; font-size: 0.85rem; font-weight: 600; cursor: pointer;
        }
        .inv-section { display: flex; flex-direction: column; gap: 0.5rem; }
        .section-title { font-size: 0.8rem; font-weight: 600; color: var(--color-muted-foreground); margin: 0; text-transform: uppercase; letter-spacing: 0.05em; }
        .inv-list { display: flex; flex-direction: column; gap: 0.4rem; }
        .inv-row {
          display: flex; align-items: center; gap: 0.75rem;
          background: var(--color-card); border: 1px solid var(--color-border);
          border-radius: 8px; padding: 0.65rem 0.9rem;
        }
        .inv-row--history { opacity: 0.75; }
        .inv-avatar {
          width: 34px; height: 34px; border-radius: 50%; overflow: hidden; flex-shrink: 0;
          background: var(--color-muted); display: flex; align-items: center; justify-content: center;
        }
        .inv-avatar--dim { opacity: 0.6; }
        .inv-avatar img { width: 100%; height: 100%; object-fit: cover; }
        .avatar-initial { font-size: 0.8rem; font-weight: 700; color: var(--color-muted-foreground); }
        .inv-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.15rem; }
        .inv-name { font-size: 0.875rem; font-weight: 500; }
        .inv-name--dim { color: var(--color-muted-foreground); }
        .inv-meta { display: flex; align-items: center; gap: 0.25rem; font-size: 0.72rem; color: var(--color-muted-foreground); }
        .inv-msg { font-size: 0.75rem; color: var(--color-muted-foreground); font-style: italic; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .inv-status { font-size: 0.7rem; font-weight: 600; padding: 0.15rem 0.5rem; border-radius: 999px; flex-shrink: 0; }
        .status-pending  { background: hsl(35 80% 18%); color: hsl(35 100% 60%); }
        .status-accepted { background: hsl(140 60% 12%); color: hsl(140 70% 50%); }
        .status-rejected { background: hsl(0 60% 15%); color: hsl(0 70% 55%); }
        .status-expired  { background: hsl(220 30% 15%); color: hsl(220 20% 50%); }
        .cancel-inv-btn {
          width: 28px; height: 28px; border-radius: 6px; border: none; flex-shrink: 0;
          background: hsl(0 50% 18%); color: hsl(0 70% 55%); cursor: pointer;
          display: flex; align-items: center; justify-content: center;
        }
        .cancel-inv-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
