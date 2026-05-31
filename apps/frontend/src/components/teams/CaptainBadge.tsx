/**
 * CaptainBadge — indicador en navbar de que el usuario es capitán de un equipo.
 *
 * Decision Context:
 * - F5 (issue #137): el badge se monta como isla React (client:load) en el topbar
 *   de las páginas principales. Fetcha myTeams async para no bloquear el SSR.
 * - Solo se muestra si el usuario es capitán de al menos un equipo activo.
 * - Muestra el nombre del primer equipo con capitanía. Si tiene varios, el tooltip
 *   lista todos.
 * - Se usa Shield de lucide-react como ícono de capitanía (consistente con el resto del UI).
 * - Previously fixed bugs: none relevant.
 */

import { useState, useEffect } from 'react';
import { Shield } from 'lucide-react';
import { MY_TEAMS } from '../../graphql/operations/teams';
import type { TeamData } from '../../graphql/operations/teams';

interface Props {
  userId: string;
}

export function CaptainBadge({ userId }: Props) {
  const [captainTeams, setCaptainTeams] = useState<TeamData[]>([]);

  useEffect(() => {
    fetch('/api/graphql-auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: MY_TEAMS }),
    })
      .then(r => r.json())
      .then((json: { data?: { myTeams: TeamData[] } }) => {
        const all = json.data?.myTeams ?? [];
        setCaptainTeams(all.filter(t => t.captainId === userId));
      })
      .catch(() => { /* silently ignore — badge is non-critical */ });
  }, [userId]);

  if (captainTeams.length === 0) return null;

  const firstName = captainTeams[0].name;
  const tooltipText = captainTeams.length === 1
    ? `Capitán de ${firstName}`
    : `Capitán de ${captainTeams.length} equipos: ${captainTeams.map(t => t.name).join(', ')}`;

  return (
    <a
      href="/equipos"
      className="captain-badge"
      title={tooltipText}
      aria-label={tooltipText}
    >
      <Shield size={13} strokeWidth={2.5} aria-hidden="true" />
      <span className="captain-badge-text">{firstName}</span>

      <style>{`
        .captain-badge {
          display: inline-flex; align-items: center; gap: 0.3rem;
          background: hsl(35 100% 20%); color: hsl(35 100% 65%);
          border: 1px solid hsl(35 100% 35%); border-radius: 999px;
          padding: 0.2rem 0.65rem; font-size: 0.72rem; font-weight: 700;
          text-decoration: none; white-space: nowrap;
          transition: background 0.15s, color 0.15s;
        }
        .captain-badge:hover {
          background: hsl(35 100% 28%); color: hsl(35 100% 75%);
        }
        .captain-badge-text {
          max-width: 100px; overflow: hidden; text-overflow: ellipsis;
        }
        @media (max-width: 640px) { .captain-badge-text { display: none; } }
      `}</style>
    </a>
  );
}
