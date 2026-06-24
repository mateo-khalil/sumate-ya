# Prompt Log

- Timestamp: 2026-06-23 20:08:00
- Task ID: t5n8q3vr

## User Prompt

> cuando este creando un partido ademas de poner una descripcion opcional debe de haber una tarjeta para que el usuario ingrese un titulo al partido o que el titulo sea automático y que después el usuario lo pueda cambiar

## Agent Main Actions

- Aplicó migración DB vía Supabase MCP para agregar columna `title` (text, nullable) a la tabla `matches`; actualizó `create-match.graphql` con el campo `title: String` en `CreateMatchInput`, ejecutó codegen y propagó el cambio por todo el stack backend (`MATCH_COLUMNS`, `MATCH_DETAIL_COLUMNS`, `MATCH_HISTORY_COLUMNS`, `NEW_MATCH_COLUMNS`, interfaces `MatchRow`, `MatchDetailRow`, `CompletedMatchRow`, `NewMatchRow`, `CreateMatchInput` del repositorio, y la llamada en `matchService.createMatch`).
- Actualizó `matchService.ts` para usar `row.title ?? row.description ?? 'Partido sin título'` en los tres puntos de mapeo (lista, detalle, historial), manteniendo retrocompatibilidad con partidos anteriores que solo tienen `description`.
- Rediseñó `SummaryStep.tsx` con un campo de título auto-generado (formato "Partido 5v5 · Club X · sáb 28 jun"), editable, con validación de longitud (máx 80 chars); la descripción queda como campo opcional separado; se agregaron overrides `html.light` en `globals.css` para ambos campos y la summary-card; typecheck pasa con 0 errores.
