/**
 * UnifiedDiscovery — vista unificada de Partidos y Torneos en /partidos.
 *
 * Decision Context:
 * - El usuario pidió que /partidos liste tanto partidos como torneos para todos los roles.
 * - Se usa display:none en lugar de desmontaje condicional para preservar el estado
 *   (filtros, scroll) al cambiar de tab sin re-fetchear datos.
 * - MatchesView y TournamentList son React islands pre-existentes; aquí se componen.
 * - Previously fixed bugs: none relevant.
 */

import { useState } from 'react';
import { Volleyball, Trophy } from 'lucide-react';
import { MatchesView } from '@/components/matches';
import { TournamentList } from '@/components/tournaments/TournamentList';

type Tab = 'partidos' | 'torneos';

interface Props {
  isAuthenticated: boolean;
}

export function UnifiedDiscovery({ isAuthenticated }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('partidos');

  return (
    <div className="unified-discovery">
      {/* Tab bar */}
      <div className="discovery-tabs" role="tablist" aria-label="Sección activa">
        <button
          role="tab"
          aria-selected={activeTab === 'partidos'}
          aria-controls="panel-partidos"
          id="tab-partidos"
          onClick={() => setActiveTab('partidos')}
          className={`discovery-tab ${activeTab === 'partidos' ? 'discovery-tab--active' : ''}`}
        >
          <Volleyball size={16} strokeWidth={2} aria-hidden="true" />
          Partidos
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'torneos'}
          aria-controls="panel-torneos"
          id="tab-torneos"
          onClick={() => setActiveTab('torneos')}
          className={`discovery-tab ${activeTab === 'torneos' ? 'discovery-tab--active' : ''}`}
        >
          <Trophy size={16} strokeWidth={2} aria-hidden="true" />
          Torneos
        </button>
      </div>

      {/* Paneles — display:none en lugar de desmontaje para preservar estado */}
      <div
        id="panel-partidos"
        role="tabpanel"
        aria-labelledby="tab-partidos"
        style={{ display: activeTab === 'partidos' ? 'block' : 'none' }}
      >
        <MatchesView isAuthenticated={isAuthenticated} />
      </div>

      <div
        id="panel-torneos"
        role="tabpanel"
        aria-labelledby="tab-torneos"
        style={{ display: activeTab === 'torneos' ? 'block' : 'none' }}
      >
        <TournamentList isAuthenticated={isAuthenticated} />
      </div>

      <style>{`
        .unified-discovery { width: 100%; }

        .discovery-tabs {
          display: flex;
          gap: 0.25rem;
          border-bottom: 1px solid hsl(220 30% 20%);
          margin-bottom: 1.5rem;
          padding-bottom: 0;
        }

        .discovery-tab {
          display: flex;
          align-items: center;
          gap: 0.45rem;
          padding: 0.65rem 1.25rem;
          background: none;
          border: none;
          border-bottom: 2px solid transparent;
          color: hsl(215 20% 55%);
          cursor: pointer;
          font-size: 0.9rem;
          font-weight: 600;
          letter-spacing: 0.01em;
          white-space: nowrap;
          transition: color 0.15s, border-color 0.15s;
          margin-bottom: -1px;
        }
        .discovery-tab:hover { color: hsl(215 20% 80%); }
        .discovery-tab--active {
          color: hsl(35 100% 58%);
          border-bottom-color: hsl(35 100% 58%);
        }
      `}</style>
    </div>
  );
}
