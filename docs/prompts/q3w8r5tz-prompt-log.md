# Prompt Log

- Timestamp: 2026-06-05 12:10:00
- Task ID: q3w8r5tz

## User Prompt

> Tenés que implementar la funcionalidad de auto cancelar partidos que no llegaron a la totalidad de jugadores una hora antes de comenzar el partido.
> Si falta el 10% de jugadores, dar plazo de media hora antes de comenzar el partido.
> Si no llega al total, auto cancelar, sin embargo debería aparecer en alguna parte los partidos cancelados como estos, pero ocultos etc.
>
> Aclaraciones: scheduler = worker node-cron en backend; mostrar cancelados con toggle en lista pública + panel del club; privacidad: cada usuario solo ve sus propios cancelados; 10% sobre capacidad total redondeado hacia arriba; además enviar notificaciones de "faltan jugadores" a 4h/3h/2h del inicio.

## Agent Main Actions

- Backend: creé la tabla `matchReminders` (vía Supabase MCP) y el worker node-cron (`matchScheduler.ts`) con `matchAutoCancelService.ts` (reglas: umbral=ceil(10% cap), cancelar a T-60 si falta >umbral, prórroga a T-30, y recordatorios 4h/3h/2h idempotentes) + `matchAutoCancelRepository.ts`, reutilizando los helpers de cancelación/notificación existentes e invalidación de cache.
- Privacidad + frontend: scoping de `status=CANCELLED` a `participantUserId=userId` en `matchService.toFilterOptions`; toggle "Mostrar cancelados" (autenticado, opt-in) en `MatchesView`/`MatchList` (segunda query CANCELLED mergeada) con cards atenuadas/tachadas en `MatchCard`; el panel del club ya soportaba el estado `cancelled`.
- Verificación: `turbo typecheck --force` (0 errores en 3 paquetes), 24 unit tests nuevos + e2e de regresión (21) y nuevo spec del toggle de cancelados, todos en verde. (Nota: `matchResultVoteService.test.ts` falla por WIP no relacionado preexistente en el árbol, ajeno a este cambio.)
