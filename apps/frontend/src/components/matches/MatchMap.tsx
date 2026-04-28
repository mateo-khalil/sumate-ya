/**
 * MatchMap — Leaflet map view of open matches
 *
 * Decision Context:
 * - Why Leaflet: free, open-source, no API key required — avoids Mapbox/Google billing.
 * - SSR safety: this component only runs in the browser via `client:visible` in Astro.
 *   Leaflet uses `window`/`document` directly, so it CANNOT be server-rendered. The
 *   `client:visible` directive defers execution until the element enters the viewport,
 *   which satisfies both the SSR-safety requirement and the lazy-load performance goal.
 * - Icon fix: Leaflet + Vite/Webpack mangles the default icon URLs at bundle time.
 *   The fix is to override `L.Icon.Default` with absolute CDN URLs before mounting.
 *   Do NOT remove this — markers will silently render as broken images without it.
 * - Geolocation: `navigator.geolocation` is always available in modern browsers but
 *   requires user permission. We show the "center" button only when the API exists,
 *   and fall back to Montevideo with a tooltip if permission is denied or unavailable.
 * - Clubs without lat/lng are excluded via filter + console.warn (non-breaking omission).
 * - Previously fixed bugs: none relevant.
 */

import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import type { Match } from './MatchCard';
import { executeQuery } from '@/lib/urql-client';
import { GET_MATCHES_WITH_COORDS } from '@/graphql/operations/matches';
import {
  DEFAULT_MATCH_FILTERS,
  filterMatches,
  toServerMatchFilters,
  type ClientMatchFilters,
} from '@/lib/match-filtering';

// Fix Leaflet default icon — bundlers mangle the internal _getIconUrl path.
// Using CDN URLs is the most reliable cross-bundler solution.
// Previously fixed bugs: markers invisible without this block.
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  iconRetinaUrl:
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// All club coordinates are validated to be within Uruguay — center on Montevideo.
const MONTEVIDEO: [number, number] = [-34.9011, -56.1645];
const DEFAULT_CENTER = MONTEVIDEO;
const DEFAULT_ZOOM = 12;

// Explicit pixel heights avoid the Leaflet 0-height race condition where the map
// reads container dimensions before the CSS class is applied by the browser.
const MAP_HEIGHT_DESKTOP = '600px';
const MAP_HEIGHT_MOBILE_BREAKPOINT = 640;

const FORMAT_LABELS: Record<string, string> = {
  FIVE_VS_FIVE: '5v5',
  SEVEN_VS_SEVEN: '7v7',
  TEN_VS_TEN: '10v10',
  ELEVEN_VS_ELEVEN: '11v11',
};

// ─── Location Control ───────────────────────────────────────────────────────

function LocationButton() {
  const map = useMap();
  const [tooltip, setTooltip] = useState<string | null>(null);
  const [geoSupported, setGeoSupported] = useState(false);

  useEffect(() => {
    setGeoSupported('geolocation' in navigator);
  }, []);

  const centerOnUser = useCallback(() => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        map.setView([pos.coords.latitude, pos.coords.longitude], 14);
      },
      () => {
        setTooltip('No se pudo obtener tu ubicación, mostrando la ubicación por defecto');
        setTimeout(() => setTooltip(null), 4000);
      },
    );
  }, [map]);

  if (!geoSupported) return null;

  return (
    <div
      className="leaflet-top leaflet-right"
      style={{ pointerEvents: 'auto', zIndex: 1000 }}
    >
      <div className="leaflet-control leaflet-bar" style={{ margin: 10 }}>
        <button
          onClick={centerOnUser}
          title="Centrar en mi ubicación"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 30,
            height: 30,
            background: 'hsl(220 55% 11%)',
            border: 'none',
            color: 'hsl(35 100% 55%)',
            fontSize: '1rem',
            cursor: 'pointer',
          }}
        >
          📍
        </button>
      </div>
      {tooltip && (
        <div
          style={{
            margin: '0 10px',
            padding: '6px 10px',
            background: 'hsl(220 55% 11%)',
            color: 'hsl(215 20% 65%)',
            borderRadius: 6,
            fontSize: '0.75rem',
            maxWidth: 200,
            border: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          {tooltip}
        </div>
      )}
    </div>
  );
}

