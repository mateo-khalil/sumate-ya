# Prompt Log

- Timestamp: 2026-05-04 18:49:31
- Task ID: h2j8r5w4

## User Prompt

> ahora mismo en listar partidos, no hay opcion para ver los partidos historicos de un jugador o ver aprtidos antiguos, asegurate de agregar esa funcionalidad.
>
> Aclaración del usuario: si todos los partidos pasados poder mostrarlos, y tambien filtrar por los que yo me inscribí. Sería en esa pantalla (/partidos), decide el resto de la lógica vos.

## Agent Main Actions

- Backend: agregué `onlyMine: Boolean` al input `MatchFilters`, extendí el repo para hacer un lookup previo de los `matchIds` participados por el usuario y constreñir la query principal con `.in('id', ids)` (preservando `matchParticipants(count)` para slot counts correctos), y resolví `onlyMine` contra `ctx.user?.id` en el resolver e incorporé el user al cache key. Corrí codegen.
- Frontend: agregué la dimensión `timeframe` ('upcoming' | 'past') a `ClientMatchFilters`, mapeada a `status` server-side (OPEN/COMPLETED). Agregué un toggle "Próximos / Pasados" en `MatchesView` y un checkbox "Solo los míos" visible solo en Pasados + autenticado. Persistí ambos en URL. Arreglé `MatchList` y `MatchMap` para refetch cuando cambia el server-filter (timeframe/onlyMine), y actualicé el empty state para distinguir Pasados / Pasados+míos / Próximos.
- Validación: `pnpm exec turbo typecheck --force` pasó sin errores. E2e narrow (`matches-list.spec.ts` + `match-filters.spec.ts`) corrió en background con 18/18 tests verdes.
