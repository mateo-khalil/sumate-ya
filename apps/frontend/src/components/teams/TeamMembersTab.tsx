/**
 * TeamMembersTab — lista de miembros del equipo con acciones del capitán.
 *
 * Decision Context:
 * - Solo el capitán ve el botón "Remover" en cada miembro no-capitán.
 * - removeMember usa POST /api/graphql-auth y refresca el equipo local via onTeamUpdated.
 * - El capitán no puede removerse a sí mismo desde aquí (se hace con "Abandonar equipo").
 * - Previously fixed bugs: none relevant.
 */

import { useState } from 'react';
import { UserRound, Shield, Trash2, Loader2, UserPlus } from 'lucide-react';
import type { TeamData, TeamRosterEntry } from '../../graphql/operations/teams';
import { REMOVE_MEMBER, GET_TEAM } from '../../graphql/operations/teams';

interface Props {
  team: TeamData;
  userId: string | null;
  isCaptain: boolean;
  onTeamUpdated: (team: TeamData) => void;
  onInviteClick?: () => void;
}

const POSITION_LABEL: Record<string, string> = {
  GOALKEEPER: 'Portero', DEFENDER: 'Defensor',
  MIDFIELDER: 'Mediocampista', FORWARD: 'Delantero',
};

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

export function TeamMembersTab({ team, userId, isCaptain, onTeamUpdated, onInviteClick }: Props) {
  const [removing, setRemoving] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  async function handleRemove(entry: TeamRosterEntry) {
    if (!confirm(`¿Remover a ${entry.player.displayName} del equipo?`)) return;
    setRemoving(entry.player.id);
    setRemoveError(null);

    const { data, error } = await gqlAuthPost<{ removeMember: { success: boolean; message: string } }>(
      REMOVE_MEMBER,
      { teamId: team.id, playerId: entry.player.id },
    );

    if (error || !data?.removeMember.success) {
      setRemoveError(error ?? data?.removeMember.message ?? 'Error al remover');
      setRemoving(null);
      return;
    }

    // Refrescar datos del equipo
    const { data: teamData } = await gqlAuthPost<{ team: TeamData }>(GET_TEAM, { id: team.id });
    if (teamData?.team) onTeamUpdated(teamData.team);
    setRemoving(null);
  }

  return (
    <div className="members-tab">
      {/* Header con acción invitar */}
      <div className="members-header">
        <span className="members-count">
          {team.members.length} {team.members.length === 1 ? 'jugador' : 'jugadores'}
        </span>
        {isCaptain && (
          <button className="invite-btn" onClick={onInviteClick}>
            <UserPlus size={15} strokeWidth={2} aria-hidden="true" />
            Invitar jugador
          </button>
        )}
      </div>

      {removeError && (
        <div className="error-msg" role="alert">{removeError}</div>
      )}

      <div className="member-list">
        {team.members.map(entry => {
          const isMe = entry.player.id === userId;
          const isMemberCaptain = entry.role === 'CAPTAIN';
          const canRemove = isCaptain && !isMe && !isMemberCaptain;

          return (
            <div key={entry.id} className="member-row">
              {/* Avatar */}
              <div className="avatar">
                {entry.player.avatarUrl
                  ? <img src={entry.player.avatarUrl} alt={entry.player.displayName} />
                  : <UserRound size={20} strokeWidth={1.5} aria-hidden="true" />
                }
              </div>

              {/* Info */}
              <div className="member-info">
                <span className="member-name">
                  {entry.player.displayName}
                  {isMe && <span className="me-tag">Vos</span>}
                </span>
                {entry.player.preferredPosition && (
                  <span className="member-pos">
                    {POSITION_LABEL[entry.player.preferredPosition] ?? entry.player.preferredPosition}
                  </span>
                )}
              </div>

              {/* Role badge */}
              {isMemberCaptain && (
                <span className="role-captain">
                  <Shield size={12} strokeWidth={2} aria-hidden="true" /> Capitán
                </span>
              )}

              {/* Remove btn (captain only, no self, no captain) */}
              {canRemove && (
                <button
                  className="remove-btn"
                  onClick={() => handleRemove(entry)}
                  disabled={removing === entry.player.id}
                  aria-label={`Remover a ${entry.player.displayName}`}
                >
                  {removing === entry.player.id
                    ? <Loader2 size={15} strokeWidth={2} aria-hidden="true" className="spin" />
                    : <Trash2 size={15} strokeWidth={2} aria-hidden="true" />
                  }
                </button>
              )}
            </div>
          );
        })}

        {team.members.length === 0 && (
          <p className="empty-msg">El equipo aún no tiene miembros.</p>
        )}
      </div>

      <style>{`
        .members-tab { }
        .members-header {
          display: flex; align-items: center; justify-content: space-between;
          margin-bottom: 1rem;
        }
        .members-count { font-size: 0.875rem; color: var(--color-muted-foreground); }
        .invite-btn {
          display: flex; align-items: center; gap: 0.4rem;
          padding: 0.45rem 0.9rem; border-radius: 8px;
          background: var(--color-primary); color: hsl(0 0% 5%);
          border: none; cursor: pointer; font-size: 0.8rem; font-weight: 600;
          transition: opacity 0.15s;
        }
        .invite-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .error-msg {
          background: hsl(0 60% 15%); border: 1px solid hsl(0 72% 40%);
          color: hsl(0 80% 70%); padding: 0.6rem 0.8rem; border-radius: 8px;
          font-size: 0.85rem; margin-bottom: 1rem;
        }
        .member-list { display: flex; flex-direction: column; gap: 0.5rem; }
        .member-row {
          display: flex; align-items: center; gap: 0.75rem;
          background: var(--color-card); border: 1px solid var(--color-border);
          border-radius: 8px; padding: 0.75rem 1rem;
        }
        .avatar {
          width: 38px; height: 38px; border-radius: 50%; overflow: hidden;
          background: var(--color-muted); display: flex; align-items: center;
          justify-content: center; color: var(--color-muted-foreground); flex-shrink: 0;
        }
        .avatar img { width: 100%; height: 100%; object-fit: cover; }
        .member-info { flex: 1; min-width: 0; display: flex; flex-direction: column; }
        .member-name {
          font-size: 0.9rem; font-weight: 500; display: flex; align-items: center; gap: 0.4rem;
        }
        .me-tag {
          font-size: 0.7rem; font-weight: 600; padding: 0.1rem 0.4rem;
          border-radius: 4px; background: var(--color-muted);
          color: var(--color-muted-foreground);
        }
        .member-pos { font-size: 0.775rem; color: var(--color-muted-foreground); }
        .role-captain {
          display: inline-flex; align-items: center; gap: 0.25rem;
          font-size: 0.7rem; font-weight: 600; padding: 0.2rem 0.5rem;
          border-radius: 999px; background: hsl(35 100% 20%); color: hsl(35 100% 65%);
          flex-shrink: 0;
        }
        .remove-btn {
          width: 32px; height: 32px; border-radius: 8px; border: none;
          background: hsl(0 60% 20%); color: hsl(0 80% 65%); cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          transition: background 0.15s; flex-shrink: 0;
        }
        .remove-btn:hover:not(:disabled) { background: hsl(0 60% 28%); }
        .remove-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .empty-msg { text-align: center; color: var(--color-muted-foreground); padding: 2rem 0; }
      `}</style>
    </div>
  );
}
