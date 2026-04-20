# Prompt Log

- Timestamp: 2026-04-20 18:37:00
- Task ID: p7w2k9xc

## User Prompt

> Fijate el drecotrio del test report y corrije los tests que fallaron, ya que el sistema en teoria anda bien.
> apps\testing\playwright-report

## Agent Main Actions

- Diagnosed Playwright failures in `apps/testing/tests/matches-list.spec.ts`: `page.route('http://localhost:4000/graphql', ...)` never intercepted because urql sends queries as **GET** with `operationName`/`query`/`variables` in the querystring (not POST JSON), so every mock fell through to the real backend. Added a `/\/graphql(?:\?|$)/` regex route and an `isGetMatchesRequest()` helper that reads URL searchParams first, body second.
- Scoped `page.locator('select')` to `main select` to ignore the Astro dev toolbar `<select>` that inflated the count from 3 → 4.
- Added hydration-wait (`expect('No hay partidos disponibles').toBeVisible()`) before clicking/filling filter controls in the "Más filtros" and "Limpiar" tests so interactions don't fire before React attaches handlers. Verified with `npx playwright test` → 9 passed, and `turbo typecheck --force` → 2 successful.
