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

## Hard Rule: Frontend Rules First (Mandatory)

Before working on any file under `apps/frontend/**`, always read `.claude/rules/frontend.md` first.

## Hard Rule: Backend Rules First (Mandatory)

Before working on any file under `apps/backend/**`, always read `.claude/rules/backend.md` first.
When backend work touches GraphQL schema/resolvers/contracts, also read `.claude/rules/graphql.md`.

### Required behavior

1. Treat `.claude/rules/backend.md` as the source of truth for backend architecture and coding constraints.
2. Follow its required folder structure, import rules, RLS/client patterns, and caching constraints on every backend task.
3. Apply `.claude/rules/graphql.md` for backend GraphQL work and run codegen after `.graphql` edits.
4. If a backend task needs an exception, update the rule file first (or ask for confirmation) before implementing code changes.

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

<!-- autoskills:start -->

Summary generated by `autoskills`. Check the full files inside `.claude/skills`.

## Accessibility (a11y)

Audit and improve web accessibility following WCAG 2.2 guidelines. Use when asked to "improve accessibility", "a11y audit", "WCAG compliance", "screen reader support", "keyboard navigation", or "make accessible".

- `.claude/skills/accessibility/SKILL.md`
- `.claude/skills/accessibility/references/A11Y-PATTERNS.md`: Practical, copy-paste-ready patterns for common accessibility requirements. Each pattern is self-contained and linked from the main [SKILL.md](../SKILL.md).
- `.claude/skills/accessibility/references/WCAG.md`

## API Endpoint Creation

Add new backend API endpoints with service + schema + resolver/controller + repository + caching layers for Node.js backends. Covers GraphQL and REST patterns, error handling, and egress prevention.

- `.claude/skills/api-endpoint/SKILL.md`

## Astro Usage Guide

Skill for building with the Astro web framework. Helps create Astro components and pages, configure SSR adapters, set up content collections, deploy static sites, and manage project structure and CLI commands. Use when the user needs to work with Astro, mentions .astro files, asks about static si...

- `.claude/skills/astro/SKILL.md`

## Design Thinking

