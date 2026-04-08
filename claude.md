# Claude Project Rules

## Tech Stack

### Overview

Sumate Ya is a football player connection platform. Monorepo managed by **Turbo + pnpm**.

| Layer              | Technology                                             | Notes                                              |
| ------------------ | ------------------------------------------------------ | -------------------------------------------------- |
| **Frontend**       | Astro 6 + React 19                                     | Hybrid rendering (static by default, SSR opt-in)   |
| **UI Library**     | shadcn/ui + Tailwind CSS 4 + Radix UI                  | React-based components via Astro React integration |
| **Client State**   | nanostores + @nanostores/react                         | Lightweight, framework-agnostic, Astro-native      |
| **GraphQL Client** | urql                                                   | Lightweight, tree-shakeable, SSR-friendly          |
| **Backend**        | Express 5 + Apollo Server 5                            | Node.js >= 22.12, TypeScript, ESM                  |
| **API Protocol**   | GraphQL (player-facing) + REST (auth, admin, webhooks) | See `backend.md` for routing rules                 |
| **Database**       | Supabase (PostgreSQL)                                  | camelCase naming, quoted identifiers, RLS enforced |
| **Auth**           | Supabase Auth + JWT                                    | Profiles table extends auth.users                  |
| **Cache**          | Redis via ioredis                                      | Service-layer caching with `cacheGetOrSet()`       |
| **Validation**     | Zod                                                    | Schema validation on backend inputs                |
| **Testing**        | Vitest                                                 | Unit + integration tests                           |
| **Codegen**        | GraphQL CodeGen                                        | Auto-generates TS types from `.graphql` schemas    |

### Monorepo Structure

```
apps/
  frontend/    → Astro 6 + React + shadcn/ui (player-facing web app)
  backend/     → Express + Apollo Server + Supabase (API)
  manager/     → React + Vite + Apollo + Radix (organizer/admin dashboard)
packages/      → Shared code (types, utils, GraphQL fragments)
```

### Astro SSR Strategy (CRITICAL)

Use **hybrid rendering** (`output: 'hybrid'` in astro.config). Pages are **static by default** and opt into SSR only when needed.

**Use static (default) for:**

- Landing page, about, legal pages
- Public match/tournament listings (hydrate filters client-side)
- Any page where content is the same for all users

**Use SSR (`export const prerender = false`) only when:**

- The page requires auth-gated data that cannot be fetched client-side
- The page needs server-side redirects based on session state
- SEO requires personalized or real-time content in the initial HTML

**Hydration rules:**

- Use `client:load` for interactive components that must work immediately (nav, auth forms)
- Use `client:visible` for components below the fold (match cards, filters, maps)
- Use `client:idle` for non-critical interactivity (notifications badge, tooltips)
- **Never** use `client:load` on heavy components that are not above the fold
- Prefer Astro islands (`.astro` files) for static content — only use React components when interactivity is needed

### shadcn/ui Convention

- Components live in `apps/frontend/src/components/ui/`
- Install components via `npx shadcn@latest add <component>` from the frontend app directory
- All shadcn components are React — wrap them in Astro islands with appropriate `client:` directive
- Use the `cn()` utility from `@/lib/utils` for conditional class merging
- Follow shadcn's composition pattern: primitives in `ui/`, feature components compose them
- Theme tokens defined in `apps/frontend/src/styles/globals.css` using CSS custom properties

### GraphQL Communication

- **Backend** defines the schema in `apps/backend/src/graphql/schema/*.graphql`
- **Frontend** defines operations (queries/mutations) in `apps/frontend/src/graphql/operations/`
- After any `.graphql` change, run `pnpm codegen` from the repo root
- **urql** is the frontend GraphQL client — configured with SSR exchange for server-rendered pages and cache exchange for client-side
- For SSR pages, execute GraphQL queries server-side in Astro's frontmatter and pass data as props to React islands
- For static pages, fetch data at build time or hydrate client-side via urql

### Supabase Integration

