# Prompt Log

- Timestamp: 2026-05-23 13:55:00
- Task ID: f2r8v4zq

## User Prompt

> Necesito corregir 2 tests fallando en la suite de Playwright del proyecto sumate-ya.
> Los tests están en la rama test/detalle-torneo-35, archivo
> apps/testing/tests/35-detalle-torneo.spec.ts.
> El reporte muestra: All 28, Passed 26, Failed 2.
>
> Bug 1: test.use() llamado dentro de un test() en lugar de en el scope de describe.
> Bug 2: selector getByRole('link', { name: /iniciar sesion/i }) resuelve a 2 elementos
> (strict mode violation) porque la página muestra dos links de login para anónimos.

## Agent Main Actions

- Corrigió Bug 1 envolviendo el test problemático en un `test.describe('usuario autenticado', ...)`
  anidado con `test.use({ storageState })` en el scope del describe, siguiendo el patrón
  correcto de Playwright.
- Corrigió Bug 2 acotando el selector al `header` con
  `page.locator('header').getByRole('link', { name: /iniciar sesion/i })`, evitando el
  match con el `.detail-login-button` del cuerpo de la página, y agregó un TODO para
  que el equipo añada `data-testid="topbar-login-link"`.
- Verificó que no existan otros `test.use()` mal ubicados ni otros selectores ambiguos
  de "Iniciar Sesion" en el archivo; typecheck pasa limpio.
