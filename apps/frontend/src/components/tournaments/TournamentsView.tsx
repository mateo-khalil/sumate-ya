/**
 * TournamentsView - toggle wrapper between tournament list and map views.
 *
 * Decision Context:
 * - MatchesView already established the interaction: keep the selected view client-side
 *   and lazy-load Leaflet only when the user opens the map.
 * - TournamentList and TournamentMap fetch independently, matching the existing matches
 *   architecture and keeping registration updates scoped to the list card flow.
 * - Filters are controlled here so list/map share one state and URL params stay in sync.
 */

import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { List, Map as MapIcon } from 'lucide-react';
import { TournamentList } from './TournamentList';
import { TournamentFilters } from './TournamentFilters';
import {
  DEFAULT_TOURNAMENT_FILTERS,
  normalizeTournamentFilters,
  parseTournamentFiltersFromSearch,
  writeTournamentFiltersToUrl,
  type ClientTournamentFilters,
} from '@/lib/tournament-filtering';

const TournamentMap = lazy(() =>
  import('./TournamentMap').then((module) => ({ default: module.TournamentMap })),
);

type View = 'list' | 'map';

interface TournamentsViewProps {
  isAuthenticated?: boolean;
}

export function TournamentsView({ isAuthenticated = false }: TournamentsViewProps) {
  const [view, setView] = useState<View>('list');
  const [filters, setFilters] = useState<ClientTournamentFilters>(DEFAULT_TOURNAMENT_FILTERS);
  const [urlReady, setUrlReady] = useState(false);

  useEffect(() => {
    const filtersFromUrl = parseTournamentFiltersFromSearch(window.location.search);
    setFilters(filtersFromUrl);
    setUrlReady(true);
  }, []);

  const handleFiltersChange = useCallback(
    (newFilters: ClientTournamentFilters) => {
      const normalized = normalizeTournamentFilters(newFilters);
      setFilters(normalized);

      if (urlReady) {
        window.history.replaceState(
          null,
          '',
          writeTournamentFiltersToUrl(normalized, window.location.href),
        );
      }
    },
    [urlReady],
  );

  return (
    // `tournaments-section` is a stable structural/hydration anchor consumed by the e2e
    // TournamentsListPage.goto() (scrollIntoView triggers the client:visible island).
    // Previously fixed bugs: the /partidos unification (commit 432281a) dropped the
    // wrapping <section class="tournaments-section">, which silently broke every
    // tournaments spec's goto() wait. Keep this class on the island root.
    <div className="tournaments-section">
      <TournamentFilters filters={filters} onFiltersChange={handleFiltersChange} />

      <div className="tournament-view-toggle" role="group" aria-label="Seleccionar vista de torneos">
        <button
          type="button"
          className={`tournament-view-toggle-btn${view === 'list' ? ' active' : ''}`}
          onClick={() => setView('list')}
          aria-pressed={view === 'list'}
        >
          <span className="tournament-view-toggle-icon">
            <List size={16} strokeWidth={2.25} aria-hidden="true" />
          </span>
          Lista
        </button>
        <button
          type="button"
          className={`tournament-view-toggle-btn${view === 'map' ? ' active' : ''}`}
          onClick={() => setView('map')}
          aria-pressed={view === 'map'}
        >
          <span className="tournament-view-toggle-icon">
            <MapIcon size={16} strokeWidth={2.25} aria-hidden="true" />
          </span>
          Mapa
        </button>
      </div>

      {view === 'list' ? (
        <TournamentList
          isAuthenticated={isAuthenticated}
          filters={filters}
        />
      ) : (
        <Suspense
          fallback={
            <div className="tournament-map-loading">
              <div className="tournament-map-loading-inner">Cargando mapa...</div>
            </div>
          }
        >
          <TournamentMap filters={filters} />
        </Suspense>
      )}

      <style>{`
        .tournament-view-toggle {
          display: inline-flex;
          gap: 0;
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          overflow: hidden;
          margin-bottom: 1.5rem;
          background: hsl(220 55% 11%);
        }

        .tournament-view-toggle-btn {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.4rem 1rem;
          min-height: 44px;
          background: transparent;
          border: none;
          color: hsl(215 20% 55%);
          font-family: 'Barlow Condensed', sans-serif;
          font-size: 0.875rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          cursor: pointer;
          transition: background 0.15s, color 0.15s;
        }

        .tournament-view-toggle-btn + .tournament-view-toggle-btn {
          border-left: 1px solid rgba(255, 255, 255, 0.1);
        }

        .tournament-view-toggle-btn:hover {
          background: rgba(255, 255, 255, 0.06);
          color: hsl(210 20% 85%);
        }

        .tournament-view-toggle-btn.active {
          background: hsl(35 100% 48%);
          color: hsl(220 72% 7%);
        }

        .tournament-view-toggle-icon {
          font-size: 0.9rem;
          line-height: 1;
        }

        .tournament-map-wrap {
          position: relative;
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 4px 32px rgba(0, 0, 0, 0.4);
        }

        .tournament-map-empty-msg {
          position: absolute;
          bottom: 1.25rem;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(7, 15, 31, 0.85);
          color: hsl(215 20% 65%);
          padding: 0.5rem 1.25rem;
          border-radius: 20px;
          font-family: 'Barlow', sans-serif;
          font-size: 0.875rem;
          white-space: nowrap;
          border: 1px solid rgba(255, 255, 255, 0.08);
          backdrop-filter: blur(8px);
        }

        .tournament-map-loading {
          height: 400px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 12px;
          background: hsl(220 55% 11%);
          border: 1px solid rgba(255, 255, 255, 0.06);
        }

        .tournament-map-loading-inner {
          color: hsl(215 20% 55%);
          font-family: 'Barlow', sans-serif;
          font-size: 0.9rem;
        }

        @media (max-width: 420px) {
          .tournament-view-toggle {
            display: flex;
            width: 100%;
          }

          .tournament-view-toggle-btn {
            flex: 1;
            justify-content: center;
          }

          .tournament-map-empty-msg {
            max-width: calc(100% - 2rem);
            white-space: normal;
            text-align: center;
          }
        }
      `}</style>
    </div>
  );
}
