# Prompt Log

- Timestamp: 2026-05-03 20:29:10
- Task ID: k7m3p9q2

## User Prompt

> arregla estos tests y averigua por que quedó colgado por 5 minutos, (continua) el test 91/91.
> Running 91 tests using 8 workers
>
> 1) [chrome] tests/matches-map.spec.ts:203:7 — strict mode violation: getByRole('button', { name: /mapa/i }) resolved to 2 elements (toggle "Mapa" + card aria-label "Ver detalle del partido F5 sin mapa").
> 2) [chrome] tests/matches-list.spec.ts:202:7 — strict mode violation: getByRole('button', { name: /Ver detalle/i }) resolved to 2 elements (card role=button + boton "Ver detalle").
> 3) [chrome] tests/match-detail.spec.ts:312:7 — Sumarme al equipo A: expect.poll(payloads.length).toBe(1) timed out (received 0).
> [91/91] tests/match-detail.spec.ts:383 — "muestra error inline si falla la salida del partido" hung for 5 minutes.

## Agent Main Actions

- Arreglé strict-mode violations en matches-map.spec.ts (helpers `switchToMap` y `gotoMatchesPage` ahora usan `name: 'Mapa'/'Lista', exact: true`) y en matches-list.spec.ts (CTA "Ver detalle" buscado con exact match para no matchear el aria-label de la card).
- Agregué helper `waitForIslandsHydrated` en match-detail.spec.ts que espera a que todas las `<astro-island>` pierdan los atributos `ssr`/`await-children` antes de hacer click. Esto fija el test "Sumarme por equipo" cuyo click caia sobre un boton aun no hidratado por `client:load`, y previene el mismo bug en el flujo de LeaveMatch.
- Bajé `workers` de 8 a 4 en playwright.config.ts (el comentario ya indicaba 4 como valor correcto pero el codigo usaba 8). El hang de 5 min en el test 91/91 era la combinacion de saturacion del dev server con 8 workers + bug #27048 al guardar video del fallo del test 3 (que en `serial mode` cascadea); typecheck pasa.
