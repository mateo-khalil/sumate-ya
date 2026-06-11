# Observabilidad backend con Grafana

## Arquitectura

El backend ahora expone metricas Prometheus en `/metrics` y logs estructurados JSON a stdout. Como el proyecto no usa Docker, el camino recomendado es Grafana Cloud gestionado:

- Grafana Cloud Metrics recibe/scrapea metricas Prometheus del backend.
- Grafana Cloud Logs/Loki recibe logs JSON del runtime de DigitalOcean.
- Grafana importa el dashboard JSON del repo.
- Grafana Alerting notifica al equipo.

## Metricas disponibles

HTTP:

- `http_requests_total{method,route,status_code}`
- `http_request_duration_seconds_bucket{method,route,status_code}`

GraphQL:

- `graphql_requests_total{operation_name,operation_type,status}`
- `graphql_request_duration_seconds_bucket{operation_name,operation_type,status}`

Redis:

- `redis_available`
- `redis_cache_requests_total{result,cache_prefix}`
- `redis_cache_operations_total{operation,status,cache_prefix}`

Supabase:

- `supabase_requests_total{client_scope,service,method,status_code,status}`
- `supabase_request_duration_seconds_bucket{client_scope,service,method,status_code,status}`

Node/process:

- Metricas default de `prom-client` para memoria, CPU, event loop y GC.

## Dashboard clave

El dashboard incluye:

- Salud de API: `up{job="sumate-backend"}`
- RPS total.
- Errores 4xx y 5xx.
- Latencia HTTP p50/p95/p99.
- Latencia GraphQL p95 por operacion.
- Redis cache hit ratio por prefijo.
- Latencia Supabase p95 por servicio.
- Logs de warnings/errors desde Loki.

## Alertas

Configurar en Grafana Alerting dos reglas:

- `Backend 5xx error rate above 5%`: dispara si 5xx supera 5% durante 5 minutos.
- `Backend p95 latency above 750ms`: dispara si p95 supera 750ms durante 10 minutos.

La notificacion del equipo se configura en Contact points, por ejemplo Slack:

```text
Webhook: https://hooks.slack.com/services/...
Channel: #alerts
```

## Grafana Cloud

Usar Grafana Cloud si el equipo prefiere gestionado:

1. Crear stack en Grafana Cloud.
2. Configurar Prometheus/Grafana Alloy para scrapear `https://api.example.com/metrics` con `METRICS_BEARER_TOKEN`.
3. Enviar logs JSON del runtime a Loki con Alloy o la integracion disponible para DigitalOcean.
4. Importar `ops/observability/grafana/dashboards/backend-overview.json`.
5. Crear alertas con las consultas de esta doc.

## Validacion con k6

Durante una corrida de k6, mirar especialmente:

- `graphql_request_duration_seconds` por `GetMatches`, `GetTournamentDetail`, `GetLeaderboard`, `JoinMatch`.
- `redis_cache_requests_total` para confirmar que los read-heavy elevan el hit ratio.
- `supabase_request_duration_seconds` para detectar egress o queries lentas.
- Logs Loki con `event="graphql_request_failed"` o `level="error"`.
