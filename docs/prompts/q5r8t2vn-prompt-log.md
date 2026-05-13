# q5r8t2vn - Listado de torneos disponibles

## Prompt

Implementar la user story de jugador para ver torneos disponibles en `/torneos`, basada en la epica de listado de partidos.

## Cambios

- Agregue la query GraphQL `tournaments` para torneos en `registration`.
- Sume `registeredTeamsCount` al contrato de torneo para mostrar progreso de inscripcion.
- Implemente repository, service con Redis e invalidacion al crear/registrar equipos, y resolver de query.
- Cree la pagina estatica `/torneos` con isla React `client:visible`.
- Cree `TournamentList` y `TournamentCard` con progreso `equipos registrados/total` y alta inline de equipo.

## Verificacion

- `pnpm.cmd --filter @sumate-ya/backend codegen`
- `pnpm.cmd --filter @sumate-ya/backend typecheck`
- `pnpm.cmd --filter @sumate-ya/frontend typecheck`
- `GET http://localhost:4321/torneos` devolvio 200.
- Query local `tournaments` devolvio torneos en `REGISTRATION` con `registeredTeamsCount`.
