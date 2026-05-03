# Prompt Log

- Timestamp: 2026-05-03 18:10:00
- Task ID: 7kmqr5k027

## User Prompt

> modifica los tests de latittud y todo eso apra que funcionen correctamente.
> ademas fijate porque se fueron skippeados los tests y deskippealos. apps/testing/playwright-report

## Agent Main Actions

- Diagnosticada la causa de los skips: `apps/testing/tests/registro-club.spec.ts` y `login.spec.ts` tenían `test.skip(SKIP_BACKEND/SKIP_AUTH, ...)` controlados por env vars `SKIP_BACKEND_TESTS=1` y `SKIP_AUTH_TESTS=1`. Removidos por completo (`test.skip` y constantes); `playwright.config.ts` ya levanta `npm run dev` (turbo) antes de la suite, así que el backend siempre está disponible.
- Reescritos los tests de lat/lng/zona en `registro-club.spec.ts`: borrado el assertion de labels Zona/Latitud/Longitud y el test "marca latitud y longitud como opcionales"; reemplazados por un test que verifica que esos inputs (`#lat`, `#lng`, `#zone`) y el botón "Usar mi ubicación" ya no existen. Actualizadas direcciones (Montevideo) y teléfonos (+598) en los tests de submit con backend.
- Verificación: `pnpm exec turbo typecheck --force` pasa con 0 errores. Suite ejecutada con dev stack levantado: `registro-club` 12/12 ✓, `login` 13/14 ✓ (el único fallo —"sesión persiste tras refresh de la página"— es un test que estaba previamente skippeado y revela un issue independiente del SSR de login al re-visitar /login con cookie activa; fuera del alcance de esta tarea).
