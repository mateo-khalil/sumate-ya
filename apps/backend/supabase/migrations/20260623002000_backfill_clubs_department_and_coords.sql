-- Backfill department, zone, and geographic coordinates for all existing clubs.
-- Coordinates sourced from real Uruguayan street addresses. MichelC45 is already
-- complete (Tacuarembó) and is intentionally excluded from this migration.

-- Clubs that only need department added (already have good lat/lng and zone)
UPDATE "clubs"
SET "department" = 'Montevideo'
WHERE "id" IN (
  '0a0d4bb1-296d-4c1a-a5a6-ec48cffee5cb',  -- Club Nacional de Fútbol
  'cb111111-0000-0000-0000-0000000000c1',    -- Super Club Sumate Ya
  'fc000000-0000-0000-0000-000000000001'     -- The Football Club
);

-- Club Dashboard E2E: fix zone from test value 'E2E' to 'Montevideo'
UPDATE "clubs"
SET "department" = 'Montevideo', "zone" = 'Montevideo'
WHERE "id" = 'b2000000-0000-0000-0000-000000000001';

-- Club Owner FC — Centro, Montevideo
UPDATE "clubs"
SET "department" = 'Montevideo', "lat" = -34.9063, "lng" = -56.1882
WHERE "id" = 'c2b86caf-d2ef-49c5-8370-6fc85de40efe';

-- Club Tacua Sport — Av. Italia 4500, Buceo, Montevideo
UPDATE "clubs"
SET "department" = 'Montevideo', "lat" = -34.8935, "lng" = -56.1488
WHERE "id" = '4631bc92-4d4b-4e18-84c7-97ed81ecec6e';

-- Defensor Sporting Club — Av. Lavalleja 2750, Parque Rodó, Montevideo
UPDATE "clubs"
SET "department" = 'Montevideo', "lat" = -34.9100, "lng" = -56.1850
WHERE "id" = 'e4517508-2c93-46d8-a80c-201a10121e22';

-- Peñarol Cancha Las Acacias — Bvar. Batlle y Ordóñez 4750, La Unión, Montevideo
UPDATE "clubs"
SET "department" = 'Montevideo', "lat" = -34.8788, "lng" = -56.1236
WHERE "id" = '0d3fec63-e787-41b0-b8b6-18cf75c6d4a8';

-- MichelCCC — Av. Oribe s/n, Montevideo (override random coords)
UPDATE "clubs"
SET "department" = 'Montevideo', "zone" = 'Montevideo', "lat" = -34.9011, "lng" = -56.1645
WHERE "id" = '2903b86a-32d8-4bc2-a4b8-f8d2a5d038ee';

-- MichelCCC3 — Av. Oribe s/n, Montevideo
UPDATE "clubs"
SET "department" = 'Montevideo', "zone" = 'Montevideo', "lat" = -34.9011, "lng" = -56.1645
WHERE "id" = '4d7173c8-4ed9-4152-83b2-e032cd90382b';

-- MichelCCC333 — Av. Oribe 6677, Unión, Montevideo
UPDATE "clubs"
SET "department" = 'Montevideo', "zone" = 'Montevideo', "lat" = -34.8745, "lng" = -56.1267
WHERE "id" = '6fc2366c-ba2e-4574-b06c-ee65e712147b';
