# Prompt Log

- Timestamp: 2026-04-14 19:30:00
- Task ID: n2q8v5xk

## User Prompt

> en el frontend no exponemos credenciales de la base ?

## Agent Main Actions

- Auditó las variables de entorno del frontend y confirmó que `PUBLIC_SUPABASE_URL` y `PUBLIC_SUPABASE_ANON_KEY` existían en `apps/frontend/.env` pero nunca eran leídas por ningún archivo fuente.
- Eliminó las variables `PUBLIC_SUPABASE_*` del `apps/frontend/.env` para evitar exposición innecesaria al cliente (Astro inyecta PREFIX `PUBLIC_` en el bundle del cliente).
- Confirmó que la service role key (peligrosa) solo reside en `apps/backend/.env` y el flujo de auth nunca expone credenciales al cliente.
