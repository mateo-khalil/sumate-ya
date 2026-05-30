/**
 * TeamDashboard — panel interactivo del capitán y miembros.
 *
 * Decision Context:
 * - Se monta como isla React (client:load) en /equipos/[id].astro.
 * - Solo el capitán ve todos los tabs (Miembros, Torneos, Disponibilidad, Configuración).
 * - Los miembros no-capitán ven solo el tab de Disponibilidad.
 * - Los datos iniciales del equipo vienen del SSR; las mutaciones refrescan el estado local.
 * - Previously fixed bugs: none relevant.
 */

import { useState } from 'react';
import { Users, Settings, Clock, Trophy, Mail } from 'lucide-react'; // Clock usado en TABS
import type { LucideIcon } from 'lucide-react';
import type { TeamData } from '../../graphql/operations/teams';
import { TeamMembersTab } from './TeamMembersTab';
import { TeamConfigTab } from './TeamConfigTab';
import { TeamInvitationsTab } from './TeamInvitationsTab';
import { InvitePlayerDialog } from './InvitePlayerDialog';
import { AvailabilityForm } from './AvailabilityForm';
import { AvailabilityHeatmap } from './AvailabilityHeatmap';
import { TeamTournamentsTab } from './TeamTournamentsTab';

interface Props {
  team: TeamData;
  userId: string | null;
  isCaptain: boolean;
}

type Tab = 'members' | 'invitations' | 'tournaments' | 'availability' | 'config';

interface TabDef {
  id: Tab;
  label: string;
  Icon: LucideIcon;
  captainOnly: boolean;
}

const TABS: TabDef[] = [
  { id: 'members',      label: 'Miembros',      Icon: Users,    captainOnly: false },
  { id: 'invitations',  label: 'Invitaciones',  Icon: Mail,     captainOnly: true  },
  { id: 'availability', label: 'Disponibilidad', Icon: Clock,    captainOnly: false },
  { id: 'tournaments',  label: 'Torneos',        Icon: Trophy,   captainOnly: true  },
  { id: 'config',       label: 'Configuración',  Icon: Settings, captainOnly: true  },
];

export function TeamDashboard({ team: initialTeam, userId, isCaptain }: Props) {
  const [team, setTeam] = useState<TeamData>(initialTeam);
  const [activeTab, setActiveTab] = useState<Tab>('members');
  const [showInviteDialog, setShowInviteDialog] = useState(false);

  const visibleTabs = TABS.filter(t => isCaptain || !t.captainOnly);

  function handleTeamUpdated(updated: TeamData) { setTeam(updated); }

  function openInviteDialog() { setShowInviteDialog(true); }

  function handleInvited() {
    // Refrescar equipo tras invitación exitosa (cambia memberCount en curso)
    setShowInviteDialog(false);
  }

  return (
    <div className="dashboard">
      {/* Tab bar */}
      <div className="tab-bar" role="tablist">
        {visibleTabs.map(tab => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`tab-btn ${activeTab === tab.id ? 'tab-btn--active' : ''}`}
          >
            <tab.Icon size={15} strokeWidth={2} aria-hidden="true" />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="tab-content">
        {activeTab === 'members' && (
          <TeamMembersTab
            team={team}
            userId={userId}
            isCaptain={isCaptain}
            onTeamUpdated={handleTeamUpdated}
            onInviteClick={isCaptain ? openInviteDialog : undefined}
          />
        )}

        {activeTab === 'invitations' && isCaptain && (
          <TeamInvitationsTab
            teamId={team.id}
            onInviteNew={openInviteDialog}
          />
        )}

        {activeTab === 'availability' && (
          <div className="availability-tab">
            {isCaptain && (
              <div className="heatmap-section">
                <AvailabilityHeatmap teamId={team.id} memberCount={team.memberCount} />
                <hr className="section-divider" />
              </div>
            )}
            <AvailabilityForm teamId={team.id} />
          </div>
        )}

        {activeTab === 'tournaments' && isCaptain && (
          <TeamTournamentsTab teamId={team.id} isCaptain={isCaptain} />
        )}

        {activeTab === 'config' && isCaptain && (
          <TeamConfigTab team={team} onTeamUpdated={handleTeamUpdated} />
        )}
      </div>

      {/* Invite dialog (portal) */}
      {showInviteDialog && isCaptain && (
        <InvitePlayerDialog
          teamId={team.id}
          onClose={() => setShowInviteDialog(false)}
          onInvited={handleInvited}
        />
      )}
    </div>
  );
}


// ---- styles via <style jsx> emulation via className + global css ----
// Usamos clases CSS definidas abajo como string de estilos en scope.
const _styles = `
.dashboard { margin-top: 1.5rem; }
.tab-bar {
  display: flex; gap: 0.25rem; border-bottom: 1px solid var(--color-border);
  overflow-x: auto; padding-bottom: 0; margin-bottom: 1.5rem;
}
.tab-btn {
  display: flex; align-items: center; gap: 0.45rem; padding: 0.6rem 1rem;
  background: none; border: none; border-bottom: 2px solid transparent;
  color: var(--color-muted-foreground); cursor: pointer; font-size: 0.875rem;
  font-weight: 500; white-space: nowrap; transition: color 0.15s, border-color 0.15s;
  margin-bottom: -1px;
}
.tab-btn:hover { color: var(--color-foreground); }
.tab-btn--active { color: var(--color-primary); border-bottom-color: var(--color-primary); }
.tab-content { min-height: 200px; }
.placeholder {
  text-align: center; padding: 3rem 1rem;
  color: var(--color-muted-foreground);
}
.placeholder-icon { margin: 0 auto 1rem; display: block; opacity: 0.35; }
.availability-tab { display: flex; flex-direction: column; gap: 1.5rem; }
.heatmap-section { }
.section-divider { border: none; border-top: 1px solid var(--color-border); margin: 0; }
`;

// Inject styles once via a style tag trick
if (typeof document !== 'undefined') {
  const tag = document.getElementById('team-dashboard-styles');
  if (!tag) {
    const s = document.createElement('style');
    s.id = 'team-dashboard-styles';
    s.textContent = _styles;
    document.head.appendChild(s);
  }
}
