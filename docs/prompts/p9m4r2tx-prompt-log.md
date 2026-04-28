# Prompt Log

- Timestamp: 2026-04-27 19:25:00
- Task ID: p9m4r2tx

## User Prompt

> porque me dejaron de funcionar los tests de listado partido
>
> (follow-ups: "si" → run typecheck + tests; "arregla" → fix the root cause)

## Agent Main Actions

- Diagnosed cascading failure: backend crashed at import because `apps/backend/src/config/resend.ts` threw on missing `RESEND_API_KEY`/`RESEND_FROM_EMAIL`, killing `pnpm dev` and the SSR-driven login the matches-list E2E suite depends on; secondary issue was a stale Astro dev process holding `:4321`.
- Made Resend client degrade to `null` with a boot warning when env vars are missing, and updated `emailService.send()` to no-op gracefully (consistent with the existing non-blocking email policy in `authService.register`); killed the three orphaned `node.exe` PIDs (31052, 28936, 17876) on `:4321/:4322/:4000`.
- Verified the fix end-to-end: `turbo typecheck --force` passes, and `npx playwright test matches-list.spec.ts` now reports 8/8 green with `/login` POSTs returning 302 and `/partidos` returning 200.
