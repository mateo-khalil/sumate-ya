# Performance backend con k6

## Script

El script reusable esta en:

```text
apps/backend/load-tests/backend.js
```

Se ejecuta via Turborepo:

```powershell
pnpm loadtest:backend
```

O directo desde el paquete:

```powershell
pnpm --filter @sumate-ya/backend loadtest
```

## Variables

Minimo:

```powershell
$env:API_URL = "https://api.example.com"
pnpm loadtest:backend
```

Con endpoints protegidos y escritura concurrente:

```powershell
$env:API_URL = "https://api.example.com"
$env:K6_AUTH_TOKENS = "token-jugador-1,token-jugador-2,token-jugador-3"
$env:K6_JOIN_MATCH_ID = "match-id-abierto"
$env:K6_READ_RATE = "30"
$env:K6_READ_DURATION = "5m"
$env:K6_JOIN_VUS = "25"
$env:K6_JOIN_DURATION = "2m"
pnpm loadtest:backend
```

Variables opcionales:

- `K6_MATCH_ID`: fuerza el partido usado para detalle.
- `K6_TOURNAMENT_ID`: fuerza el torneo usado para bracket/fixture.
- `K6_AUTH_TOKEN`: token unico si no se pasa lista.

Para `JoinMatch`, conviene usar varios tokens de jugadores distintos. Si se usa el mismo token muchas veces, el backend deberia responder errores de consistencia esperados por usuario ya unido.

## Escenarios

Read-heavy:

- `GetMatches`
- `GetMatchDetail`
- `GetTournamentDetail`
- `GetLeaderboard`

Escritura concurrente:

- `JoinMatch` sobre `K6_JOIN_MATCH_ID`
- Alterna equipos `A` y `B`
- Usa tokens rotativos desde `K6_AUTH_TOKENS`

## Thresholds

Read-heavy:

- `http_req_failed < 2%`
- `p95 < 500ms`
- `p99 < 1200ms`

Join concurrente:

- `http_req_failed < 5%`
- `p95 < 800ms`
- `p99 < 1500ms`

Si se supera un threshold, k6 termina con exit code distinto de cero.

## Reporte

El resumen JSON queda en:

```text
apps/backend/load-tests/results/backend-summary.json
```

El stdout muestra conteo, RPS, p50, p95, p99 y tasa de error.

## Lectura de resultados

Checklist durante la prueba:

- En Grafana, `GraphQL p95 by Operation` debe mostrar que read-heavy se mantiene bajo threshold.
- `Redis Cache Hit Ratio` debe subir luego de los primeros requests.
- `Supabase Latency p95 by Service` no deberia crecer linealmente con RPS si el cache esta funcionando.
- En Loki, buscar errores con `{app="sumate-ya-backend"} | json | level =~ "error|fatal|warn"`.

Si el hit ratio no sube bajo carga, revisar llamadas a `cacheGetOrSet`. Si Supabase crece fuerte en read-heavy, revisar cache keys, TTL y posibles N+1/DataLoader.

