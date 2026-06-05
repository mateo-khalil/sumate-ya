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
 * - Timeframe (Próximos / Pasados): rendered as a segmented toggle above the filter
 *   bar so users see and can switch the dataset before drilling in. Selecting Pasados
 *   maps to `status=COMPLETED` server-side (see match-filtering.toServerMatchFilters)
 *   and changes the dataset MatchList re-fetches. Filters and Lista/Mapa toggle keep
 *   working identically across both timeframes — the only timeframe-specific UI is
 *   the "Solo mis partidos" checkbox, which is rendered ONLY on Pasados AND only when
 *   the user is authenticated, because the backend silently ignores `onlyMine` for
 *   anonymous callers and exposing the toggle would deliver confusing empty results.
 * - Previously fixed bugs: none relevant.
 */

import { useCallback, useEffect, useState, lazy, Suspense } from 'react';
import { List, Map as MapIcon, Calendar, History } from 'lucide-react';
import { MatchList } from './MatchList';
import { MatchFilters } from './MatchFilters';
import {
  DEFAULT_MATCH_FILTERS,
  normalizeMatchFilters,
  parseMatchFiltersFromSearch,
  writeMatchFiltersToUrl,
  type ClientMatchFilters,
  type MatchTimeframe,
} from '@/lib/match-filtering';

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
  const [filters, setFilters] = useState<ClientMatchFilters>(DEFAULT_MATCH_FILTERS);
  const [urlReady, setUrlReady] = useState(false);

  useEffect(() => {
    const filtersFromUrl = parseMatchFiltersFromSearch(window.location.search);
    setFilters(filtersFromUrl);
    setUrlReady(true);
  }, []);

  const handleFiltersChange = useCallback(
    (newFilters: ClientMatchFilters) => {
      const normalized = normalizeMatchFilters(newFilters);
      setFilters(normalized);

      if (urlReady) {
        window.history.replaceState(null, '', writeMatchFiltersToUrl(normalized, window.location.href));
      }
    },
    [urlReady],
  );

  const timeframe: MatchTimeframe = filters.timeframe ?? 'upcoming';
  const onlyMine = !!filters.onlyMine;
  const showCancelled = !!filters.showCancelled;

  const handleTimeframeChange = useCallback(
    (next: MatchTimeframe) => {
      if (next === timeframe) return;
      // Switching back to "upcoming" must drop onlyMine — that flag only applies on
      // the past timeframe, and leaving it set would silently filter the upcoming list
      // by participation as soon as the user re-enables past mode.
      handleFiltersChange({
        ...filters,
        timeframe: next,
        onlyMine: next === 'past' ? filters.onlyMine : undefined,
      });
    },
    [filters, handleFiltersChange, timeframe],
  );

  const handleOnlyMineToggle = useCallback(
    (next: boolean) => {
      handleFiltersChange({ ...filters, onlyMine: next ? true : undefined });
    },
    [filters, handleFiltersChange],
  );

  const handleShowCancelledToggle = useCallback(
    (next: boolean) => {
      handleFiltersChange({ ...filters, showCancelled: next ? true : undefined });
    },
    [filters, handleFiltersChange],
  );

  return (
    // `matches-section` is a stable structural/hydration anchor consumed by the e2e
    // MatchesListPage.goto() (scrollIntoView triggers the client:visible island).
    // Previously fixed bugs: the /partidos unification (commit 432281a) dropped the
    // wrapping <section class="matches-section">, which silently broke every matches
    // spec's goto() wait. Keep this class on the island root.
    <div className="matches-section">
      {/* Timeframe toggle: Próximos vs Pasados */}
      <div className="timeframe-toggle-row">
        <div className="view-toggle" role="tablist" aria-label="Seleccionar período de partidos">
          <button
            className={`view-toggle-btn${timeframe === 'upcoming' ? ' active' : ''}`}
            onClick={() => handleTimeframeChange('upcoming')}
            aria-pressed={timeframe === 'upcoming'}
            role="tab"
            aria-selected={timeframe === 'upcoming'}
          >
            <span className="view-toggle-icon"><Calendar size={16} strokeWidth={2.25} aria-hidden="true" /></span>
            Próximos
          </button>
          <button
            className={`view-toggle-btn${timeframe === 'past' ? ' active' : ''}`}
            onClick={() => handleTimeframeChange('past')}
            aria-pressed={timeframe === 'past'}
            role="tab"
            aria-selected={timeframe === 'past'}
          >
            <span className="view-toggle-icon"><History size={16} strokeWidth={2.25} aria-hidden="true" /></span>
            Pasados
          </button>
        </div>

        {/* "Solo mis partidos" — only renders on Pasados AND only for authenticated users.
            The flag is server-enforced (see matchService.toFilterOptions) but exposing
            the toggle to anonymous users would return empty/unfiltered results and
            confuse the UI. */}
        {timeframe === 'past' && isAuthenticated && (
          <label className="only-mine-toggle">
            <input
              type="checkbox"
              checked={onlyMine}
              onChange={(event) => handleOnlyMineToggle(event.target.checked)}
              aria-label="Mostrar solo los partidos en los que jugué"
            />
            <span>Solo los míos</span>
          </label>
        )}

        {/* "Mostrar cancelados" — authenticated-only and timeframe-independent. Reveals
            ONLY the user's own cancelled matches (auto-cancelled for not filling the roster
            or admin-cancelled). Hidden for anonymous users because cancelled matches are
            private and the backend scopes them to the requester. */}
        {isAuthenticated && (
          <label className="only-mine-toggle">
            <input
              type="checkbox"
              checked={showCancelled}
              onChange={(event) => handleShowCancelledToggle(event.target.checked)}
              aria-label="Mostrar mis partidos cancelados"
            />
            <span>Mostrar cancelados</span>
          </label>
        )}
      </div>

      <MatchFilters filters={filters} onFiltersChange={handleFiltersChange} />

      {/* View toggle */}
      <div className="view-toggle">
        <button
          className={`view-toggle-btn${view === 'list' ? ' active' : ''}`}
          onClick={() => setView('list')}
          aria-pressed={view === 'list'}
        >
          <span className="view-toggle-icon"><List size={16} strokeWidth={2.25} aria-hidden="true" /></span>
          Lista
        </button>
        <button
          className={`view-toggle-btn${view === 'map' ? ' active' : ''}`}
          onClick={() => setView('map')}
          aria-pressed={view === 'map'}
        >
          <span className="view-toggle-icon"><MapIcon size={16} strokeWidth={2.25} aria-hidden="true" /></span>
          Mapa
        </button>
      </div>

      {/* Active view */}
      {view === 'list' ? (
        <MatchList
          isAuthenticated={isAuthenticated}
          filters={filters}
          onFiltersChange={handleFiltersChange}
          showFilters={false}
        />
      ) : (
        <Suspense
          fallback={
            <div className="match-map-loading">
              <div className="match-map-loading-inner">Cargando mapa...</div>
            </div>
          }
        >
          <MatchMap filters={filters} />
        </Suspense>
      )}

      <style>{`
        .timeframe-toggle-row {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 1rem;
          margin-bottom: 1rem;
        }

        .timeframe-toggle-row .view-toggle {
          margin-bottom: 0;
        }

        .only-mine-toggle {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          color: hsl(210 20% 85%);
          font-family: 'Barlow', sans-serif;
          font-size: 0.875rem;
          cursor: pointer;
          user-select: none;
        }

        .only-mine-toggle input[type='checkbox'] {
          width: 1rem;
          height: 1rem;
          accent-color: hsl(35 100% 48%);
          cursor: pointer;
        }

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
          min-height: 44px; /* iOS HIG touch target minimum */
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
