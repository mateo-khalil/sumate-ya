# E2E Testing Rules (apps/testing)

These rules govern every e2e spec and supporting helper under
`apps/testing/tests/**`. The goal is keeping spec bodies short, declarative,
and focused on behaviour — every shared helper, locator, or login flow lives
in `apps/testing/tests/support/`, never duplicated in specs.

Read this file BEFORE adding or refactoring an e2e spec.

## Required structure

```
apps/testing/tests/
  support/
    constants.ts                — URLs, GraphQL routes, cookie names, seed match IDs
    users.ts                    — TEST_USERS map (email/password/storageStatePath)
    auth.ts                     — loginViaForm, readAccessToken, loginAndReadToken
    graphql.ts                  — gqlPost(OrThrow), mockGraphQLAll, mockGraphQLOperation, NETWORK_ERROR
    network.ts                  — mockLeafletAssets, mockJsonRoute, TRANSPARENT_PNG
    builders.ts                 — buildMatch, buildMockSlot, MockMatch / MockSlot types
    fixtures.ts                 — extends test with one fixture per Page Object
    page-objects/<Surface>Page.ts — one PO per page (Login, Profile, MatchDetail, …)
    index.ts                    — barrel export consumed by every spec
  auth.setup.ts                 — Playwright setup project that warms storage states
  <flow>.spec.ts                — actual specs
```

## Hard rules

1. **Import from the barrel.** Specs MUST import `test`, `expect`, helpers,
   constants, and Page Objects from `./support` (the barrel). Importing from
   `@playwright/test` directly inside a spec is only allowed for *types*
   (`type Page`, `type Route`, `type APIRequestContext`) when the helper layer
   doesn't already expose them.

2. **Page Objects own selectors.** Specs MUST NOT contain raw selectors for
   pages that have a Page Object. If a selector is missing from the PO, add it
   there. PO fields hold `Locator` instances; methods perform user-visible
   actions or expose composite waits (`waitForIslandsHydrated`, `expectListSettled`).

3. **No duplicated helpers.** If two specs need the same helper, move it to
   `support/`. Things like `login()`, `readAccessToken()`, `gqlPost()`,
   `buildMatch()`, `mockGraphQLOperation()`, `waitForIslandsHydrated()` live
   in support — never copy them into specs.

4. **Authentication uses storage state, not per-test logins.** Specs that need
   a logged-in browser MUST set `test.use({ storageState:
   TEST_USERS.<role>.storageStatePath })` at the top of the file (or inside a
   nested `describe.use`). The setup project (`tests/auth.setup.ts`) writes
   those files once per run. The only exception: `login.spec.ts` exercises the
   form itself and intentionally skips the saved state.

5. **For tests that mix anonymous and authenticated cases**, prefer creating a
   fresh `browser.newContext()` for the anonymous case and leave the spec's
   `test.use({ storageState })` for the rest. Don't write a per-test
   `loginPage.loginAs(...)` call when storage state could do the work.

6. **Mock at the right boundary.**
   - SSR pages: the initial GraphQL fetch happens server-side and CANNOT be
     intercepted with `page.route`. Either let it hit the real backend (with
     `test.skip` for missing fixtures) or hit the backend yourself via
     `gqlPostOrThrow` for setup.
   - Browser-issued queries (urql client, React island fetch): use
     `mockGraphQLAll(page, route, body)` for one-shot mocks of the entire
     route, or `mockGraphQLOperation(page, route, marker, body)` to pass
     other operations through unchanged.
   - Use `GRAPHQL_PROXY_ROUTE` for /api/graphql, `BACKEND_GRAPHQL_ROUTE` for
     /graphql, and `GRAPHQL_ANY_ROUTE` (regex) when you don't care which path
     the client takes. Never inline glob/regex strings in specs.

7. **Reuse data builders.** `buildMatch()` / `buildMockSlot()` are the
   canonical mock factories. Spread overrides for the fields under test, do
   not re-declare a competing factory in a spec.

8. **Decision Context blocks.** Every PO file and every spec MUST keep a
   leading `Decision Context` comment block explaining mocking strategy,
   hydration waits, previously-fixed bugs, and assumptions. Update the block
   when behaviour changes — never let it go stale. (This is a project-wide
   rule restated here.)

9. **Match IDs with seed expectations.** If you depend on a seeded match,
   reference it through `SEED_MATCHES.full` / `SEED_MATCHES.open` (in
   `support/constants.ts`). Never hard-code the UUID inside a spec — that's
   how seed/spec drift starts.

10. **Pre-completion checks** (project rules):
    - Run `turbo typecheck --force` from the repo root after editing any
      spec or support file. The task is not complete until it passes.
    - Run a narrow e2e covering the touched flow before declaring done.

## Adding a new flow — checklist

1. Identify the page(s) under test. If a Page Object exists, extend it; if
   not, add one under `support/page-objects/`.
2. Export the new PO from `support/index.ts` and the matching fixture from
   `support/fixtures.ts`.
3. Decide the auth posture: anonymous, `playerMateo`, `playerRicardo`, or
   `clubAdmin`. If a new role is needed, extend `TEST_USERS` and
   `auth.setup.ts`.
4. Write the spec using only barrel imports + PO fixtures. Spec bodies should
   read like a description of the behaviour.
5. Add a Decision Context comment at the top of the spec with the rationale
   for the mocking choice and any seed/account assumptions.
6. Run `pnpm exec turbo typecheck --force` from the repo root.
7. Run the new spec via `pnpm test --grep <pattern>` to confirm the flow
   passes.

## Naming and style

- One Page Object per page (or per cohesive surface, e.g. profile card +
  avatar modal share `ProfilePage`). PO methods are imperatives that read like
  user actions: `selectFirstClubAndContinue`, `openLeaveDialog`,
  `chooseValidPng`.
- Prefer locators by accessible role/label/title. CSS selectors are a last
  resort and must be commented when used.
- Test titles describe behaviour, not implementation. They stay in Spanish to
  match the existing suite.
- Inside specs, avoid local `async function` helpers more than 5 lines long —
  if it's reusable, lift it to `support/`.
