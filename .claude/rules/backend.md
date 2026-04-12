---
paths:
  - apps/backend/**
---

# Backend Rules (Node + Express + GraphQL + Supabase)

## Domain Context

This is the backend for a football player connection platform — players find matches, join teams, and organize pickup games. Core entities include players, matches, teams, venues, and invitations.

## Required Backend Source Structure (MANDATORY)

Always use and preserve this structure under `apps/backend/src/`:

- `config/`
- `controllers/`
- `data/`
- `middleware/`
- `repositories/`
- `routes/`
- `scripts/`
- `services/`

Folder responsibilities:

- `config/`: environment and infrastructure clients/configuration.
- `controllers/`: REST controller handlers.
- `data/`: static data fixtures and seed-related data files.
- `middleware/`: Express middleware and request lifecycle guards.
- `repositories/`: database access layer.
- `routes/`: REST route registration.
- `scripts/`: operational scripts (migrations/seeding/helpers).
- `services/`: business logic.

If any folder is temporarily empty, keep a `.gitkeep` file so the structure persists in Git.
Do not remove or rename these folders without explicitly updating these rules.

## GraphQL Rules Integration (MANDATORY)

For backend tasks that touch GraphQL schema/resolvers/contracts, also read `.claude/rules/graphql.md`.

- After editing backend `.graphql` files, run codegen as defined in `.claude/rules/graphql.md`.
- Never edit generated GraphQL files directly.

## ESM Import Rule (CRITICAL)

Always use `.js` extension in imports — ESM build requires it:

```typescript
import { playerService } from './services/playerService.js';
import type { ServiceContext } from '../types/context.js';
```

## Service Pattern

- Services return **data only** — no side effects (no WebSocket broadcasts, no notifications)
- Side effects (broadcasts, notifications) belong in resolvers, not services
- Use `ServiceContext` to pass auth **and** the user-scoped Supabase client: `{ userId: user.id, supabase: userClient }`
- Always destructure `{ data, error }` from Supabase — check error before accessing data
- Explicit return types on all service methods

## RLS-Aware Database Access (CRITICAL)

All write operations MUST use a **user-scoped Supabase client** so RLS policies can verify `auth.uid()`. The default `supabase` client from `config/supabase.ts` is intended as service-role but we enforce RLS as defense-in-depth.

### Pattern: Resolver → Service → Repository

```typescript
// 1. Resolver: create user client from JWT, pass via ServiceContext
import { createUserClient } from '../../../../config/supabase.js';

const resolver = async (_: unknown, args: Args, context: GraphQLContext) => {
  const user = requireAuth(context);
  const userClient = context.accessToken ? createUserClient(context.accessToken) : undefined;
  return await someService(args, { userId: user.id, supabase: userClient });
};

// 2. Service: use context.supabase for all DB operations
const db = context.supabase ?? supabase; // user-scoped or fallback
const repo = context.supabase ? new SomeRepository({ supabase: context.supabase }) : someRepository; // singleton fallback

// 3. Direct Supabase calls use `db`, repository calls use `repo`
const { data } = await db.from('table').select('col').eq('id', id);
await repo.create(input);
```

### Rules

- **ALWAYS** pass `context.accessToken` from the GraphQL context to `createUserClient()`
- **ALWAYS** pass the user-scoped client via `ServiceContext.supabase`
- In services, use `context.supabase ?? supabase` for direct queries and create scoped repos
- When a function calls sub-functions that need DB access, thread the client through as a parameter
- **NEVER** rely solely on the singleton `supabase` client for write operations
- **NEVER** use `throw error` with raw Supabase errors — wrap: `throw new Error(error.message)`

### New RLS Policies

When adding a new table that the backend writes to, ALWAYS add RLS policies for:

1. `service_role` — full access (bypasses RLS anyway, but document intent)
2. `authenticated` — scoped to `auth.uid()` ownership chain (e.g., match organizer → match → player slot)

### Error Handling for Supabase Errors

Supabase `PostgrestError` is NOT an `Error` instance. Always extract messages properly:

```typescript
catch (error) {
  const message = error instanceof Error
    ? error.message
    : typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message: string }).message)
      : 'Operation failed';
  return { success: false, message };
}
```

## GraphQL vs REST Decision

| Feature                                     | Use     |
| ------------------------------------------- | ------- |
| Player-facing data (matches, teams, roster) | GraphQL |
| Auth (login, register, refresh)             | REST    |
| Payments / subscriptions                    | REST    |
| Admin dashboard                             | REST    |
| External webhooks                           | REST    |

## Resolver Pattern

- All resolvers in `src/graphql/resolvers/domains/` organized by domain
- Context: `{ user: { id, email }, accessToken }` from JWT verification
- **Always** create a user-scoped client in mutation resolvers: `createUserClient(context.accessToken)`
- Pass user client to services via `ServiceContext.supabase`
- Helper functions: `extract*Row()`, `rowToGraphQL()` for denormalization
- Generated types: `import type { Match } from '../generated/graphql.js'`

## Database (Supabase)

- **Always** inspect the real schema before writing services or migrations — never assume column names or types
- Use migrations for all schema changes (new tables, columns, indexes, RLS policies)
- Test complex queries before embedding in service code
- **camelCase naming**: All table and column names must be camelCase — always quote identifiers in SQL (e.g. `CREATE TABLE "matchPlayers" ("playerId" uuid NOT NULL)`)
- Never provide SQL snippets to users for manual execution in Supabase
- If DB work is requested and Supabase MCP is not connected/authenticated, stop and insist the user connect Supabase MCP first
- Convert SQL requests into Supabase MCP operations instead of returning raw SQL text

## Egress Prevention (CRITICAL)

Supabase bills cached egress (API + Storage). Every query and storage request counts. Follow these rules to keep egress under control:

### Supabase Queries

- **NEVER** use `select('*')` in repositories or services — always list explicit columns
- Define a `const COLUMNS = 'id, name, ...'` constant per table at the top of each repository
- For joined queries, compose: `select(\`\${TABLE_COLUMNS}, relation(\${RELATION_COLUMNS})\`)`
- Only select columns actually used by the service/resolver consuming the data

### Redis Caching (config/redis.ts)

- **All read-heavy paths MUST use `cacheGetOrSet()`** from `config/redis.ts`
- Existing cache infrastructure: `cacheGet`, `cacheSet`, `cacheGetOrSet`, `cacheDelete`, `cacheDeletePattern`
- Define TTLs in `CACHE_TTL` and key prefixes in `CACHE_PREFIX` (both in `config/redis.ts`)
- Cache at the **service layer**, not the repository layer
- Invalidate caches on mutations (use `cacheDelete` / `cacheDeletePattern`)
- TTL guidelines: list queries 1h, single entities 30m, player profiles 5m, dynamic data (match availability) 2-3m

### Storage URLs

- **NEVER** store Supabase Storage URLs without verifying the bucket exists
- Before writing `avatarUrl` or `imageUrl` to the database, confirm the storage bucket is created
- Broken image URLs cause egress on every client load (400 responses still count as egress)

### GraphQL Resolver N+1 Prevention

- When a type resolver fetches related data, use **DataLoader** or batch queries
- Prefer returning joined data from the parent query over per-field sub-queries
- Use field presets to control nested depth

## Adding a New Feature

1. Inspect existing schema — check tables and columns
2. Create migration if schema changes are needed
3. `src/graphql/schema/[feature].graphql` — Add type/query/mutation
4. `pnpm run codegen` — Generate TypeScript types
5. `src/services/[feature]Service.ts` — Business logic
6. `src/graphql/resolvers.ts` — Add resolver case
7. `tests/services/[feature].test.ts` — Write tests

## Anti-Patterns

- **NEVER** expose seed endpoints without admin role
- **NEVER** reveal email existence in auth responses — use ambiguous errors
- **NEVER** add REST endpoints for player-facing features — use GraphQL
- **NEVER** edit `src/generated/graphql.ts` — run codegen instead
- **NEVER** skip mocking side effects in tests
- **NEVER** omit `.js` extension in imports
- **NEVER** use `select('*')` — always list explicit columns (egress prevention)
- **NEVER** add a read-heavy query path without Redis caching via `cacheGetOrSet()`
- **NEVER** store Supabase Storage URLs without confirming the bucket exists
- **NEVER** use the singleton `supabase` client directly for writes in services — use `ctx.supabase ?? supabase`
- **NEVER** do `throw error` with raw Supabase errors — always `throw new Error(error.message)`
- **NEVER** write to a new table without adding RLS policies for `authenticated` role
- **NEVER** pass `{ userId }` alone to services that write data — include `supabase: userClient`
