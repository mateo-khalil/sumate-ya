# Prompt Log

- Timestamp: 2026-05-04 19:25:00
- Task ID: k7m3p2qx

## User Prompt

> Recienteennte eliminé las cordenadas, solo estoy guardando la dirección del club en la db, implementa que calcules la ubicación en base a la dirección para mostrar los pines etc.

## Agent Main Actions

- Added `geocodingService.ts` (Nominatim + Redis cache + per-process rate-limited queue) and a `clubRepository.updateClubCoords` write helper, plus new `CACHE_PREFIX.GEOCODE` and `CACHE_TTL.GEOCODING` slots in `config/redis.ts`.
- Wired `enrichWithCoords` into the `listMatches`, `getMatchById`, and `getMatchDetail` cache fetchers in `matchService.ts` so any club fetched without `lat/lng` is geocoded once, persisted back to the `clubs` table, and rendered with a pin on the map.
- Ran `turbo typecheck --force` (clean) and `playwright test matches-list.spec.ts matches-map.spec.ts` — list specs pass; the 2 map failures are pre-existing fixture issues unrelated to backend changes (mocked tests with no lat/lng + Chrome geolocation API).
