/**
 * DynamicNavActions — acciones dinámicas del navbar que requieren auth cliente.
 *
 * Decision Context:
 * - Consolida en un único fetch las acciones que dependen del estado del usuario:
 *   capitanía (para mostrar "Crear torneo" y CaptainBadge) e invitaciones pendientes
 *   (para el NotificationBell). Evita múltiples islas React haciendo llamadas paralelas.
 * - "Crear torneo" solo aparece si el usuario es capitán de al menos un equipo (F9).
 * - NotificationBell muestra el badge con count de invitaciones pendientes y un dropdown
 *   para aceptar/rechazar directamente desde el navbar.
 * - Previously fixed bugs: none relevant.
 */

import { useState, useEffect, useRef } from 'react';
import { Bell, Shield, X, Check, Loader2, Users } from 'lucide-react';
import { MY_TEAMS, MY_PENDING_INVITATIONS, RESPOND_INVITATION } from '../../graphql/operations/teams';
import type { TeamData, TeamInvitation } from '../../graphql/operations/teams';

interface Props {
  userId: string;
}

const FORMAT_LABEL: Record<string, string> = {
  FIVE_VS_FIVE: '5v5', SEVEN_VS_SEVEN: '7v7', TEN_VS_TEN: '10v10', ELEVEN_VS_ELEVEN: '11v11',
};

