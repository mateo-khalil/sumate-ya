# Prompt Log

- Timestamp: 2026-05-03 19:47:59
- Task ID: k7m2x9p4

## User Prompt

> estoy iendo muchos errores en mi app de ftubol, por ejemplo este partido cuadno entro está 10/10 cuando entro pero por afuera ride 0/10. [screenshots adjuntos: detalle del partido marcando 10/10 con estado "Abierto", y listado de partidos donde el mismo partido se ve "0/10 jugadores"]
>
> además es un parido viejo, si lo vas a mostrarlo asegurate de mostrarlo como finalizado. en el listado de partidos prioriza aquellos activos.

## Agent Main Actions

- Backend `matchRepository.ts`: agregué la agregación de relación `matchParticipants(count)` a todas las queries de listado y al `getMatchById`, y extendí el tipo `MatchWithClub` con el array opcional `[{ count }]` que devuelve PostgREST.
- Backend `matchService.ts`: el mapper `toMatch` ahora calcula `availableSlots = capacity − participantCount` (lee `row.matchParticipants?.[0]?.count`); agregué un helper `effectiveStatus()` que convierte filas DB `open`/`full` con `scheduledAt < now` en `COMPLETED` para listado y detalle, ajusté `canJoin` para usarlo, y `listMatches` ordena ahora activos (futuros + OPEN/FULL) primero ascendente y pasados al final descendente.
- Frontend `MatchCard.tsx`: el card lee `match.status` (no solo `availableSlots === 0`), muestra un badge de estado para FULL/COMPLETED/IN_PROGRESS/CANCELLED y usa el label correcto en el botón ("Finalizado", "Cancelado", "En curso"); el botón "Sumarme" sólo se habilita cuando el estado es OPEN y hay cupos. Typecheck pasa (`pnpm turbo typecheck --force`).
