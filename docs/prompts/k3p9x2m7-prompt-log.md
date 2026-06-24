# Prompt Log

- Timestamp: 2026-06-22 00:00:00
- Task ID: k3p9x2m7

## User Prompt

> aplica estas mejoras en el portal aparece un scrollbar acá[Image #1] agregá miniaturas de las fotos de perfil o fallback si no tiene un poco en la entrada asi veo asomenso caunto tienen[Image #2] aplicá modo luz en esta pantalla [Image #3] que esté mejor ordenado los botones y toggles en esta pestaña, toggle mas visual para msotrar cancelados, que sea correcot el modo luz de proximos /pasados y mas ordenada la tab de filtros, agregar iconoes, dropdowns persunalizados etv [Image #4]
>
> (Imágenes: 1 = detalle de equipo / tab Miembros; 2 = lista Mis Equipos; 3 = Ranking Mejores Jugadores; 4 = Partidos & Torneos)

## Agent Main Actions

- Oculté la scrollbar nativa de la tab-bar del detalle de equipo (TeamDashboard) y agregué un stack de miniaturas de miembros (foto o inicial, hasta 4 + "+N") en las tarjetas de /equipos.
- Apliqué modo luz al ranking (LeaderboardTable) y a los toggles Próximos/Pasados, Lista/Mapa y tabs Partidos/Torneos vía overrides `html.light` en globals.css.
- Reorganicé la barra de toggles de /partidos: agrupé los toggles a la derecha con divisor, convertí "Mostrar cancelados"/"Solo los míos" en switches visuales (sigue siendo `<input checkbox>` real para a11y y e2e), y agregué íconos lucide a los selects Formato/Zona/Horario manteniéndolos como `<select>` nativos.
