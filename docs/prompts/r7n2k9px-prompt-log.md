# Prompt Log

- Timestamp: 2026-05-05 19:45:00
- Task ID: r7n2k9px

## User Prompt

> [screenshot] localhost:4321/panel-club/horarios muestra "[GraphQL] Authentication required" con botón "Reintentar". REVISA YA QUE NO APARECE O EJECUTA LA ADMINISTRACION DE HORARIOS

## Agent Main Actions

- Diagnosticó que el proxy Astro `/api/graphql` (POST handler) no reenviaba el header `Authorization` al backend — lo descartaba silenciosamente. El urql client mandaba `Authorization: Bearer <token>` pero el proxy forwarded solo `Content-Type: application/json`, por lo que el Apollo server nunca veía el JWT y `extractUserFromToken` retornaba null → `requireAuth` lanzaba "Authentication required".
- Corrigió `apps/frontend/src/pages/api/graphql.ts`: el POST handler ahora lee `request.headers.get('authorization')` y lo incluye en los headers del fetch al backend. Actualizó el Decision Context del archivo documentando el bug histórico.
- Verificó con `turbo typecheck --force` → 3/3 exitosas, 0 errores.
