# Prompt Log

- Timestamp: 2026-05-04 12:00:00
- Task ID: g3k7n2pq

## User Prompt

> what can i use like apollo dev server or something to interacting with my grapql db etc and expriment. please set that up and give me the commands

## Agent Main Actions

- Inspected `apps/backend/src/graphql/server.ts` and `app.ts` to confirm Apollo Server 5 is already configured with introspection enabled in non-production, so the embedded Apollo Sandbox is served at `/graphql` with no extra setup.
- Provided startup commands (`pnpm --filter @sumate-ya/backend dev`) and the URL `http://localhost:4000/graphql` for the embedded Sandbox playground.
- Documented how to authenticate Sandbox requests with a `Authorization: Bearer <token>` header (token obtainable via `POST /api/auth/login`) and noted the cloud Apollo Studio alternative plus the CORS allow-list change required to use it.