async function gqlPost<T>(query: string): Promise<T | null> {
  try {
    const res = await fetch('/api/graphql-auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    const json = await res.json() as { data?: T; errors?: { message: string }[] };
    if (json.errors?.length) return null;
    return json.data ?? null;
  } catch {
    return null;
  }
}

export function DynamicNavActions({ userId }: Props) {
  const [captainTeams, setCaptainTeams] = useState<TeamData[]>([]);
  const [invitations, setInvitations] = useState<TeamInvitation[]>([]);
  const [bellOpen, setBellOpen] = useState(false);
  const [responding, setResponding] = useState<string | null>(null);
  const bellRef = useRef<HTMLDivElement>(null);

  async function loadData() {
    const [teamsData, invData] = await Promise.all([
      gqlPost<{ myTeams: TeamData[] }>(MY_TEAMS),
      gqlPost<{ myPendingInvitations: TeamInvitation[] }>(MY_PENDING_INVITATIONS),
    ]);
    const allTeams = teamsData?.myTeams ?? [];
    setCaptainTeams(allTeams.filter(t => t.captainId === userId));
    setInvitations(invData?.myPendingInvitations ?? []);
  }

  useEffect(() => {
    loadData();
    // Refresca invitaciones cuando el usuario vuelve al tab.
    // Soluciona el caso donde una invitación fue enviada mientras el tab estaba inactivo.
    const onVisible = () => { if (document.visibilityState === 'visible') loadData(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [userId]);

  // Cerrar dropdown al clickear fuera
  useEffect(() => {
    if (!bellOpen) return;
    const handler = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setBellOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [bellOpen]);

  async function handleRespond(invId: string, accept: boolean) {
    setResponding(invId);
    try {
      const res = await fetch('/api/graphql-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: RESPOND_INVITATION, variables: { input: { invitationId: invId, accept } } }),
      });
      const json = await res.json() as { data?: { respondInvitation: { success: boolean } } };
      if (json.data?.respondInvitation.success) {
        if (accept) window.location.href = '/equipos';
        else setInvitations(prev => prev.filter(i => i.id !== invId));
      }
    } catch { /* silently ignore */ }
    setResponding(null);
  }

  const isCaptain = captainTeams.length > 0;
  const pendingCount = invitations.length;

  return (
    <div className="dynamic-actions">
      {/* Crear torneo — solo si es capitán */}
      {isCaptain && (
        <a href="/torneos/crear" className="btn-create-torneo">
          Crear torneo
        </a>
      )}

      {/* Captain badge */}
      {isCaptain && (
        <a href="/equipos" className="captain-badge-nav" title={`Capitán de ${captainTeams[0].name}`}>
          <Shield size={12} strokeWidth={2.5} aria-hidden="true" />
          <span className="captain-name">{captainTeams[0].name}</span>
        </a>
      )}

      {/* Notification Bell */}
      <div className="bell-wrap" ref={bellRef}>
        <button
          className="bell-btn"
          onClick={() => setBellOpen(v => !v)}
          aria-label={`${pendingCount} invitaciones pendientes`}
          aria-expanded={bellOpen}
        >
          <Bell size={17} strokeWidth={2} aria-hidden="true" />
          {pendingCount > 0 && (
            <span className="bell-badge">{pendingCount > 9 ? '9+' : pendingCount}</span>
          )}
        </button>

        {bellOpen && (
          <div className="bell-dropdown" role="dialog" aria-label="Invitaciones de equipo">
            <div className="bell-header">
              <span>Invitaciones de equipo</span>
              <button className="bell-close" onClick={() => setBellOpen(false)} aria-label="Cerrar">
                <X size={14} strokeWidth={2} aria-hidden="true" />
              </button>
            </div>

            {invitations.length === 0 ? (
              <div className="bell-empty">
                <Users size={28} strokeWidth={1.5} aria-hidden="true" />
                <p>Sin invitaciones pendientes</p>
              </div>
            ) : (
              <ul className="bell-list">
                {invitations.map(inv => (
                  <li key={inv.id} className="bell-item">
                    <div className="bell-item-info">
                      <span className="bell-team-name">{inv.team.name}</span>
                      <span className="bell-item-meta">
                        {FORMAT_LABEL[inv.team.format] ?? inv.team.format}
                        &nbsp;· Invitado por&nbsp;<strong>{inv.invitedBy.displayName}</strong>
                      </span>
                      {inv.message && <span className="bell-message">"{inv.message}"</span>}
                    </div>
                    <div className="bell-item-actions">
                      <button
                        className="bell-reject"
                        onClick={() => handleRespond(inv.id, false)}
                        disabled={responding === inv.id}
                        aria-label="Rechazar"
                      >
                        {responding === inv.id
                          ? <Loader2 size={13} strokeWidth={2} className="spin" aria-hidden="true" />
                          : <X size={13} strokeWidth={2} aria-hidden="true" />
                        }
                      </button>
                      <button
                        className="bell-accept"
                        onClick={() => handleRespond(inv.id, true)}
                        disabled={responding === inv.id}
                        aria-label="Aceptar"
                      >
                        {responding === inv.id
                          ? <Loader2 size={13} strokeWidth={2} className="spin" aria-hidden="true" />
                          : <Check size={13} strokeWidth={2} aria-hidden="true" />
                        }
                        Unirme
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <style>{`
        .dynamic-actions { display: flex; align-items: center; gap: 0.5rem; }

        .btn-create-torneo {
          padding: 0.35rem 0.75rem; border-radius: 7px;
          background: var(--color-primary, hsl(35 100% 48%));
          color: #fff; text-decoration: none; font-size: 0.78rem; font-weight: 600;
          white-space: nowrap; transition: opacity 0.15s;
        }
        .btn-create-torneo:hover { opacity: 0.88; }

        .captain-badge-nav {
          display: inline-flex; align-items: center; gap: 0.3rem;
          background: hsl(35 100% 20%); color: hsl(35 100% 65%);
          border: 1px solid hsl(35 100% 35%); border-radius: 999px;
          padding: 0.2rem 0.65rem; font-size: 0.72rem; font-weight: 700;
          text-decoration: none; white-space: nowrap; transition: background 0.15s;
        }
        .captain-badge-nav:hover { background: hsl(35 100% 28%); }
        .captain-name { max-width: 90px; overflow: hidden; text-overflow: ellipsis; }
        @media (max-width: 900px) { .captain-name { display: none; } }

        /* Bell */
        .bell-wrap { position: relative; }
        .bell-btn {
          width: 32px; height: 32px; border-radius: 8px; border: none;
          background: rgba(255,255,255,0.08); color: hsl(215 20% 65%);
          cursor: pointer; display: flex; align-items: center; justify-content: center;
          position: relative; transition: background 0.15s, color 0.15s;
        }
        .bell-btn:hover { background: rgba(255,255,255,0.15); color: hsl(215 20% 85%); }
        .bell-badge {
          position: absolute; top: 2px; right: 2px; width: 16px; height: 16px;
          background: hsl(0 80% 55%); color: #fff; border-radius: 50%;
          font-size: 0.6rem; font-weight: 700; display: flex; align-items: center; justify-content: center;
          border: 2px solid var(--color-background, hsl(220 72% 7%));
        }
        .bell-dropdown {
          position: absolute; top: calc(100% + 8px); right: 0;
          width: 320px; max-width: 90vw;
          background: var(--color-card, hsl(220 55% 11%));
          border: 1px solid var(--color-border, hsl(220 30% 20%));
          border-radius: 12px; overflow: hidden;
          box-shadow: 0 16px 48px rgba(0,0,0,0.4);
          z-index: 200;
        }
        .bell-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 0.75rem 1rem; border-bottom: 1px solid var(--color-border, hsl(220 30% 20%));
          font-size: 0.85rem; font-weight: 600; color: var(--color-foreground, hsl(210 20% 94%));
        }
        .bell-close {
          width: 24px; height: 24px; border-radius: 6px; border: none;
          background: var(--color-muted, hsl(220 40% 16%)); color: var(--color-muted-foreground);
          cursor: pointer; display: flex; align-items: center; justify-content: center;
        }
        .bell-empty {
          display: flex; flex-direction: column; align-items: center; gap: 0.5rem;
          padding: 2rem 1rem; color: var(--color-muted-foreground);
          font-size: 0.85rem;
        }
        .bell-list { list-style: none; margin: 0; padding: 0; }
        .bell-item {
          display: flex; align-items: center; gap: 0.75rem;
          padding: 0.75rem 1rem; border-bottom: 1px solid var(--color-border);
        }
        .bell-item:last-child { border-bottom: none; }
        .bell-item-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.15rem; }
        .bell-team-name { font-size: 0.875rem; font-weight: 600; color: var(--color-foreground); }
        .bell-item-meta { font-size: 0.75rem; color: var(--color-muted-foreground); }
        .bell-message { font-size: 0.75rem; color: var(--color-muted-foreground); font-style: italic; }
        .bell-item-actions { display: flex; gap: 0.4rem; flex-shrink: 0; }
        .bell-reject {
          width: 28px; height: 28px; border-radius: 6px; border: 1px solid hsl(0 50% 30%);
          background: hsl(0 50% 15%); color: hsl(0 70% 60%);
          cursor: pointer; display: flex; align-items: center; justify-content: center;
        }
        .bell-reject:disabled { opacity: 0.5; }
        .bell-accept {
          display: flex; align-items: center; gap: 0.25rem; padding: 0 0.6rem;
          height: 28px; border-radius: 6px; border: none;
          background: var(--color-primary); color: #fff;
          font-size: 0.75rem; font-weight: 600; cursor: pointer;
        }
        .bell-accept:disabled { opacity: 0.5; }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* Light mode overrides */
        :global(html.light) .bell-btn {
          background: rgba(0,0,0,0.06);
          color: hsl(220 20% 45%);
        }
        :global(html.light) .bell-btn:hover {
          background: rgba(0,0,0,0.1);
          color: hsl(220 20% 20%);
        }
        :global(html.light) .bell-badge {
          border-color: hsl(210 20% 97%);
        }
        :global(html.light) .captain-badge-nav {
          background: hsl(35 80% 88%); color: hsl(35 100% 30%);
          border-color: hsl(35 80% 70%);
        }
        :global(html.light) .btn-create-torneo {
          color: #fff;
        }
      `}</style>
    </div>
  );
}
