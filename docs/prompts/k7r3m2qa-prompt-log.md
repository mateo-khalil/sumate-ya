# Prompt Log

- Timestamp: 2026-04-15 12:00:00
- Task ID: k7r3m2qa

## User Prompt

> agega screenshot in fail to laywrgiht, and make sure that when running the test, before run the server npm run dev from root.

## Agent Main Actions

- Added `screenshot: 'only-on-failure'` to the shared `use` block in `apps/testing/playwright.config.ts` so failing tests capture a PNG into the HTML report.
- Configured a `webServer` entry that runs `npm run dev` with `cwd` resolved to the monorepo root and waits on `http://localhost:4321`, with `reuseExistingServer: !CI` and a 180s cold-start timeout.
- Added a Decision Context comment block documenting why screenshot-on-failure and the root-level webServer were chosen, and verified the change with `turbo typecheck --force` (passing).
