/**
 * ClubLocationPicker — Department selector + address field + draggable map pin
 * Rendered as a React island (client:only="react") inside the club registration form.
 * Contributes named <input> elements to the parent <form> so values are included in the
 * standard HTML form POST without any extra JS intercept.
 *
 * Decision Context:
 * - Why a React island: Leaflet requires `window`/`document` and cannot run server-side.
 *   client:only="react" skips SSR entirely, which is correct here.
 * - Hidden inputs for lat/lng: the map state lives in React but the values reach the form
 *   submission through <input type="hidden" name="lat"> elements that React keeps in sync
 *   with the marker position. No fetch/event bridge needed.
 * - Department as default position: selecting a department moves the marker AND recenters
 *   the map to that department's capital. If the admin doesn't drag the pin, the capital
 *   coordinates are saved — better than null/zero for the map view.
 * - Zone = department: the clubs.zone column drives the zone dropdown in the match-listing
 *   filter. We set zone = department so new clubs appear in the zone filter without a
 *   separate migration or field.
 * - Leaflet icon fix: same CDN override used by MatchMap.tsx (bundlers mangle _getIconUrl).
 * - Previously fixed bugs: none relevant.
 */

import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';

// Leaflet bundler fix — same approach as MatchMap.tsx
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// 19 Uruguayan departments with their capital city coordinates
const DEPARTMENTS: Record<string, [number, number]> = {
  'Artigas':        [-30.4064, -56.4773],
  'Canelones':      [-34.5201, -56.2820],
  'Cerro Largo':    [-32.3678, -54.1695],
  'Colonia':        [-34.4620, -57.8487],
  'Durazno':        [-33.3792, -56.5250],
  'Flores':         [-33.5244, -56.8940],
  'Florida':        [-34.0973, -56.2148],
  'Lavalleja':      [-34.4082, -55.2333],
  'Maldonado':      [-34.9022, -54.9601],
  'Montevideo':     [-34.9011, -56.1645],
  'Paysandú':       [-32.3213, -58.0768],
  'Río Negro':      [-32.7380, -58.0820],
  'Rivera':         [-30.9081, -55.5447],
  'Rocha':          [-34.4822, -54.3450],
  'Salto':          [-31.3869, -57.9613],
  'San José':       [-34.3369, -56.7152],
  'Soriano':        [-33.5378, -58.0193],
  'Tacuarembó':     [-31.7183, -55.9790],
  'Treinta y Tres': [-33.2335, -54.3820],
};

const DEPT_LIST = Object.keys(DEPARTMENTS).sort();

interface Props {
  initialDepartment?: string;
  initialAddress?: string;
  initialLat?: number;
  initialLng?: number;
  fieldErrors?: {
    department?: string;
    address?: string;
    lat?: string;
  };
}

// Moves the map view whenever center changes (e.g. when the user picks a new department)
function MapRecenter({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, 13);
  }, [center, map]);
  return null;
}

// Draggable marker that reports its position after each drag
function DraggableMarker({
  position,
  onMove,
}: {
  position: [number, number];
  onMove: (lat: number, lng: number) => void;
}) {
  const markerRef = useRef<L.Marker | null>(null);
  const eventHandlers = useMemo(
    () => ({
      dragend() {
        const m = markerRef.current;
        if (m) {
          const p = m.getLatLng();
          onMove(p.lat, p.lng);
        }
      },
    }),
    [onMove],
  );
  return (
    <Marker draggable eventHandlers={eventHandlers} position={position} ref={markerRef} />
  );
}

export default function ClubLocationPicker({
  initialDepartment = 'Montevideo',
  initialAddress = '',
  initialLat,
  initialLng,
  fieldErrors,
}: Props) {
  const [department, setDepartment] = useState(initialDepartment || 'Montevideo');
  const [address, setAddress] = useState(initialAddress || '');

  const deptCoords = DEPARTMENTS[department] ?? DEPARTMENTS['Montevideo']!;
  const [position, setPosition] = useState<[number, number]>(
    initialLat && initialLng ? [initialLat, initialLng] : deptCoords,
  );
  const [mapCenter, setMapCenter] = useState<[number, number]>(deptCoords);

  function handleDepartmentChange(dept: string) {
    setDepartment(dept);
    const coords = DEPARTMENTS[dept] ?? DEPARTMENTS['Montevideo']!;
    setMapCenter(coords);
    setPosition(coords);
  }

  const handleMarkerMove = useCallback((lat: number, lng: number) => {
    setPosition([lat, lng]);
  }, []);

  const [lat, lng] = position;

  return (
    <>
      <div className="field cp-field">
        <label htmlFor="department" className="cp-label">Departamento</label>
        <select
          id="department"
          name="department"
          value={department}
          onChange={(e) => handleDepartmentChange(e.target.value)}
          className="cp-select"
        >
          {DEPT_LIST.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
        {fieldErrors?.department && (
          <span className="cp-error">{fieldErrors.department}</span>
        )}
      </div>

      <div className="field cp-field">
        <label htmlFor="address" className="cp-label">Dirección</label>
        <input
          id="address"
          name="address"
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Av. 18 de Julio 1234"
          className="cp-input"
        />
        {fieldErrors?.address && (
          <span className="cp-error">{fieldErrors.address}</span>
        )}
      </div>

      <div className="field cp-field">
        <span className="cp-label">Ubicación exacta del club</span>
        <p className="cp-hint">
          El marcador está en la capital del departamento. Arrastralo hasta la ubicación exacta de tu club.
        </p>
        <div className="cp-map-wrap">
          <MapContainer
            center={mapCenter}
            zoom={13}
            style={{ height: '280px', width: '100%' }}
            scrollWheelZoom={false}
          >
            <TileLayer
              attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <MapRecenter center={mapCenter} />
            <DraggableMarker position={position} onMove={handleMarkerMove} />
          </MapContainer>
        </div>
        {fieldErrors?.lat && <span className="cp-error">{fieldErrors.lat}</span>}
      </div>

      {/* Hidden inputs — picked up by the parent <form> on submit */}
      <input type="hidden" name="lat" value={lat} />
      <input type="hidden" name="lng" value={lng} />

      <style>{`
        .cp-field { display: flex; flex-direction: column; gap: 0.35rem; }
        .cp-label {
          font-size: 0.78rem; font-weight: 600;
          color: hsl(215 20% 62%); text-transform: uppercase;
          letter-spacing: 0.08em; font-family: 'Barlow Condensed', sans-serif;
        }
        .cp-select, .cp-input {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px; padding: 0.7rem 0.875rem;
          font-size: 1rem; font-family: 'Barlow', sans-serif;
          color: var(--color-foreground);
          -webkit-text-fill-color: var(--color-foreground);
          width: 100%; outline: none;
          transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
        }
        .cp-select:focus, .cp-input:focus {
          border-color: hsl(216 85% 55%);
          background: rgba(27, 105, 224, 0.08);
          box-shadow: 0 0 0 3px rgba(27, 105, 224, 0.2);
        }
        .cp-select option { background: hsl(220 55% 11%); color: hsl(210 20% 94%); }
        .cp-hint {
          font-size: 0.8rem; color: hsl(215 20% 45%);
          font-family: 'Barlow', sans-serif; margin: 0 0 0.5rem;
        }
        .cp-map-wrap {
          border-radius: 8px; overflow: hidden;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }
        .cp-error { font-size: 0.78rem; color: hsl(0 72% 65%); font-family: 'Barlow', sans-serif; }
      `}</style>
    </>
  );
}
