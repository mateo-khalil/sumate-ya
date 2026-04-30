# Prompt Log

- Timestamp: 2026-04-27 18:36:59
- Task ID: k8m3p7qx

## User Prompt

> estoy teniendo este error, asegurate de agregar los puertos comunes al cors. Creo que es un error de cors:
> partidos:1 Access to fetch at 'http://localhost:4000/graphql?...&operationName=GetMatches&variables=%7B%22filters%22%3A%7B%22status%22%3A%22OPEN%22%7D%7D' from origin 'http://localhost:4322' has been blocked by CORS policy: Response to preflight request doesn't pass access control check: The 'Access-Control-Allow-Origin' header has a value 'http://localhost:4321' that is not equal to the supplied origin. Have the server send the header with a valid value.

## Agent Main Actions

- Replaced single-origin CORS config in `apps/backend/src/app.ts` with an allow-list that includes common Astro/Vite dev ports (4321–4324, 5173, 3000) plus 127.0.0.1 variants, and added `FRONTEND_URLS` env var for extra entries.
- Updated the decision context comment block to record why the allow-list is used and the prior single-origin bug it protects against.
- Ran `pnpm exec turbo typecheck --force` from the repo root — all 3 tasks succeeded (backend + frontend + manager) with no errors.
