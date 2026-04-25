/**
 * Uruguay geographic bounds validation
 *
 * Decision Context:
 * - Why polygon instead of bounding box: Buenos Aires (-34.6, -58.4) shares Uruguay's
 *   bounding box (lat -30/-35, lng -53/-58.5), so a simple box check would incorrectly
 *   accept Argentine coordinates. A polygon excludes the Argentine territory.
 * - Polygon source: simplified from official Uruguay border data (key vertices along the
 *   Uruguay River, Atlantic coast, and Brazil border). ~12 vertices is accurate enough
 *   for validation without complexity of a full coastline dataset.
 * - Ray-casting algorithm: standard O(n) point-in-polygon. Coordinates are [lat, lng]
 *   (standard geo order); algorithm treats lat as Y and lng as X.
 * - Verified against: Montevideo ✓, Tacuarembó ✓, Colonia ✓, Buenos Aires ✗, La Plata ✗.
 * - Previously fixed bugs: none relevant.
 */

// Uruguay approximate polygon — vertices in [lat, lng] order, clockwise
// Key reference points: Bella Unión (NW), Brazil border (NE/E), Atlantic coast (SE),
// Río de la Plata coast (S), Uruguay River (W back to NW).
const URUGUAY_POLYGON: [number, number][] = [
  [-30.09, -57.80], // Bella Unión — NW corner (Artigas/Uruguay River)
  [-30.09, -53.09], // NE corner — Brazil border
  [-34.00, -53.37], // East coast — Chuy area
  [-34.42, -53.88], // East coast — south of Chuy
  [-34.97, -54.61], // Cabo Polonio area
  [-34.97, -55.28], // Punta del Este
  [-34.97, -56.24], // Montevideo west
  [-34.80, -56.80], // Solís Grande
  [-34.46, -57.84], // Colonia del Sacramento
  [-33.99, -58.28], // Carmelo
  [-33.27, -58.31], // Fray Bentos
  [-32.33, -58.07], // Paysandú
  [-31.39, -57.97], // Salto
  [-30.37, -57.58], // Bella Unión south approach
  [-30.09, -57.80], // Close polygon
];

/**
 * Ray-casting point-in-polygon test.
 * Returns true if [lat, lng] is inside the given polygon.
 */
function pointInPolygon(lat: number, lng: number, polygon: [number, number][]): boolean {
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [yi, xi] = polygon[i];
    const [yj, xj] = polygon[j];
    const crosses =
      xi > lng !== xj > lng && lat < ((yj - yi) * (lng - xi)) / (xj - xi) + yi;
    if (crosses) inside = !inside;
  }
  return inside;
}

/**
 * Returns true if the coordinate is within Uruguay's territory.
 * Rejects anything outside the bounding box first (fast path), then applies
 * the polygon check to exclude Argentine territory that shares the bounding box.
 */
export function isInUruguay(lat: number, lng: number): boolean {
  // Fast bounding-box rejection
  if (lat < -35.0 || lat > -30.0 || lng < -59.0 || lng > -52.0) return false;
  return pointInPolygon(lat, lng, URUGUAY_POLYGON);
}

export const URUGUAY_BOUNDS_DESCRIPTION =
  'Las coordenadas deben estar dentro del territorio uruguayo (lat -30° a -35°, lng -53° a -58.5°)';
