/**
 * TournamentMap - Leaflet map view of registration tournaments.
 *
 * Decision Context:
 * - Mirrors MatchMap so tournaments use the same OpenStreetMap/Leaflet integration.
 * - Leaflet touches browser globals, so this component is only imported lazily from
 *   TournamentsView after hydration.
 * - Tournament pins come from the associated club coordinates: clubs.lat / clubs.lng.
 *   Clubs without coordinates are omitted from the marker layer without breaking the list.
 * - Receives the same controlled filters as TournamentList and forwards them to GraphQL.
 */

import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import { LocateFixed } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  GET_TOURNAMENTS,
  type TournamentListItem,
} from '@/graphql/operations/tournaments';
import type { MatchFormat } from '@/graphql/operations/matches';
import {
  DEFAULT_TOURNAMENT_FILTERS,
  filterTournaments,
  toServerTournamentFilters,
  type ClientTournamentFilters,
} from '@/lib/tournament-filtering';

delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  iconRetinaUrl:
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const MONTEVIDEO: [number, number] = [-34.9011, -56.1645];
const DEFAULT_CENTER = MONTEVIDEO;
const DEFAULT_ZOOM = 12;
const MAP_HEIGHT_DESKTOP = '600px';
const MAP_HEIGHT_MOBILE_BREAKPOINT = 640;

const FORMAT_LABELS: Record<MatchFormat, string> = {
  FIVE_VS_FIVE: '5v5',
  SEVEN_VS_SEVEN: '7v7',
  TEN_VS_TEN: '10v10',
  ELEVEN_VS_ELEVEN: '11v11',
};

interface GetTournamentsPayload {
  tournaments: TournamentListItem[];
}

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
        setTooltip('No se pudo obtener tu ubicacion, mostrando la ubicacion por defecto');
        setTimeout(() => setTooltip(null), 4000);
      },
    );
  }, [map]);

  if (!geoSupported) return null;

  return (
    <div className="leaflet-top leaflet-right" style={{ pointerEvents: 'auto', zIndex: 1000 }}>
      <div className="leaflet-control leaflet-bar" style={{ margin: 10 }}>
        <button
          type="button"
          onClick={centerOnUser}
          title="Centrar en mi ubicacion"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 30,
            height: 30,
            background: 'hsl(220 55% 11%)',
            border: 'none',
            color: 'hsl(35 100% 55%)',
            cursor: 'pointer',
          }}
          aria-label="Centrar en mi ubicacion"
        >
          <LocateFixed size={16} strokeWidth={2.25} aria-hidden="true" />
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

function TournamentPopup({ tournament }: { tournament: TournamentListItem }) {
  const registeredTeams = Math.min(tournament.registeredTeamsCount, tournament.teamCount);

  return (
    <div style={{ minWidth: 180 }}>
      <strong style={{ display: 'block', marginBottom: 4 }}>{tournament.name}</strong>
      {tournament.club && (
        <span style={{ display: 'block', fontSize: '0.75rem', color: '#666', marginBottom: 4 }}>
          {tournament.club.name}
          {tournament.club.zone ? ` - ${tournament.club.zone}` : ''}
        </span>
      )}
      <span style={{ display: 'block', marginBottom: 2 }}>
        {FORMAT_LABELS[tournament.format] ?? tournament.format}
      </span>
      <span style={{ display: 'block', marginBottom: 8 }}>
        {registeredTeams}/{tournament.teamCount} equipos
      </span>
      <a
        href={`/torneos/${tournament.id}`}
        style={{ color: 'hsl(216 85% 45%)', fontWeight: 600, textDecoration: 'none' }}
      >
        Ver detalle -&gt;
      </a>
    </div>
  );
}

function EmptyMap({ message, mapStyle }: { message: string; mapStyle: CSSProperties }) {
  return (
    <div className="tournament-map-wrap">
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
      <p className="tournament-map-empty-msg">{message}</p>
    </div>
  );
}

interface TournamentMapProps {
  filters?: ClientTournamentFilters;
}

export function TournamentMap({ filters = DEFAULT_TOURNAMENT_FILTERS }: TournamentMapProps) {
  const [tournaments, setTournaments] = useState<TournamentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const mapHeight = useMemo(
    () => (window.innerWidth <= MAP_HEIGHT_MOBILE_BREAKPOINT ? '400px' : MAP_HEIGHT_DESKTOP),
    [],
  );
  const mapStyle = useMemo(() => ({ height: mapHeight, width: '100%' }), [mapHeight]);
  const serverFilters = useMemo(() => toServerTournamentFilters(filters), [filters]);
  const serverFiltersKey = useMemo(() => JSON.stringify(serverFilters), [serverFilters]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch('/api/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: GET_TOURNAMENTS, variables: { filters: serverFilters } }),
    })
      .then((response) => response.json())
      .then((payload: { data?: GetTournamentsPayload; errors?: Array<{ message: string }> }) => {
        if (cancelled) return;
        const graphQLError = payload.errors?.[0]?.message;
        if (graphQLError) throw new Error(graphQLError);
        setTournaments(filterTournaments(payload.data?.tournaments ?? [], filters));
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Error al cargar el mapa');
          setTournaments([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverFiltersKey]);

  const geoTournaments = tournaments.filter((tournament) => {
    if (tournament.club?.lat == null || tournament.club?.lng == null) {
      if (tournament.club) {
        console.warn(
          `[TournamentMap] Club sin coordenadas, omitido del mapa: tournamentId=${tournament.id}`,
        );
      }
      return false;
    }
    return true;
  });

  if (loading) {
    return (
      <div className="tournament-map-loading">
        <div className="tournament-map-loading-inner">Cargando mapa...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="tournament-map-loading">
        <p style={{ color: 'hsl(0 72% 51%)' }}>{error}</p>
      </div>
    );
  }

  if (tournaments.length === 0) {
    return <EmptyMap message="No hay torneos para esos filtros" mapStyle={mapStyle} />;
  }

  if (geoTournaments.length === 0) {
    return <EmptyMap message="No hay torneos con ubicacion disponible" mapStyle={mapStyle} />;
  }

  return (
    <div className="tournament-map-wrap">
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
        {geoTournaments.map((tournament) => (
          <Marker
            key={tournament.id}
            position={[tournament.club!.lat as number, tournament.club!.lng as number]}
          >
            <Popup>
              <TournamentPopup tournament={tournament} />
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