- **Database**: PostgreSQL with camelCase naming and quoted identifiers
- **Auth**: Supabase Auth handles registration, login, password reset — `profiles` table extends `auth.users`
- **Storage**: Use Supabase Storage for profile photos and club images — always verify bucket exists before writing URLs
- **RLS**: All tables have RLS enabled — policies scoped to `auth.uid()` ownership chain
- **Client access**: Backend uses user-scoped Supabase clients for writes (see `backend.md` RLS pattern)
- **MCP**: All schema changes and migrations go through Supabase MCP tools (see Hard Rule below)

### Scalability Decisions

- **Redis caching**: All read-heavy paths use `cacheGetOrSet()` — match listings, tournament brackets, leaderboard
- **GraphQL DataLoader**: Batch queries to prevent N+1 in resolvers
- **Supabase egress control**: Explicit column selection only, no `select('*')` — see `backend.md`
- **Static-first frontend**: Astro pre-renders what it can, reducing server load
- **Connection pooling**: Supabase handles connection pooling via PgBouncer — no direct pg pool management needed
- **Code splitting**: Astro islands architecture naturally code-splits — each React component is an independent bundle

## Hard Rule: Prompt Tracking Log (Mandatory)

After finishing EVERY user task, the agent MUST create exactly one new markdown file inside `docs/prompts/`.

### Required behavior

1. Generate a random task ID (recommended: 8+ lowercase alphanumeric characters).
2. Check `docs/prompts/` to ensure the generated ID is not already used.
3. If there is a collision, generate a new random ID and retry.
4. Filename format MUST be: `docs/prompts/<random-id>-prompt-log.md`.
   - Examples: `a7f3k9q2-prompt-log.md`, `x4m1t8vb-prompt-log.md`.
5. Do not use sequential numbering.
6. The file content MUST include:
   - The user prompt, copied explicitly.
   - Exactly 3 bullet points summarizing what the agent mainly did.
   - A timestamp.
7. This rule is mandatory and must not be skipped.

### Required file template

```md
# Prompt Log

- Timestamp: YYYY-MM-DD HH:mm:ss
- Task ID: <random-id>

## User Prompt

> [Paste the exact user prompt here]

## Agent Main Actions

- [Main action 1]
- [Main action 2]
- [Main action 3]
```

### Enforcement

- The task is not complete until the corresponding prompt log file is created in `docs/prompts/`.

## Hard Rule: Notion Documentation Update (Mandatory)

After finishing any feature implementation or business logic change, the agent MUST update the Notion page `sumateya/docs`.

### Required behavior

1. Update `sumateya/docs` after implementation is complete and before considering the task fully done.
2. Include at minimum:
   - What changed (feature/logic summary)
   - Affected modules or areas
   - Any data/migration or operational notes
3. If Notion access is unavailable, request user authentication and continue once access is restored.

## Hard Rule: Database Operations via Supabase MCP (Mandatory)

All database operations MUST be executed through Supabase MCP tools.

### Required behavior

1. Use Supabase MCP for schema changes, migrations, SQL execution, data updates, and database diagnostics.
2. Do not perform direct DB operations through local scripts/CLI when Supabase MCP should be used.
3. If Supabase MCP access is missing or unauthenticated, stop DB-related work and ask the user to authenticate before continuing.

## Hard Rule: Decision Context Comment Blocks (Mandatory)

After implementing any feature or changing business logic, the agent MUST add or update a decision context comment block in the changed code.

### Required behavior

1. Add one structured comment block near the main logic change (or update the existing one if present).
2. The block MUST explain:
   - Why this implementation approach was chosen
   - Full context and constraints considered
   - Previously fixed bugs/regressions this code is protecting against
   - Key assumptions and operational caveats
3. Keep comments concrete and maintainable (specific, concise, and tied to real logic decisions).
4. If there are no relevant historical bugs, explicitly write: `Previously fixed bugs: none relevant.`
5. When future edits alter the rationale or constraints, update the same block instead of duplicating comments.

### Why this helps the agent

- Preserves decision history directly in the code to reduce context loss between tasks.
- Prevents regression loops by keeping prior bug context visible at the point of change.
- Improves future debugging and reviews because tradeoffs and constraints are documented where they matter.