// ─── Popup content ───────────────────────────────────────────────────────────

function MatchPopup({ match }: { match: Match }) {
  const filledSlots = match.totalSlots - match.availableSlots;
  return (
    <div style={{ minWidth: 160 }}>
      <strong style={{ display: 'block', marginBottom: 4 }}>{match.club?.name}</strong>
      {match.club?.address && (
        <span style={{ display: 'block', fontSize: '0.75rem', color: '#666', marginBottom: 4 }}>
          {match.club.address}
        </span>
      )}
      <span style={{ display: 'block', marginBottom: 2 }}>
        {FORMAT_LABELS[match.format] ?? match.format}
      </span>
      <span style={{ display: 'block', marginBottom: 8 }}>
        {filledSlots}/{match.totalSlots} jugadores
      </span>
      <a
        href={`/partidos/${match.id}`}
        style={{ color: 'hsl(216 85% 45%)', fontWeight: 600, textDecoration: 'none' }}
      >
        Ver detalle →
      </a>
    </div>
  );
}

// ─── Empty states ────────────────────────────────────────────────────────────

function EmptyMap({ message, mapStyle }: { message: string; mapStyle: React.CSSProperties }) {
  return (
    <div className="match-map-wrap">
      <MapContainer
        center={DEFAULT_CENTER}
        zoom={DEFAULT_ZOOM}
        style={mapStyle}
        scrollWheelZoom={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
      </MapContainer>
      <p className="match-map-empty-msg">{message}</p>
    </div>
  );
}

// Styles live in MatchesView.tsx so they are available before this component
// lazy-loads — injecting them here would cause a flash where Leaflet sees 0-height.

// ─── Main component ──────────────────────────────────────────────────────────

interface MatchMapProps {
  filters?: ClientMatchFilters;
}

export function MatchMap({ filters = DEFAULT_MATCH_FILTERS }: MatchMapProps) {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Inline map height avoids the Leaflet 0-height race where CSS class is applied
  // after Leaflet reads container dimensions on mount.
  const mapHeight = useMemo(
    () => (window.innerWidth <= MAP_HEIGHT_MOBILE_BREAKPOINT ? '400px' : MAP_HEIGHT_DESKTOP),
    [],
  );
  const mapStyle = useMemo(() => ({ height: mapHeight, width: '100%' }), [mapHeight]);

  useEffect(() => {
    executeQuery<{ matches: Match[] }>(GET_MATCHES_WITH_COORDS, {
      filters: toServerMatchFilters(DEFAULT_MATCH_FILTERS),
    })
      .then((data) => setMatches(data.matches))
      .catch((err) => setError(err instanceof Error ? err.message : 'Error al cargar el mapa'))
      .finally(() => setLoading(false));
  }, []);

  const filteredMatches = useMemo(() => filterMatches(matches, filters), [matches, filters]);

  const geoMatches = filteredMatches.filter((m) => {
    if (m.club?.lat == null || m.club?.lng == null) {
      if (m.club) {
        console.warn(`[MatchMap] Club sin coordenadas, omitido del mapa: matchId=${m.id}`);
      }
      return false;
    }
    return true;
  });

  if (loading) {
    return (
      <div className="match-map-loading">
        <div className="match-map-loading-inner">Cargando mapa...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="match-map-loading">
        <p style={{ color: 'hsl(0 72% 51%)' }}>{error}</p>
      </div>
    );
  }

  if (filteredMatches.length === 0) {
    return <EmptyMap message="No hay partidos disponibles" mapStyle={mapStyle} />;
  }

  if (geoMatches.length === 0) {
    return <EmptyMap message="No hay partidos con ubicación disponible" mapStyle={mapStyle} />;
  }

  return (
    <div className="match-map-wrap">
      <MapContainer
        center={DEFAULT_CENTER}
        zoom={DEFAULT_ZOOM}
        style={mapStyle}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <LocationButton />
        {geoMatches.map((match) => (
          <Marker
            key={match.id}
            position={[match.club!.lat as number, match.club!.lng as number]}
          >
            <Popup>
              <MatchPopup match={match} />
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
