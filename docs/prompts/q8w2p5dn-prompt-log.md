# Prompt Log

- Timestamp: 2026-04-15 12:45:00
- Task ID: q8w2p5dn

## User Prompt

> the login is not working, i get Ocurrió un error al iniciar sesión. Intentá de nuevo.
>  you must fix it.

## Agent Main Actions

- Traced the generic login error to `authService.getUserRole()` throwing "no rows": the user `mateoduran2010@gmail.com` was created in `auth.users` via Supabase Auth signup, but no trigger/handler ever inserted a matching row into `public.profiles`, so role lookup failed after a successful credential check.
- Refactored `apps/backend/src/services/authService.ts` to self-heal: `ensureProfileAndGetRole` now uses `.maybeSingle()` and, when no profile row exists, lazily inserts a default `player` profile with a sane `displayName` fallback chain (user_metadata.nombre → full_name → email local-part → 'Usuario'). Updated the Decision Context block to document the root cause and fallback rules.
- Backfilled the orphaned profile for `mateoduran2010@gmail.com` via Supabase MCP (`INSERT ... ON CONFLICT DO NOTHING`) and ran `turbo typecheck --force` (passing).
