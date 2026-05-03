# Prompt Log

- Timestamp: 2026-05-03 20:16:43
- Task ID: k7n3p9wb

## User Prompt

> asegurate de que pueda ver detalle de partidos llenos 10/10 al menos clickearlos y ver quienes estan etc. [screenshot: PARTIDOS DISPONIBLES con "Partido E1 (seed E2E)" 10/10 jugadores y botón "Completo" deshabilitado]

## Agent Main Actions

- Hice todo el `MatchCard` (apps/frontend/src/components/matches/MatchCard.tsx) clickeable con `role="button"`, `tabIndex` y manejo de teclado (Enter/Space) que navega a `/partidos/:id`, así un partido lleno 10/10 puede abrirse desde el listado para ver el roster.
- Reemplacé el botón inferior "Completo" deshabilitado por un CTA "Ver detalle" (variant `secondary`) habilitado para todos los estados no-joinable (FULL, COMPLETED, CANCELLED, IN_PROGRESS); el badge superior sigue mostrando el estado, así que el botón pasa a ser una acción real en vez de un cartel inservible. Añadí `stopPropagation` al click del botón para evitar doble navegación.
- Actualicé el e2e existente en `apps/testing/tests/matches-list.spec.ts` (caso "partido lleno") para validar el badge "Completo", el CTA "Ver detalle" habilitado, la navegación al detalle por click del botón y agregué un caso nuevo que verifica que clickear el card también navega; ejecuté `pnpm exec turbo typecheck --force` (3 tareas OK, 0 errores).
