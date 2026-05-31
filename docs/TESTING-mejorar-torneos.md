# Testing Manual — Mejorar Torneos (issue #132)

## Tipos de torneo (T1)

1. **Crear torneo Round Robin (liga)** — modo automático, 4 equipos, firstMatchday futura → fixture con 6 partidos en 3 jornadas
2. **Crear torneo Single Elimination** — 4 equipos → 3 partidos: 2 semifinales + 1 final
3. **Crear torneo Single Elimination** — 8 equipos → 7 partidos: 4 cuartos + 2 semifinales + 1 final
4. **Crear torneo Single Elimination** — 6 equipos (no potencia de 2) → byes asignados, bracket funcional
5. **Crear torneo Group Stage** — 2 grupos de 4 → 12 partidos de grupos + placeholders de eliminación
6. **Vista bracket** (single_elimination) — columnas por ronda, "Por definir" para matches sin equipos
7. **Vista GroupStandings** — tabla de posiciones, advancingPerGroup resaltado en verde
8. **Partidos de grupos** — agrupados por jornada con badge del grupo (A, B, etc.)

## Auto-scheduling (T2/T3)

9. **firstMatchday en el futuro** → aceptado y torneo creado
10. **firstMatchday en el pasado** → rechazado con mensaje de error claro
11. **Cadencia 7 días** → jornadas cada 7 días desde firstMatchday
12. **Cadencia 1 día** → torneo con partidos diarios
13. **Torneo single_day** → todas las jornadas el mismo día con horarios escalonados
14. **Preview del calendario** → muestra fechas antes de crear (sin escribir a DB)
15. **Validación jornada N+1 > jornada N** → cumplido por construcción en el service
16. **Multi_day sin cadenceDays** → error "cadenceDays es requerido para torneos de varios días"

## Invitaciones a equipos (T5)

17. **Organizador invita equipo** → invitación PENDING creada, capitán la ve en navbar bell
18. **Capitán acepta invitación** → equipo inscripto en el torneo, invitación ACCEPTED
19. **Capitán rechaza invitación** → status REJECTED
20. **Invitación expirada (7 días)** → no se puede aceptar: "La invitación expiró"
21. **Invitar equipo ya inscripto** → error "El equipo ya está inscripto en este torneo"
22. **Invitar equipo con invitación pending** → error "Ya existe una invitación pendiente"
23. **No-organizador intenta invitar** → error "Solo el organizador puede invitar equipos"
24. **Invitación en navbar bell** → badge con count, dropdown con Aceptar/Rechazar inline

## Fechas pasadas atenuadas (T4)

25. **Jornada pasada** → `.fixture-match--past`: opacity 0.55, grayscale, pointer-events none
26. **Jornada futura** → colores normales, interactuable
27. **Preview del calendario** → fechas pasadas con `.preview-day--past` y badge "Pasado"
28. **T4 en todos los tipos** → round_robin, single_elimination, group_stage_elimination respetan el estilo

## UI / Wizard

29. **Selector de tipo** → 3 cards visuales: Liga, Eliminación, Grupos+Eliminación
30. **Config de grupos visible** → solo aparece cuando tournamentType es GROUP_STAGE_ELIMINATION
31. **Toggle Modo automático / Modo clásico** → en /torneos/crear, ambos funcionan
32. **Wizard step navigation** → Anterior/Siguiente habilita según validez del paso
33. **Bracket responsive** → scroll horizontal en mobile sin romper layout
34. **GroupStandings responsive** → tabla con overflow-x en mobile

## Seguridad

35. **Solo capitán puede crear torneos** (F9) → gate screen para no-capitanes
36. **Solo organizador puede invitar equipos** → mutation rechaza si no es organizador
37. **Solo capitán del equipo puede aceptar invitación** → mutation rechaza si no es captainId
38. **Mutation sin auth** → "Autenticación requerida"
39. **tournamentType inválido** → Zod rechaza con mensaje

## Edge cases

40. **Backward compat torneos existentes** → todos tienen tournamentType='round_robin' por DEFAULT, fixture y vista funciona igual
41. **Auto-inscripción creador** → al crear el torneo, el equipo del capitán se inscribe automáticamente
42. **schedulePreview con 0 resultados** → devuelve [] sin error
43. **Bracket con equipos por definir** → "Por definir" se muestra correctamente
44. **fixtureMatches.isPast** → calculado en el service con `scheduledAt < now()`, field en GraphQL
