/**
 * DynamicNavActions — acciones dinámicas del navbar que requieren auth cliente.
 *
 * Decision Context:
 * - Consolida en un único fetch las acciones que dependen del estado del usuario:
 *   capitanía (para mostrar "Crear torneo" y CaptainBadge), invitaciones pendientes y
 *   notificaciones del sistema (campana). Evita múltiples islas React con llamadas paralelas.
 * - El NotificationBell ahora muestra DOS cosas: las notificaciones del sistema (tabla
 *   `notifications`, generadas por eventos reales como "se sumó un jugador a tu partido",
 *   "se canceló un partido", etc.) y las invitaciones de equipo pendientes (que se aceptan
 *   o rechazan inline). Antes solo mostraba invitaciones; las notificaciones existían en la
 *   base pero no eran visibles en ninguna UI.
 * - El badge suma no-leídas (unreadCount) + invitaciones pendientes para reflejar todo lo
 *   que requiere atención del usuario en un solo número.
 * - Las notificaciones de tipo match_* con referenceId enlazan a /partidos/<id>. Al clickear
 *   una notificación no leída se marca como leída; la X la elimina.
 * - Re-fetch al volver al tab (visibilitychange) para no perder eventos ocurridos en segundo plano.
 * - Previously fixed bugs: none relevant.
 */

import { useState, useEffect, useRef } from 'react';
import {
  Bell, Shield, X, Check, Loader2, Users, UserPlus, CalendarX, Trophy, CheckCheck,
} from 'lucide-react';
import { MY_TEAMS, MY_PENDING_INVITATIONS, RESPOND_INVITATION } from '../../graphql/operations/teams';
import type { TeamData, TeamInvitation } from '../../graphql/operations/teams';
import {
  GET_MY_NOTIFICATIONS,
  MARK_NOTIFICATION_READ,
  MARK_ALL_NOTIFICATIONS_READ,
  DELETE_NOTIFICATION,
} from '../../graphql/operations/notifications';
import type { AppNotification, NotificationConnection } from '../../graphql/operations/notifications';

interface Props {
  userId: string;
}

const FORMAT_LABEL: Record<string, string> = {
  FIVE_VS_FIVE: '5v5', SEVEN_VS_SEVEN: '7v7', TEN_VS_TEN: '10v10', ELEVEN_VS_ELEVEN: '11v11',
};

// Mapea el `type` de la notificación a un icono lucide (sin emojis — regla del design system).
function notifIcon(type: string) {
  if (type === 'match_player_joined') return UserPlus;
  if (type === 'match_needs_players') return Users;
  if (type === 'match_cancelled' || type === 'match_auto_cancelled') return CalendarX;
  if (type === 'match_result_confirmed') return Trophy;
  return Bell;
}

// "hace 5 min" / "hace 2 h" / "hace 3 d" — formato relativo compacto en español.
function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffSec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (diffSec < 60) return 'recién';
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `hace ${min} min`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `hace ${days} d`;
}

