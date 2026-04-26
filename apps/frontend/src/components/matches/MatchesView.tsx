/**
 * MatchesView — Toggle wrapper between list view and map view
 *
 * Decision Context:
 * - Why a wrapper: keeps the toggle state client-side so switching views does not
 *   reload the page. Both MatchList and MatchMap manage their own data fetching,
 *   which is intentional — they may have different filter requirements in the future.
 * - React's conditional rendering unmounts the inactive view; since backend results
 *   are cached in Redis, re-fetching on toggle is fast (< 2-3 ms service layer).
 * - Conditional unmount is preferred over CSS hide/show to avoid mounting Leaflet's
 *   DOM on pages where the map is never viewed — consistent with `client:visible` goals.
 * - Previously fixed bugs: none relevant.
 */

import { useState, lazy, Suspense } from 'react';
import { MatchList } from './MatchList';

// Lazy import — Leaflet uses browser-only APIs (window/document) and crashes in Node SSR
// if imported statically. React.lazy defers the import until the user clicks "Mapa",
// ensuring Leaflet is only loaded in the browser and only when actually needed.
// Previously fixed bugs: static import caused "window is not defined" on every page load.
const MatchMap = lazy(() => import('./MatchMap').then((m) => ({ default: m.MatchMap })));

type View = 'list' | 'map';

interface MatchesViewProps {
  isAuthenticated?: boolean;
}

export function MatchesView({ isAuthenticated = false }: MatchesViewProps) {
  const [view, setView] = useState<View>('list');

  return (
    <div>
      {/* View toggle */}
      <div className="view-toggle">
        <button
          className={`view-toggle-btn${view === 'list' ? ' active' : ''}`}
          onClick={() => setView('list')}
          aria-pressed={view === 'list'}
        >
          <span className="view-toggle-icon">☰</span>
          Lista
        </button>
        <button
          className={`view-toggle-btn${view === 'map' ? ' active' : ''}`}
          onClick={() => setView('map')}
          aria-pressed={view === 'map'}
        >
          <span className="view-toggle-icon">🗺</span>
          Mapa
        </button>
      </div>

      {/* Active view */}
      {view === 'list' ? (
        <MatchList isAuthenticated={isAuthenticated} />
      ) : (
        <Suspense
          fallback={
            <div className="match-map-loading">
              <div className="match-map-loading-inner">Cargando mapa...</div>
            </div>
          }
        >
          <MatchMap />
        </Suspense>
      )}

      <style>{`
        .view-toggle {
          display: inline-flex;
          gap: 0;
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          overflow: hidden;
          margin-bottom: 1.5rem;
          background: hsl(220 55% 11%);
        }

        .view-toggle-btn {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.4rem 1rem;
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

        .view-toggle-btn + .view-toggle-btn {
          border-left: 1px solid rgba(255, 255, 255, 0.1);
        }

        .view-toggle-btn:hover {
          background: rgba(255, 255, 255, 0.06);
          color: hsl(210 20% 85%);
        }

        .view-toggle-btn.active {
          background: hsl(35 100% 48%);
          color: hsl(220 72% 7%);
        }

        .view-toggle-icon {
          font-size: 0.9rem;
          line-height: 1;
        }

        /* ── Map container (defined here so styles exist before MatchMap lazy-loads) ── */
        .match-map-wrap {
          position: relative;
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 4px 32px rgba(0, 0, 0, 0.4);
        }
        .match-map {
          height: 600px;
          width: 100%;
        }
        @media (max-width: 640px) {
          .match-map { height: 400px; }
        }
        .match-map-empty-msg {
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
        .match-map-loading {
          height: 400px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 12px;
          background: hsl(220 55% 11%);
          border: 1px solid rgba(255, 255, 255, 0.06);
        }
        .match-map-loading-inner {
          color: hsl(215 20% 55%);
          font-family: 'Barlow', sans-serif;
          font-size: 0.9rem;
        }
      `}</style>
    </div>
  );
}
