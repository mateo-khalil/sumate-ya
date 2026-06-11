# Despliegue del backend en DigitalOcean

## Decision

El camino recomendado para produccion es DigitalOcean App Platform para `apps/backend` usando buildpack Node.js, mas Redis gestionado. App Platform resuelve HTTPS, health checks, reinicios automaticos y rollback por deployment.

Supabase sigue siendo la base de datos/auth/storage. Este despliegue solo publica el backend Express/Apollo que habla con Supabase y Redis.

## Build

El backend se buildea sin Docker desde el monorepo:

```powershell
pnpm install --frozen-lockfile
pnpm --filter @sumate-ya/backend build
```

Runtime:

```powershell
pnpm --filter @sumate-ya/backend start
```

## App Platform

El spec base esta en `.do/backend-app.yaml.example`. Usa `environment_slug: node-js`, `build_command` con pnpm y `run_command` apuntando al backend.

Antes de crear la app hay que completar:

- `github.repo` con el repo real.
- `FRONTEND_URL` y `FRONTEND_URLS` con los dominios reales del frontend.
- `SUPABASE_URL`, `PRIVATE_SUPABASE_SECRET_KEY`, `SUPABASE_ANON_KEY`.
- `JWT_SECRET`.
- `REDIS_URL` del Redis gestionado.
- `METRICS_BEARER_TOKEN` para proteger `/metrics`.

Crear o actualizar:

```powershell
doctl apps create --spec .do/backend-app.yaml.example
doctl apps update <app-id> --spec .do/backend-app.yaml.example
```

Health check:

- Path: `/health`
- Expected: `200 {"status":"ok"}`
- Initial delay: 30s

## Secrets

No versionar `.env`. Para App Platform, configurar secrets desde el spec o la UI de DigitalOcean.

Variables runtime principales:

```text
NODE_ENV=production
PORT=4000
FRONTEND_URL=https://app.example.com
FRONTEND_URLS=https://app.example.com,https://www.example.com
SUPABASE_URL=...
PRIVATE_SUPABASE_SECRET_KEY=...
SUPABASE_ANON_KEY=...
JWT_SECRET=...
REDIS_URL=rediss://...
METRICS_BEARER_TOKEN=...
LOG_LEVEL=info
```

## Dominio y HTTPS

En App Platform, agregar el dominio/subdominio de API, por ejemplo `api.example.com`, y dejar que DigitalOcean emita el certificado. Despues actualizar el frontend para apuntar a esa URL y revisar CORS con `FRONTEND_URLS`.

## Logs, metricas y reinicio

La API escribe logs JSON a stdout con campos como `service`, `env`, `event`, `requestId`, `req`, `res` y `durationMs`. DigitalOcean los muestra en runtime logs; Grafana Cloud los puede ingerir/parsear como JSON si se configura la integracion de logs del entorno.

Prometheus scrapea:

```text
GET /metrics
Authorization: Bearer <METRICS_BEARER_TOKEN>
```

App Platform reinicia el servicio si el proceso cae y usa `/health` para validar disponibilidad.

## Rollback

App Platform: usar la pantalla de deployments y redeploy del ultimo deployment sano. Si el nuevo build falla, revertir el commit o volver a ejecutar el deployment anterior desde DigitalOcean.
