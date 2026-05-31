/**
 * MyInvitationsList — lista de invitaciones pendientes recibidas por el jugador.
 *
 * Decision Context:
 * - Isla React montada en /equipos.astro con client:load.
 * - Fetcha MY_PENDING_INVITATIONS al montar y refresca tras cada respuesta.
 * - Los botones Aceptar/Rechazar usan RESPOND_INVITATION via /api/graphql-auth.
 * - Al aceptar una invitación, recarga la lista de equipos (window.location.reload).
 * - Previously fixed bugs: none relevant.
 */

import { useState, useEffect } from 'react';
import { Mail, Check, X, Loader2, Clock, Users } from 'lucide-react';
import type { TeamInvitation } from '../../graphql/operations/teams';
import { MY_PENDING_INVITATIONS, RESPOND_INVITATION } from '../../graphql/operations/teams';

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

const FORMAT_LABEL: Record<string, string> = {
  FIVE_VS_FIVE: '5v5', SEVEN_VS_SEVEN: '7v7',
  TEN_VS_TEN: '10v10', ELEVEN_VS_ELEVEN: '11v11',
};

function daysUntil(iso: string) {
  const diff = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export function MyInvitationsList() {
  const [invitations, setInvitations] = useState<TeamInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [responding, setResponding] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function load() {
    setLoading(true);
    const { data } = await gqlAuthPost<{ myPendingInvitations: TeamInvitation[] }>(MY_PENDING_INVITATIONS);
    setInvitations(data?.myPendingInvitations ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleRespond(invId: string, accept: boolean) {
    setResponding(invId);
    setErrors(prev => ({ ...prev, [invId]: '' }));

    const { data, error } = await gqlAuthPost<{ respondInvitation: { success: boolean; message: string } }>(
      RESPOND_INVITATION, { input: { invitationId: invId, accept } }
    );

    if (error || !data?.respondInvitation.success) {
      setErrors(prev => ({ ...prev, [invId]: error ?? data?.respondInvitation.message ?? 'Error al responder' }));
      setResponding(null);
      return;
    }

    if (accept) {
      // Recargar página para actualizar la lista de equipos
      window.location.reload();
    } else {
      setInvitations(prev => prev.filter(i => i.id !== invId));
      setResponding(null);
    }
  }

  if (loading) return null;
  if (invitations.length === 0) return null;

  return (
    <div className="my-inv-section">
      <div className="section-header">
        <Mail size={18} strokeWidth={2} aria-hidden="true" />
        <h2 className="section-title">
          Invitaciones pendientes
          <span className="badge">{invitations.length}</span>
        </h2>
      </div>

      <div className="inv-list">
        {invitations.map(inv => {
          const days = daysUntil(inv.expiresAt);
          const isResponding = responding === inv.id;
          const err = errors[inv.id];

          return (
            <div key={inv.id} className="inv-card">
              <div className="inv-card-top">
                <div className="team-icon">
                  <Users size={20} strokeWidth={1.5} aria-hidden="true" />
                </div>
                <div className="inv-body">
                  <p className="inv-team-name">{inv.team.name}</p>
                  <p className="inv-meta">
                    {FORMAT_LABEL[inv.team.format] ?? inv.team.format}
                    &nbsp;&middot;&nbsp;
                    {inv.team.memberCount} {inv.team.memberCount === 1 ? 'miembro' : 'miembros'}
                    &nbsp;&middot;&nbsp;
                    Invitado por <strong>{inv.invitedBy.displayName}</strong>
                  </p>
                  {inv.message && (
                    <p className="inv-message">"{inv.message}"</p>
                  )}
                  <p className="inv-expiry">
                    <Clock size={12} strokeWidth={2} aria-hidden="true" />
                    {days > 0 ? `Expira en ${days} día${days !== 1 ? 's' : ''}` : 'Expira hoy'}
                  </p>
                </div>
              </div>

              {err && <div className="inv-error" role="alert">{err}</div>}

              <div className="inv-actions">
                <button
                  className="reject-btn"
                  onClick={() => handleRespond(inv.id, false)}
                  disabled={isResponding}
                >
                  {isResponding
                    ? <Loader2 size={14} strokeWidth={2} aria-hidden="true" className="spin" />
                    : <X size={14} strokeWidth={2} aria-hidden="true" />
                  }
                  Rechazar
                </button>
                <button
                  className="accept-btn"
                  onClick={() => handleRespond(inv.id, true)}
                  disabled={isResponding}
                >
                  {isResponding
                    ? <Loader2 size={14} strokeWidth={2} aria-hidden="true" className="spin" />
                    : <Check size={14} strokeWidth={2} aria-hidden="true" />
                  }
                  Unirme al equipo
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <style>{`
        .my-inv-section { margin-bottom: 2rem; }
        .section-header { display: flex; align-items: center; gap: 0.6rem; margin-bottom: 1rem; color: var(--color-foreground); }
        .section-title {
          font-size: 1rem; font-weight: 700; margin: 0;
          display: flex; align-items: center; gap: 0.5rem;
        }
        .badge {
          display: inline-flex; align-items: center; justify-content: center;
          width: 20px; height: 20px; border-radius: 50%;
          background: var(--color-primary); color: hsl(0 0% 5%);
          font-size: 0.7rem; font-weight: 700;
        }
        .inv-list { display: flex; flex-direction: column; gap: 0.75rem; }
        .inv-card {
          background: hsl(216 60% 10%); border: 1px solid hsl(216 60% 22%);
          border-radius: 10px; padding: 1rem; display: flex; flex-direction: column; gap: 0.75rem;
        }
        .inv-card-top { display: flex; align-items: flex-start; gap: 0.85rem; }
        .team-icon {
          width: 42px; height: 42px; border-radius: 8px; flex-shrink: 0;
          background: hsl(216 50% 18%); display: flex; align-items: center;
          justify-content: center; color: hsl(216 70% 60%);
        }
        .inv-body { flex: 1; min-width: 0; }
        .inv-team-name { font-size: 0.95rem; font-weight: 700; margin: 0 0 0.2rem; color: hsl(216 80% 75%); }
        .inv-meta { font-size: 0.78rem; color: var(--color-muted-foreground); margin: 0 0 0.2rem; }
        .inv-message { font-size: 0.8rem; color: var(--color-muted-foreground); font-style: italic; margin: 0.2rem 0; }
        .inv-expiry {
          display: flex; align-items: center; gap: 0.3rem;
          font-size: 0.75rem; color: hsl(35 100% 55%); margin: 0;
        }
        .inv-error { background: hsl(0 60% 15%); border: 1px solid hsl(0 72% 40%); color: hsl(0 80% 70%); padding: 0.5rem 0.75rem; border-radius: 6px; font-size: 0.82rem; }
        .inv-actions { display: flex; gap: 0.6rem; }
        .reject-btn {
          display: flex; align-items: center; gap: 0.35rem; padding: 0.5rem 0.9rem;
          background: hsl(0 40% 18%); color: hsl(0 70% 60%);
          border: 1px solid hsl(0 40% 28%); border-radius: 8px;
          font-size: 0.82rem; font-weight: 500; cursor: pointer;
        }
        .reject-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .accept-btn {
          display: flex; align-items: center; gap: 0.35rem; padding: 0.5rem 1rem;
          background: var(--color-primary); color: hsl(0 0% 5%);
          border: none; border-radius: 8px;
          font-size: 0.82rem; font-weight: 600; cursor: pointer;
        }
        .accept-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