async function gqlPost<T>(query: string, variables?: Record<string, unknown>): Promise<T | null> {
  try {
    const res = await fetch('/api/graphql-auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
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
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [bellOpen, setBellOpen] = useState(false);
  const [responding, setResponding] = useState<string | null>(null);
  const bellRef = useRef<HTMLDivElement>(null);

  async function loadData() {
    const [teamsData, invData, notifData] = await Promise.all([
      gqlPost<{ myTeams: TeamData[] }>(MY_TEAMS),
      gqlPost<{ myPendingInvitations: TeamInvitation[] }>(MY_PENDING_INVITATIONS),
      gqlPost<{ myNotifications: NotificationConnection }>(GET_MY_NOTIFICATIONS, { limit: 20 }),
    ]);
    const allTeams = teamsData?.myTeams ?? [];
    setCaptainTeams(allTeams.filter(t => t.captainId === userId));
    setInvitations(invData?.myPendingInvitations ?? []);
    setNotifications(notifData?.myNotifications.items ?? []);
    setUnreadCount(notifData?.myNotifications.unreadCount ?? 0);
  }

  useEffect(() => {
    loadData();
    // Refresca cuando el usuario vuelve al tab. Soluciona el caso donde una invitación o
    // notificación se generó mientras el tab estaba inactivo.
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

  async function handleMarkRead(id: string) {
    setNotifications(prev => prev.map(n => (n.id === id ? { ...n, isRead: true } : n)));
    setUnreadCount(prev => Math.max(0, prev - 1));
    await gqlPost(MARK_NOTIFICATION_READ, { id });
  }

  async function handleMarkAll() {
    if (unreadCount === 0) return;
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    setUnreadCount(0);
    await gqlPost(MARK_ALL_NOTIFICATIONS_READ);
  }

  async function handleDelete(id: string) {
    const removed = notifications.find(n => n.id === id);
    setNotifications(prev => prev.filter(n => n.id !== id));
    if (removed && !removed.isRead) setUnreadCount(prev => Math.max(0, prev - 1));
    await gqlPost(DELETE_NOTIFICATION, { id });
  }

  function handleNotifClick(n: AppNotification) {
    if (!n.isRead) handleMarkRead(n.id);
    if (n.referenceId && n.type.startsWith('match_')) {
      window.location.href = `/partidos/${n.referenceId}`;
    }
  }

  const isCaptain = captainTeams.length > 0;
  const pendingCount = invitations.length;
  const badgeCount = pendingCount + unreadCount;

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
          aria-label={`${badgeCount} notificaciones sin leer`}
          aria-expanded={bellOpen}
        >
          <Bell size={17} strokeWidth={2} aria-hidden="true" />
          {badgeCount > 0 && (
            <span className="bell-badge">{badgeCount > 9 ? '9+' : badgeCount}</span>
          )}
        </button>

        {bellOpen && (
          <div className="bell-dropdown" role="dialog" aria-label="Notificaciones">
            <div className="bell-header">
              <span>Notificaciones</span>
              <div className="bell-header-actions">
                {unreadCount > 0 && (
                  <button className="bell-markall" onClick={handleMarkAll}>
                    <CheckCheck size={13} strokeWidth={2} aria-hidden="true" />
                    Marcar todas
                  </button>
                )}
                <button className="bell-close" onClick={() => setBellOpen(false)} aria-label="Cerrar">
                  <X size={14} strokeWidth={2} aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className="bell-scroll">
              {/* System notifications */}
              {notifications.length > 0 && (
                <ul className="bell-list">
                  {notifications.map(n => {
                    const Icon = notifIcon(n.type);
                    const clickable = Boolean(n.referenceId && n.type.startsWith('match_'));
                    return (
                      <li
                        key={n.id}
                        className={`notif-item ${n.isRead ? '' : 'notif-item--unread'} ${clickable ? 'notif-item--clickable' : ''}`}
                      >
                        <button className="notif-main" onClick={() => handleNotifClick(n)}>
                          <span className="notif-icon" aria-hidden="true">
                            <Icon size={16} strokeWidth={2} />
                          </span>
                          <span className="notif-text">
                            <span className="notif-title">{n.title}</span>
                            {n.body && <span className="notif-body">{n.body}</span>}
                            <span className="notif-time">{timeAgo(n.createdAt)}</span>
                          </span>
                          {!n.isRead && <span className="notif-dot" aria-hidden="true" />}
                        </button>
                        <button
                          className="notif-delete"
                          onClick={() => handleDelete(n.id)}
                          aria-label="Eliminar notificación"
                        >
                          <X size={13} strokeWidth={2} aria-hidden="true" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              {/* Team invitations */}
              {invitations.length > 0 && (
                <>
                  <div className="bell-subheader">Invitaciones de equipo</div>
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
                </>
              )}

              {/* Empty state */}
              {notifications.length === 0 && invitations.length === 0 && (
                <div className="bell-empty">
                  <Bell size={28} strokeWidth={1.5} aria-hidden="true" />
                  <p>No tenés notificaciones</p>
                </div>
              )}
            </div>
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
          width: 340px; max-width: 90vw;
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
        .bell-header-actions { display: flex; align-items: center; gap: 0.5rem; }
        .bell-markall {
          display: inline-flex; align-items: center; gap: 0.25rem;
          background: transparent; border: none; cursor: pointer;
          color: hsl(216 85% 65%); font-size: 0.72rem; font-weight: 600; padding: 0.15rem 0.3rem;
          border-radius: 5px;
        }
        .bell-markall:hover { background: rgba(99,155,255,0.1); }
        .bell-close {
          width: 24px; height: 24px; border-radius: 6px; border: none;
          background: var(--color-muted, hsl(220 40% 16%)); color: var(--color-muted-foreground);
          cursor: pointer; display: flex; align-items: center; justify-content: center;
        }
        .bell-scroll { max-height: 420px; overflow-y: auto; }
        .bell-subheader {
          padding: 0.6rem 1rem 0.4rem; font-family: 'Barlow Condensed', sans-serif;
          font-size: 0.7rem; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase;
          color: var(--color-muted-foreground); border-top: 1px solid var(--color-border);
        }
        .bell-empty {
          display: flex; flex-direction: column; align-items: center; gap: 0.5rem;
          padding: 2rem 1rem; color: var(--color-muted-foreground);
          font-size: 0.85rem;
        }
        .bell-list { list-style: none; margin: 0; padding: 0; }

        /* System notification item */
        .notif-item {
          display: flex; align-items: stretch;
          border-bottom: 1px solid var(--color-border);
          transition: background 0.12s;
        }
        .notif-item:last-child { border-bottom: none; }
        .notif-item--unread { background: rgba(99,155,255,0.06); }
        .notif-item:hover { background: rgba(255,255,255,0.04); }
        .notif-main {
          flex: 1; min-width: 0; display: flex; align-items: flex-start; gap: 0.65rem;
          padding: 0.7rem 0.5rem 0.7rem 1rem; background: transparent; border: none;
          text-align: left; cursor: default; color: inherit;
        }
        .notif-item--clickable .notif-main { cursor: pointer; }
        .notif-icon {
          flex-shrink: 0; width: 30px; height: 30px; border-radius: 8px;
          display: flex; align-items: center; justify-content: center;
          background: rgba(246,164,0,0.12); color: hsl(35 100% 60%);
        }
        .notif-text { display: flex; flex-direction: column; gap: 0.1rem; min-width: 0; flex: 1; }
        .notif-title {
          font-size: 0.83rem; font-weight: 600; color: var(--color-foreground, hsl(210 20% 92%));
          line-height: 1.25;
        }
        .notif-body {
          font-size: 0.76rem; color: var(--color-muted-foreground, hsl(215 20% 55%)); line-height: 1.3;
        }
        .notif-time { font-size: 0.68rem; color: hsl(215 20% 45%); margin-top: 0.1rem; }
        .notif-dot {
          flex-shrink: 0; width: 8px; height: 8px; border-radius: 50%;
          background: hsl(216 85% 60%); margin-top: 0.35rem;
        }
        .notif-delete {
          flex-shrink: 0; width: 28px; border: none; background: transparent;
          color: hsl(215 20% 45%); cursor: pointer; display: flex; align-items: center; justify-content: center;
        }
        .notif-delete:hover { color: hsl(0 70% 60%); }

        /* Invitation item (unchanged) */
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
        :global(html.light) .bell-btn { background: rgba(0,0,0,0.06); color: hsl(220 20% 45%); }
        :global(html.light) .bell-btn:hover { background: rgba(0,0,0,0.1); color: hsl(220 20% 20%); }
        :global(html.light) .bell-badge { border-color: hsl(210 20% 97%); }
        :global(html.light) .notif-item--unread { background: rgba(99,155,255,0.1); }
        :global(html.light) .captain-badge-nav {
          background: hsl(35 80% 88%); color: hsl(35 100% 30%); border-color: hsl(35 80% 70%);
        }
        :global(html.light) .btn-create-torneo { color: #fff; }
      `}</style>
    </div>
  );
}