Create distinctive, production-grade frontend interfaces with high design quality. Use this skill when the user asks to build web components, pages, artifacts, posters, or applications (examples include websites, landing pages, dashboards, React components, HTML/CSS layouts, or when styling/beaut...

- `.claude/skills/frontend-design/SKILL.md`

## Node.js Backend Patterns

Build production-ready Node.js backend services with Express/Fastify, implementing middleware patterns, error handling, authentication, database integration, and API design best practices. Use when creating Node.js servers, REST APIs, GraphQL backends, or microservices architectures.

- `.claude/skills/nodejs-backend-patterns/SKILL.md`
- `.claude/skills/nodejs-backend-patterns/references/advanced-patterns.md`: Advanced patterns for dependency injection, database integration, authentication, caching, and API response formatting.

## Node.js Best Practices

Node.js development principles and decision-making. Framework selection, async patterns, security, and architecture. Teaches thinking, not copying.

- `.claude/skills/nodejs-best-practices/SKILL.md`

## Node.js Express Server

>

- `.claude/skills/nodejs-express-server/SKILL.md`
- `.claude/skills/nodejs-express-server/references/authentication-with-jwt.md`
- `.claude/skills/nodejs-express-server/references/basic-express-setup.md`
- `.claude/skills/nodejs-express-server/references/database-integration-postgresql-with-sequelize.md`
- `.claude/skills/nodejs-express-server/references/environment-configuration.md`
- `.claude/skills/nodejs-express-server/references/error-handling-middleware.md`
- `.claude/skills/nodejs-express-server/references/middleware-chain-implementation.md`
- `.claude/skills/nodejs-express-server/references/restful-routes-with-crud-operations.md`

## SEO optimization

Optimize for search engine visibility and ranking. Use when asked to "improve SEO", "optimize for search", "fix meta tags", "add structured data", "sitemap optimization", or "search engine optimization".

- `.claude/skills/seo/SKILL.md`

## Supabase Postgres Best Practices

Postgres performance optimization and best practices from Supabase. Use this skill when writing, reviewing, or optimizing Postgres queries, schema designs, or database configurations.

- `.claude/skills/supabase-postgres-best-practices/SKILL.md`
- `.claude/skills/supabase-postgres-best-practices/references/_contributing.md`: This document provides guidelines for creating effective Postgres best practice references that work well with AI agents and LLMs.
- `.claude/skills/supabase-postgres-best-practices/references/_sections.md`: This file defines the rule categories for Postgres best practices. Rules are automatically assigned to sections based on their filename prefix.
- `.claude/skills/supabase-postgres-best-practices/references/_template.md`: [1-2 sentence explanation of the problem and why it matters. Focus on performance impact.]
- `.claude/skills/supabase-postgres-best-practices/references/advanced-full-text-search.md`: LIKE with wildcards can't use indexes. Full-text search with tsvector is orders of magnitude faster.
- `.claude/skills/supabase-postgres-best-practices/references/advanced-jsonb-indexing.md`: JSONB queries without indexes scan the entire table. Use GIN indexes for containment queries.
- `.claude/skills/supabase-postgres-best-practices/references/conn-idle-timeout.md`: Idle connections waste resources. Configure timeouts to automatically reclaim them.
- `.claude/skills/supabase-postgres-best-practices/references/conn-limits.md`: Too many connections exhaust memory and degrade performance. Set limits based on available resources.
- `.claude/skills/supabase-postgres-best-practices/references/conn-pooling.md`: Postgres connections are expensive (1-3MB RAM each). Without pooling, applications exhaust connections under load.
- `.claude/skills/supabase-postgres-best-practices/references/conn-prepared-statements.md`: Prepared statements are tied to individual database connections. In transaction-mode pooling, connections are shared, causing conflicts.
- `.claude/skills/supabase-postgres-best-practices/references/data-batch-inserts.md`: Individual INSERT statements have high overhead. Batch multiple rows in single statements or use COPY.
- `.claude/skills/supabase-postgres-best-practices/references/data-n-plus-one.md`: N+1 queries execute one query per item in a loop. Batch them into a single query using arrays or JOINs.
- `.claude/skills/supabase-postgres-best-practices/references/data-pagination.md`: OFFSET-based pagination scans all skipped rows, getting slower on deeper pages. Cursor pagination is O(1).
- `.claude/skills/supabase-postgres-best-practices/references/data-upsert.md`: Using separate SELECT-then-INSERT/UPDATE creates race conditions. Use INSERT ... ON CONFLICT for atomic upserts.
- `.claude/skills/supabase-postgres-best-practices/references/lock-advisory.md`: Advisory locks provide application-level coordination without requiring database rows to lock.
- `.claude/skills/supabase-postgres-best-practices/references/lock-deadlock-prevention.md`: Deadlocks occur when transactions lock resources in different orders. Always acquire locks in a consistent order.
- `.claude/skills/supabase-postgres-best-practices/references/lock-short-transactions.md`: Long-running transactions hold locks that block other queries. Keep transactions as short as possible.
- `.claude/skills/supabase-postgres-best-practices/references/lock-skip-locked.md`: When multiple workers process a queue, SKIP LOCKED allows workers to process different rows without waiting.
- `.claude/skills/supabase-postgres-best-practices/references/monitor-explain-analyze.md`: EXPLAIN ANALYZE executes the query and shows actual timings, revealing the true performance bottlenecks.
- `.claude/skills/supabase-postgres-best-practices/references/monitor-pg-stat-statements.md`: pg_stat_statements tracks execution statistics for all queries, helping identify slow and frequent queries.
- `.claude/skills/supabase-postgres-best-practices/references/monitor-vacuum-analyze.md`: Outdated statistics cause the query planner to make poor decisions. VACUUM reclaims space, ANALYZE updates statistics.
- `.claude/skills/supabase-postgres-best-practices/references/query-composite-indexes.md`: When queries filter on multiple columns, a composite index is more efficient than separate single-column indexes.
- `.claude/skills/supabase-postgres-best-practices/references/query-covering-indexes.md`: Covering indexes include all columns needed by a query, enabling index-only scans that skip the table entirely.
- `.claude/skills/supabase-postgres-best-practices/references/query-index-types.md`: Different index types excel at different query patterns. The default B-tree isn't always optimal.
- `.claude/skills/supabase-postgres-best-practices/references/query-missing-indexes.md`: Queries filtering or joining on unindexed columns cause full table scans, which become exponentially slower as tables grow.
- `.claude/skills/supabase-postgres-best-practices/references/query-partial-indexes.md`: Partial indexes only include rows matching a WHERE condition, making them smaller and faster when queries consistently filter on the same condition.
- `.claude/skills/supabase-postgres-best-practices/references/schema-constraints.md`: PostgreSQL does not support `ADD CONSTRAINT IF NOT EXISTS`. Migrations using this syntax will fail.
- `.claude/skills/supabase-postgres-best-practices/references/schema-data-types.md`: Using the right data types reduces storage, improves query performance, and prevents bugs.
- `.claude/skills/supabase-postgres-best-practices/references/schema-foreign-key-indexes.md`: Postgres does not automatically index foreign key columns. Missing indexes cause slow JOINs and CASCADE operations.
- `.claude/skills/supabase-postgres-best-practices/references/schema-lowercase-identifiers.md`: PostgreSQL folds unquoted identifiers to lowercase. Quoted mixed-case identifiers require quotes forever and cause issues with tools, ORMs, and AI assistants that may not recognize them.
- `.claude/skills/supabase-postgres-best-practices/references/schema-partitioning.md`: Partitioning splits a large table into smaller pieces, improving query performance and maintenance operations.
- `.claude/skills/supabase-postgres-best-practices/references/schema-primary-keys.md`: Primary key choice affects insert performance, index size, and replication efficiency.
- `.claude/skills/supabase-postgres-best-practices/references/security-privileges.md`: Grant only the minimum permissions required. Never use superuser for application queries.
- `.claude/skills/supabase-postgres-best-practices/references/security-rls-basics.md`: Row Level Security (RLS) enforces data access at the database level, ensuring users only see their own data.
- `.claude/skills/supabase-postgres-best-practices/references/security-rls-performance.md`: Poorly written RLS policies can cause severe performance issues. Use subqueries and indexes strategically.

## Tailwind CSS Development Patterns

Provides comprehensive Tailwind CSS utility-first styling patterns including responsive design, layout utilities, flexbox, grid, spacing, typography, colors, and modern CSS best practices. Use when styling React/Vue/Svelte components, building responsive layouts, implementing design systems, or o...

- `.claude/skills/tailwind-css-patterns/SKILL.md`
- `.claude/skills/tailwind-css-patterns/references/accessibility.md`
- `.claude/skills/tailwind-css-patterns/references/animations.md`: Usage:
- `.claude/skills/tailwind-css-patterns/references/component-patterns.md`
- `.claude/skills/tailwind-css-patterns/references/configuration.md`: Use the `@theme` directive for CSS-based configuration:
- `.claude/skills/tailwind-css-patterns/references/layout-patterns.md`: Basic flex container:
- `.claude/skills/tailwind-css-patterns/references/performance.md`: Configure content sources for optimal purging:
- `.claude/skills/tailwind-css-patterns/references/reference.md`: Tailwind CSS is a utility-first CSS framework that generates styles by scanning HTML, JavaScript, and template files for class names. It provides a comprehensive design system through CSS utility classes, enabling rapid UI development without writing custom CSS. The framework operates at build-ti...
- `.claude/skills/tailwind-css-patterns/references/responsive-design.md`: Enable dark mode in tailwind.config.js:

## Turborepo Skill

|

- `.claude/skills/turborepo/SKILL.md`
- `.claude/skills/turborepo/command/turborepo.md`: Load Turborepo skill for creating workflows, tasks, and pipelines in monorepos. Use when users ask to "create a workflow", "make a task", "generate a pipeline", or set up build orchestration.
- `.claude/skills/turborepo/references/best-practices/dependencies.md`: Best practices for managing dependencies in a Turborepo monorepo.
- `.claude/skills/turborepo/references/best-practices/packages.md`: How to create and structure internal packages in your monorepo.
- `.claude/skills/turborepo/references/best-practices/RULE.md`: Essential patterns for structuring and maintaining a healthy Turborepo monorepo.
- `.claude/skills/turborepo/references/best-practices/structure.md`: Detailed guidance on structuring a Turborepo monorepo.
- `.claude/skills/turborepo/references/boundaries/RULE.md`: **Experimental feature** - See [RFC](https://github.com/vercel/turborepo/discussions/9435)
- `.claude/skills/turborepo/references/caching/gotchas.md`: Generates a JSON file with all hash inputs. Compare two runs to find differences.
- `.claude/skills/turborepo/references/caching/remote-cache.md`: Share cache artifacts across your team and CI pipelines.
- `.claude/skills/turborepo/references/caching/RULE.md`: Turborepo's core principle: **never do the same work twice**.
- `.claude/skills/turborepo/references/ci/github-actions.md`: Complete setup guide for Turborepo with GitHub Actions.
- `.claude/skills/turborepo/references/ci/patterns.md`: Strategies for efficient CI/CD with Turborepo.
- `.claude/skills/turborepo/references/ci/RULE.md`: General principles for running Turborepo in continuous integration environments.
- `.claude/skills/turborepo/references/ci/vercel.md`: Turborepo integrates seamlessly with Vercel for monorepo deployments.
- `.claude/skills/turborepo/references/cli/commands.md`: Full docs: https://turborepo.dev/docs/reference/run
- `.claude/skills/turborepo/references/cli/RULE.md`: The primary command for executing tasks across your monorepo.
- `.claude/skills/turborepo/references/configuration/global-options.md`: Options that affect all tasks. Full docs: https://turborepo.dev/docs/reference/configuration
- `.claude/skills/turborepo/references/configuration/gotchas.md`: Common mistakes and how to fix them.
- `.claude/skills/turborepo/references/configuration/RULE.md`: Configuration reference for Turborepo. Full docs: https://turborepo.dev/docs/reference/configuration
- `.claude/skills/turborepo/references/configuration/tasks.md`: Full docs: https://turborepo.dev/docs/reference/configuration#tasks
- `.claude/skills/turborepo/references/environment/gotchas.md`: Common mistakes and how to fix them.
- `.claude/skills/turborepo/references/environment/modes.md`: Turborepo supports different modes for handling environment variables during task execution.
- `.claude/skills/turborepo/references/environment/RULE.md`: Turborepo provides fine-grained control over which environment variables affect task hashing and runtime availability.
- `.claude/skills/turborepo/references/filtering/patterns.md`: Practical examples for typical monorepo scenarios.
- `.claude/skills/turborepo/references/filtering/RULE.md`: **The primary way to run only changed packages is `--affected`:**
- `.claude/skills/turborepo/references/watch/RULE.md`: Full docs: https://turborepo.dev/docs/reference/watch

## TypeScript Advanced Types

Master TypeScript's advanced type system including generics, conditional types, mapped types, template literals, and utility types for building type-safe applications. Use when implementing complex type logic, creating reusable type utilities, or ensuring compile-time type safety in TypeScript pr...

- `.claude/skills/typescript-advanced-types/SKILL.md`

## React Composition Patterns

Composition patterns for building flexible, maintainable React components. Avoid boolean prop proliferation by using compound components, lifting state, and composing internals. These patterns make codebases easier for both humans and AI agents to work with as they scale.

- `.claude/skills/vercel-composition-patterns/SKILL.md`
- `.claude/skills/vercel-composition-patterns/AGENTS.md`: **Version 1.0.0** Engineering January 2026
- `.claude/skills/vercel-composition-patterns/README.md`: A structured repository for React composition patterns that scale. These patterns help avoid boolean prop proliferation by using compound components, lifting state, and composing internals.
- `.claude/skills/vercel-composition-patterns/rules/_sections.md`: This file defines all sections, their ordering, impact levels, and descriptions. The section ID (in parentheses) is the filename prefix used to group rules.
- `.claude/skills/vercel-composition-patterns/rules/_template.md`: Brief explanation of the rule and why it matters.
- `.claude/skills/vercel-composition-patterns/rules/architecture-avoid-boolean-props.md`: Don't add boolean props like `isThread`, `isEditing`, `isDMThread` to customize component behavior. Each boolean doubles possible states and creates unmaintainable conditional logic. Use composition instead.
- `.claude/skills/vercel-composition-patterns/rules/architecture-compound-components.md`: Structure complex components as compound components with a shared context. Each subcomponent accesses shared state via context, not props. Consumers compose the pieces they need.
- `.claude/skills/vercel-composition-patterns/rules/patterns-children-over-render-props.md`: Use `children` for composition instead of `renderX` props. Children are more readable, compose naturally, and don't require understanding callback signatures.
- `.claude/skills/vercel-composition-patterns/rules/patterns-explicit-variants.md`: Instead of one component with many boolean props, create explicit variant components. Each variant composes the pieces it needs. The code documents itself.
- `.claude/skills/vercel-composition-patterns/rules/react19-no-forwardref.md`: In React 19, `ref` is now a regular prop (no `forwardRef` wrapper needed), and `use()` replaces `useContext()`.
- `.claude/skills/vercel-composition-patterns/rules/state-context-interface.md`: Define a **generic interface** for your component context with three parts: can implement—enabling the same UI components to work with completely different state implementations.
- `.claude/skills/vercel-composition-patterns/rules/state-decouple-implementation.md`: The provider component should be the only place that knows how state is managed. UI components consume the context interface—they don't know if state comes from useState, Zustand, or a server sync.
- `.claude/skills/vercel-composition-patterns/rules/state-lift-state.md`: Move state management into dedicated provider components. This allows sibling components outside the main UI to access and modify state without prop drilling or awkward refs.

## Vercel React Best Practices

React and Next.js performance optimization guidelines from Vercel Engineering. This skill should be used when writing, reviewing, or refactoring React/Next.js code to ensure optimal performance patterns. Triggers on tasks involving React components, Next.js pages, data fetching, bundle optimizati...

- `.claude/skills/vercel-react-best-practices/SKILL.md`
- `.claude/skills/vercel-react-best-practices/AGENTS.md`: **Version 1.0.0** Vercel Engineering January 2026
- `.claude/skills/vercel-react-best-practices/README.md`: A structured repository for creating and maintaining React Best Practices optimized for agents and LLMs.
- `.claude/skills/vercel-react-best-practices/rules/_sections.md`: This file defines all sections, their ordering, impact levels, and descriptions. The section ID (in parentheses) is the filename prefix used to group rules.
- `.claude/skills/vercel-react-best-practices/rules/_template.md`: **Impact: MEDIUM (optional impact description)**
- `.claude/skills/vercel-react-best-practices/rules/advanced-effect-event-deps.md`: Effect Event functions do not have a stable identity. Their identity intentionally changes on every render. Do not include the function returned by `useEffectEvent` in a `useEffect` dependency array. Keep the actual reactive values as dependencies and call the Effect Event from inside the effect...
- `.claude/skills/vercel-react-best-practices/rules/advanced-event-handler-refs.md`: Store callbacks in refs when used in effects that shouldn't re-subscribe on callback changes.
- `.claude/skills/vercel-react-best-practices/rules/advanced-init-once.md`: Do not put app-wide initialization that must run once per app load inside `useEffect([])` of a component. Components can remount and effects will re-run. Use a module-level guard or top-level init in the entry module instead.
- `.claude/skills/vercel-react-best-practices/rules/advanced-use-latest.md`: Access latest values in callbacks without adding them to dependency arrays. Prevents effect re-runs while avoiding stale closures.
- `.claude/skills/vercel-react-best-practices/rules/async-api-routes.md`: In API routes and Server Actions, start independent operations immediately, even if you don't await them yet.
- `.claude/skills/vercel-react-best-practices/rules/async-cheap-condition-before-await.md`: When a branch uses `await` for a flag or remote value and also requires a **cheap synchronous** condition (local props, request metadata, already-loaded state), evaluate the cheap condition **first**. Otherwise you pay for the async call even when the compound condition can never be true.
- `.claude/skills/vercel-react-best-practices/rules/async-defer-await.md`: Move `await` operations into the branches where they're actually used to avoid blocking code paths that don't need them.
- `.claude/skills/vercel-react-best-practices/rules/async-dependencies.md`: For operations with partial dependencies, use `better-all` to maximize parallelism. It automatically starts each task at the earliest possible moment.
- `.claude/skills/vercel-react-best-practices/rules/async-parallel.md`: When async operations have no interdependencies, execute them concurrently using `Promise.all()`.
- `.claude/skills/vercel-react-best-practices/rules/async-suspense-boundaries.md`: Instead of awaiting data in async components before returning JSX, use Suspense boundaries to show the wrapper UI faster while data loads.
- `.claude/skills/vercel-react-best-practices/rules/bundle-barrel-imports.md`: Import directly from source files instead of barrel files to avoid loading thousands of unused modules. **Barrel files** are entry points that re-export multiple modules (e.g., `index.js` that does `export * from './module'`).
- `.claude/skills/vercel-react-best-practices/rules/bundle-conditional.md`: Load large data or modules only when a feature is activated.
- `.claude/skills/vercel-react-best-practices/rules/bundle-defer-third-party.md`: Analytics, logging, and error tracking don't block user interaction. Load them after hydration.
- `.claude/skills/vercel-react-best-practices/rules/bundle-dynamic-imports.md`: Use `next/dynamic` to lazy-load large components not needed on initial render.
- `.claude/skills/vercel-react-best-practices/rules/bundle-preload.md`: Preload heavy bundles before they're needed to reduce perceived latency.
- `.claude/skills/vercel-react-best-practices/rules/client-event-listeners.md`: Use `useSWRSubscription()` to share global event listeners across component instances.
- `.claude/skills/vercel-react-best-practices/rules/client-localstorage-schema.md`: Add version prefix to keys and store only needed fields. Prevents schema conflicts and accidental storage of sensitive data.
- `.claude/skills/vercel-react-best-practices/rules/client-passive-event-listeners.md`: Add `{ passive: true }` to touch and wheel event listeners to enable immediate scrolling. Browsers normally wait for listeners to finish to check if `preventDefault()` is called, causing scroll delay.
- `.claude/skills/vercel-react-best-practices/rules/client-swr-dedup.md`: SWR enables request deduplication, caching, and revalidation across component instances.
- `.claude/skills/vercel-react-best-practices/rules/js-batch-dom-css.md`: Avoid interleaving style writes with layout reads. When you read a layout property (like `offsetWidth`, `getBoundingClientRect()`, or `getComputedStyle()`) between style changes, the browser is forced to trigger a synchronous reflow.
- `.claude/skills/vercel-react-best-practices/rules/js-cache-function-results.md`: Use a module-level Map to cache function results when the same function is called repeatedly with the same inputs during render.
- `.claude/skills/vercel-react-best-practices/rules/js-cache-property-access.md`: Cache object property lookups in hot paths.
- `.claude/skills/vercel-react-best-practices/rules/js-cache-storage.md`: **Incorrect (reads storage on every call):**
- `.claude/skills/vercel-react-best-practices/rules/js-combine-iterations.md`: Multiple `.filter()` or `.map()` calls iterate the array multiple times. Combine into one loop.
- `.claude/skills/vercel-react-best-practices/rules/js-early-exit.md`: Return early when result is determined to skip unnecessary processing.
- `.claude/skills/vercel-react-best-practices/rules/js-flatmap-filter.md`: **Impact: LOW-MEDIUM (eliminates intermediate array)**
- `.claude/skills/vercel-react-best-practices/rules/js-hoist-regexp.md`: Don't create RegExp inside render. Hoist to module scope or memoize with `useMemo()`.
- `.claude/skills/vercel-react-best-practices/rules/js-index-maps.md`: Multiple `.find()` calls by the same key should use a Map.
- `.claude/skills/vercel-react-best-practices/rules/js-length-check-first.md`: When comparing arrays with expensive operations (sorting, deep equality, serialization), check lengths first. If lengths differ, the arrays cannot be equal.
- `.claude/skills/vercel-react-best-practices/rules/js-min-max-loop.md`: Finding the smallest or largest element only requires a single pass through the array. Sorting is wasteful and slower.
- `.claude/skills/vercel-react-best-practices/rules/js-request-idle-callback.md`: **Impact: MEDIUM (keeps UI responsive during background tasks)**
- `.claude/skills/vercel-react-best-practices/rules/js-set-map-lookups.md`: Convert arrays to Set/Map for repeated membership checks.
- `.claude/skills/vercel-react-best-practices/rules/js-tosorted-immutable.md`: **Incorrect (mutates original array):**
- `.claude/skills/vercel-react-best-practices/rules/rendering-activity.md`: Use React's `<Activity>` to preserve state/DOM for expensive components that frequently toggle visibility.
- `.claude/skills/vercel-react-best-practices/rules/rendering-animate-svg-wrapper.md`: Many browsers don't have hardware acceleration for CSS3 animations on SVG elements. Wrap SVG in a `<div>` and animate the wrapper instead.
- `.claude/skills/vercel-react-best-practices/rules/rendering-conditional-render.md`: Use explicit ternary operators (`? :`) instead of `&&` for conditional rendering when the condition can be `0`, `NaN`, or other falsy values that render.
- `.claude/skills/vercel-react-best-practices/rules/rendering-content-visibility.md`: Apply `content-visibility: auto` to defer off-screen rendering.
- `.claude/skills/vercel-react-best-practices/rules/rendering-hoist-jsx.md`: Extract static JSX outside components to avoid re-creation.
- `.claude/skills/vercel-react-best-practices/rules/rendering-hydration-no-flicker.md`: When rendering content that depends on client-side storage (localStorage, cookies), avoid both SSR breakage and post-hydration flickering by injecting a synchronous script that updates the DOM before React hydrates.
- `.claude/skills/vercel-react-best-practices/rules/rendering-hydration-suppress-warning.md`: In SSR frameworks (e.g., Next.js), some values are intentionally different on server vs client (random IDs, dates, locale/timezone formatting). For these *expected* mismatches, wrap the dynamic text in an element with `suppressHydrationWarning` to prevent noisy warnings. Do not use this to hide r...
- `.claude/skills/vercel-react-best-practices/rules/rendering-resource-hints.md`: **Impact: HIGH (reduces load time for critical resources)**
- `.claude/skills/vercel-react-best-practices/rules/rendering-script-defer-async.md`: **Impact: HIGH (eliminates render-blocking)**
- `.claude/skills/vercel-react-best-practices/rules/rendering-svg-precision.md`: Reduce SVG coordinate precision to decrease file size. The optimal precision depends on the viewBox size, but in general reducing precision should be considered.
- `.claude/skills/vercel-react-best-practices/rules/rendering-usetransition-loading.md`: Use `useTransition` instead of manual `useState` for loading states. This provides built-in `isPending` state and automatically manages transitions.
- `.claude/skills/vercel-react-best-practices/rules/rerender-defer-reads.md`: Don't subscribe to dynamic state (searchParams, localStorage) if you only read it inside callbacks.
- `.claude/skills/vercel-react-best-practices/rules/rerender-dependencies.md`: Specify primitive dependencies instead of objects to minimize effect re-runs.
- `.claude/skills/vercel-react-best-practices/rules/rerender-derived-state-no-effect.md`: If a value can be computed from current props/state, do not store it in state or update it in an effect. Derive it during render to avoid extra renders and state drift. Do not set state in effects solely in response to prop changes; prefer derived values or keyed resets instead.
- `.claude/skills/vercel-react-best-practices/rules/rerender-derived-state.md`: Subscribe to derived boolean state instead of continuous values to reduce re-render frequency.
- `.claude/skills/vercel-react-best-practices/rules/rerender-functional-setstate.md`: When updating state based on the current state value, use the functional update form of setState instead of directly referencing the state variable. This prevents stale closures, eliminates unnecessary dependencies, and creates stable callback references.
- `.claude/skills/vercel-react-best-practices/rules/rerender-lazy-state-init.md`: Pass a function to `useState` for expensive initial values. Without the function form, the initializer runs on every render even though the value is only used once.
- `.claude/skills/vercel-react-best-practices/rules/rerender-memo-with-default-value.md`: When memoized component has a default value for some non-primitive optional parameter, such as an array, function, or object, calling the component without that parameter results in broken memoization. This is because new value instances are created on every rerender, and they do not pass strict...
- `.claude/skills/vercel-react-best-practices/rules/rerender-memo.md`: Extract expensive work into memoized components to enable early returns before computation.
- `.claude/skills/vercel-react-best-practices/rules/rerender-move-effect-to-event.md`: If a side effect is triggered by a specific user action (submit, click, drag), run it in that event handler. Do not model the action as state + effect; it makes effects re-run on unrelated changes and can duplicate the action.
- `.claude/skills/vercel-react-best-practices/rules/rerender-no-inline-components.md`: **Impact: HIGH (prevents remount on every render)**
- `.claude/skills/vercel-react-best-practices/rules/rerender-simple-expression-in-memo.md`: When an expression is simple (few logical or arithmetical operators) and has a primitive result type (boolean, number, string), do not wrap it in `useMemo`. Calling `useMemo` and comparing hook dependencies may consume more resources than the expression itself.
- `.claude/skills/vercel-react-best-practices/rules/rerender-split-combined-hooks.md`: When a hook contains multiple independent tasks with different dependencies, split them into separate hooks. A combined hook reruns all tasks when any dependency changes, even if some tasks don't use the changed value.
- `.claude/skills/vercel-react-best-practices/rules/rerender-transitions.md`: Mark frequent, non-urgent state updates as transitions to maintain UI responsiveness.
- `.claude/skills/vercel-react-best-practices/rules/rerender-use-deferred-value.md`: When user input triggers expensive computations or renders, use `useDeferredValue` to keep the input responsive. The deferred value lags behind, allowing React to prioritize the input update and render the expensive result when idle.
- `.claude/skills/vercel-react-best-practices/rules/rerender-use-ref-transient-values.md`: When a value changes frequently and you don't want a re-render on every update (e.g., mouse trackers, intervals, transient flags), store it in `useRef` instead of `useState`. Keep component state for UI; use refs for temporary DOM-adjacent values. Updating a ref does not trigger a re-render.
- `.claude/skills/vercel-react-best-practices/rules/server-after-nonblocking.md`: Use Next.js's `after()` to schedule work that should execute after a response is sent. This prevents logging, analytics, and other side effects from blocking the response.
- `.claude/skills/vercel-react-best-practices/rules/server-auth-actions.md`: **Impact: CRITICAL (prevents unauthorized access to server mutations)**
- `.claude/skills/vercel-react-best-practices/rules/server-cache-lru.md`: **Implementation:**
- `.claude/skills/vercel-react-best-practices/rules/server-cache-react.md`: Use `React.cache()` for server-side request deduplication. Authentication and database queries benefit most.
- `.claude/skills/vercel-react-best-practices/rules/server-dedup-props.md`: **Impact: LOW (reduces network payload by avoiding duplicate serialization)**
- `.claude/skills/vercel-react-best-practices/rules/server-hoist-static-io.md`: **Impact: HIGH (avoids repeated file/network I/O per request)**
- `.claude/skills/vercel-react-best-practices/rules/server-no-shared-module-state.md`: For React Server Components and client components rendered during SSR, avoid using mutable module-level variables to share request-scoped data. Server renders can run concurrently in the same process. If one render writes to shared module state and another render reads it, you can get race condit...
- `.claude/skills/vercel-react-best-practices/rules/server-parallel-fetching.md`: React Server Components execute sequentially within a tree. Restructure with composition to parallelize data fetching.
- `.claude/skills/vercel-react-best-practices/rules/server-parallel-nested-fetching.md`: When fetching nested data in parallel, chain dependent fetches within each item's promise so a slow item doesn't block the rest.
- `.claude/skills/vercel-react-best-practices/rules/server-serialization.md`: The React Server/Client boundary serializes all object properties into strings and embeds them in the HTML response and subsequent RSC requests. This serialized data directly impacts page weight and load time, so **size matters a lot**. Only pass fields that the client actually uses.

## Core

Vitest fast unit testing framework powered by Vite with Jest-compatible API. Use when writing tests, mocking, configuring coverage, or working with test filtering and fixtures.

- `.claude/skills/vitest/SKILL.md`
- `.claude/skills/vitest/GENERATION.md`
- `.claude/skills/vitest/references/advanced-environments.md`: Configure environments like jsdom, happy-dom for browser APIs
- `.claude/skills/vitest/references/advanced-projects.md`: Multi-project configuration for monorepos and different test types
- `.claude/skills/vitest/references/advanced-type-testing.md`: Test TypeScript types with expectTypeOf and assertType
- `.claude/skills/vitest/references/advanced-vi.md`: vi helper for mocking, timers, utilities
- `.claude/skills/vitest/references/core-cli.md`: Command line interface commands and options
- `.claude/skills/vitest/references/core-config.md`: Configure Vitest with vite.config.ts or vitest.config.ts
- `.claude/skills/vitest/references/core-describe.md`: describe/suite for grouping tests into logical blocks
- `.claude/skills/vitest/references/core-expect.md`: Assertions with matchers, asymmetric matchers, and custom matchers
- `.claude/skills/vitest/references/core-hooks.md`: beforeEach, afterEach, beforeAll, afterAll, and around hooks
- `.claude/skills/vitest/references/core-test-api.md`: test/it function for defining tests with modifiers
- `.claude/skills/vitest/references/features-concurrency.md`: Concurrent tests, parallel execution, and sharding
- `.claude/skills/vitest/references/features-context.md`: Test context, custom fixtures with test.extend
- `.claude/skills/vitest/references/features-coverage.md`: Code coverage with V8 or Istanbul providers
- `.claude/skills/vitest/references/features-filtering.md`: Filter tests by name, file patterns, and tags
- `.claude/skills/vitest/references/features-mocking.md`: Mock functions, modules, timers, and dates with vi utilities
- `.claude/skills/vitest/references/features-snapshots.md`: Snapshot testing with file, inline, and file snapshots

<!-- autoskills:end -->
