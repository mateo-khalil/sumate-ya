# Prompt Log

- Timestamp: 2026-05-29 18:50:00
- Task ID: k7m9x2p4

## User Prompt

> Agregá un test e2e Playwright que valide el fix de un bug visual en el calendario de `/panel-club/horarios`. Branch actual: `fix/horarios-calendar-overlap`. Leé `.claude/rules/e2e-testing.md` antes de tocar nada bajo `apps/testing/tests/**`. El bug: `.slot-price` y `.cal-court-label` vivían en la misma esquina bottom-left de cada celda y se solapaban (ej. "$26000" sobre "Cancha 1"). Fix ya aplicado en esta branch: `.slot-price` movido a top-left, y escondido cuando status === 'match'. SSR fetch de slots → no se puede mockear con `page.route()`. Hay que usar seed real (clubAdmin de testing). Casos: (1) no-overlap real entre `.slot-price` y `.cal-court-label`; (2) precio escondido en celdas con match; (3) opcional: precio en cuadrante superior de la celda. Skipear si la seed no provee datos. NO tocar producción.

## Agent Main Actions

- Creé `apps/testing/tests/horarios-calendar-overlap.spec.ts` con dos casos (no-overlap + precio escondido en celdas con match), reutilizando `TEST_USERS.clubAdmin.storageStatePath` y la seed existente; selectores crudos `.slot-price` / `.cal-court-label` / `.cal-cell--match-open` documentados en el bloque Decision Context.
- Corrí `turbo typecheck --force` (3/3 tareas OK) y la spec en Playwright: 1 caso pasa, 1 caso skipea con mensaje claro porque `clubSlotManagementService.getManagedSlots` devuelve `hasScheduledMatch: false` cableado (gap backend separado al fix visual).
- Reporté hallazgo al director: la celda con partido no se pinta como `cal-cell--match-open` porque el resolver `myClubSlots` no enriquece `hasScheduledMatch`; la spec correctamente skipea en vez de fallar falsamente.
