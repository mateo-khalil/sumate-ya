# Prompt Log

- Timestamp: 2026-05-19 17:00:00
- Task ID: x9k4n7tm

## User Prompt

> [Tras detectar visualmente en /panel-club/horarios que precio y nombre de cancha se superponen en cada celda] quiero que en una nueva branch resuelvas el bug y ademas agreges testing

## Agent Main Actions

- Creé la branch `fix/horarios-calendar-overlap` desde main actualizado y arreglé el bug en `apps/frontend/src/components/club/SlotCalendarView.tsx`: moví `.slot-price` del `bottom-left` (donde colisionaba con el `.cal-court-label` agregado por el refactor de CalendarGrid) al `top-left`, bajé el font-size a 0.62rem y le puse color verde `hsl(142 70% 55%)` para alinear con `.pk-price` del calendario de "Crear Partido" (AvailableSlotsPicker), y agregué la condición `status !== 'match'` al render para que un slot ocupado no muestre precio. Actualicé el bloque "Previously fixed bugs" del Decision Context del componente.
- Vía el agente `tester` agregué `apps/testing/tests/horarios-calendar-overlap.spec.ts` con 2 casos contra seed real (la página es SSR, no se puede mockear con `page.route`): (1) buscar una celda con `.slot-price` + `.cal-court-label` visibles y asertar AABB-no-intersection + precio en la mitad superior; (2) verificar que celdas con status match no renderizan precio. Sin Page Object nuevo — selectores crudos justificados en el Decision Context por el tamaño pequeño del spec.
- Verificado por mí: typecheck verde (3/3 tasks); spec `horarios-calendar-overlap.spec.ts` con 4 passed + 1 skipped (el caso 2 quedó skipped porque el backend `myClubSlots` hardcodea `hasScheduledMatch: false` en `clubSlotManagementService.ts:137` y nunca lo enriquece — gap previo, no introducido por este fix; el render condicional queda como defensive code listo para cuando se cierre ese gap del backend).
