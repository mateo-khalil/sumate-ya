# Prompt Log

- Timestamp: 2026-06-22 01:14:25
- Task ID: n7k3p9wq

## User Prompt

> las notificaciones aparecen como proximamente: asegurate de implementar lo que falte para esta funcionalidad y que hayan notificaciones, habilitar esto etc [captura de la pantalla de Ajustes con la pestaña "Notificaciones — Próximamente" deshabilitada]
>
> (Decisiones elegidas al consultar: pestaña Ajustes = Preferencias con toggles; generación = Hooks en eventos reales.)

## Agent Main Actions

- Backend: agregué políticas RLS a la tabla `notifications` y creé la tabla `notificationPreferences` (vía Supabase MCP), más el stack completo de GraphQL — `notifications.graphql`, `notificationRepository.ts`, `notificationService.ts` (con `notify()` que respeta preferencias), `domains/notification.ts`, registro en `resolvers/index.ts`, prefijos de cache en `redis.ts` y codegen.
- Backend: enganché un evento real — `matchService.joinMatch` ahora notifica al organizador ("se sumó un jugador") de forma best-effort y respetando las preferencias del destinatario.
- Frontend: cablee la campana (`DynamicNavActions`) para mostrar las notificaciones reales del sistema (marcar leídas, marcar todas, eliminar, deep-link a `/partidos/:id`) junto a las invitaciones, y habilité la pestaña "Notificaciones" en `ajustes.astro` y `panel-club/configuracion.astro` con un nuevo `NotificationPreferencesForm` (fetch SSR de preferencias). Typecheck OK en los 3 paquetes; e2e de la página de ajustes (`privacy-settings.spec.ts`) en verde.
