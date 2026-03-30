---
name: api-endpoint
description: Add new backend API endpoints with service + schema + resolver/controller + repository + caching layers for Node.js backends. Covers GraphQL and REST patterns, error handling, and egress prevention.
---

# API Endpoint Creation

## Feature Addition Order

1. **Schema/Route definition** -- Add type/query/mutation (GraphQL) or route (REST)
2. **Run codegen** (if using GraphQL) -- Generate TypeScript types
3. **Service** -- Business logic (pure, no side effects)
4. **Resolver/Controller** -- Orchestration + side effects
5. **Repository** -- Database access layer
6. **Tests** -- Cover happy path + error cases

## Service Template (Copy This)

```typescript
// src/services/exampleService.ts
import { db } from '../config/database.js'
import { cache } from '../config/cache.js'
import type { ServiceContext } from '../types/context.js'

export interface CreateExampleInput {
  name: string
  description?: string
}

export interface ExampleResult {
  id: string
  name: string
}

export const exampleService = {
  async create(ctx: ServiceContext, input: CreateExampleInput): Promise<ExampleResult> {
    // 1. Use authenticated/scoped DB client if available
    const client = ctx.dbClient ?? db

    // 2. Validate input
    if (!input.name) throw new Error('Name is required')

    // 3. Query database -- ALWAYS list explicit columns, NEVER select('*')
    const result = await client
      .from('examples')
      .insert({ name: input.name, userId: ctx.userId })
      .select('id, name')
      .single()

    // 4. Handle error -- ALWAYS wrap in Error, never throw raw DB errors
    if (result.error) throw new Error(`Failed to create: ${result.error.message}`)
    if (!result.data) throw new Error('No data returned')

    return { id: result.data.id, name: result.data.name }
  },

  async getById(ctx: ServiceContext, id: string): Promise<ExampleResult | null> {
    // Use caching for read queries
    return cache.getOrSet(
      `example:${id}`,
      async () => {
        const { data, error } = await db
          .from('examples')
          .select('id, name') // NEVER select('*')
          .eq('id', id)
          .single()

        if (error || !data) return null
        return { id: data.id, name: data.name }
      },
      { ttl: 1800 } // 30 minutes
    )
  },
}
```

## GraphQL Schema Template

```graphql
# src/graphql/schema/example.graphql
type Example {
  id: ID!
  name: String!
  description: String
}

input CreateExampleInput {
  name: String!
  description: String
}

extend type Query {
  example(id: ID!): Example
  examples: [Example!]!
}

extend type Mutation {
  createExample(input: CreateExampleInput!): Example!
}
```

## Resolver Template

```typescript
// Resolver -- orchestration + side effects
const resolvers = {
  Query: {
    example: async (_: unknown, { id }: { id: string }, ctx: Context) => {
      const user = requireAuth(ctx)
      return exampleService.getById({ userId: user.id }, id)
    },
  },
  Mutation: {
    createExample: async (_: unknown, { input }: { input: CreateExampleInput }, ctx: Context) => {
      const user = requireAuth(ctx)
      // Create user-scoped DB client for write operations
      const dbClient = ctx.accessToken ? createScopedClient(ctx.accessToken) : undefined
      const result = await exampleService.create({ userId: user.id, dbClient }, input)

      // Side effects belong HERE, not in services
      await notifySubscribers('example:created', result)

      return result
    },
  },
}
```

## REST Route Template

```typescript
// src/routes/exampleRoutes.ts
import { Router } from 'express'
import { authenticate } from '../middleware/auth.js'

const router = Router()

router.post('/examples', authenticate, async (req, res) => {
  try {
    const result = await exampleService.create(
      { userId: req.user.id },
      req.body
    )
    res.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Operation failed'
    res.status(400).json({ error: message })
  }
})

export default router
```

## Service Pattern Rules

- Services return **data only** -- no side effects (no WebSocket broadcasts, no notifications, no emails)
- Side effects (broadcasts, notifications) belong in resolvers/controllers
- Use `ServiceContext` to pass auth context **and** user-scoped DB client
- Always destructure `{ data, error }` from DB responses -- check error before accessing data
- Explicit return types on all methods
- **NEVER** throw raw DB/ORM errors -- wrap them: `throw new Error(error.message)`

## Egress Prevention Rules

- **NEVER** use `select('*')` -- always list explicit columns to reduce payload size
- Define a `const COLUMNS = 'id, name, ...'` constant per table in each repository
- **All read-heavy paths MUST use caching** (Redis, in-memory, or your cache layer)
- Cache at the **service layer**, not the repository layer
- Invalidate caches on mutations
- TTL guidelines: list queries 1h, single entities 30m, user data 5m, dynamic data 2-3m
- **NEVER** store file/image URLs without verifying the storage bucket exists

## N+1 Prevention

- When a type resolver fetches related data, use **DataLoader** or batch queries
- Prefer returning joined data from the parent query over per-field sub-queries

## Auth-Scoped Database Access

For backends with row-level security (RLS) or multi-tenant isolation:

```typescript
// Resolver creates user-scoped client
const dbClient = createScopedClient(ctx.accessToken)
// Pass to service via context
await service.create({ userId: user.id, dbClient }, input)
// Service uses scoped client
const client = ctx.dbClient ?? defaultClient
```

**Rule**: NEVER rely solely on the default/admin DB client for write operations when RLS is enabled.

## GraphQL vs REST Decision

| Use Case | Protocol |
|----------|----------|
| Mobile/SPA data (complex, nested) | GraphQL / tRPC |
| Auth (login, register, refresh) | REST |
| Payments (provider webhooks) | REST |
| Admin dashboard | REST or GraphQL |
| External webhooks | REST |

## Anti-Patterns

- Side effects in services -- use resolvers/controllers
- REST endpoints for data that should use GraphQL (or vice versa)
- Omitting file extensions in ESM imports
- Editing generated type files -- run codegen
- Skipping `{ data, error }` destructuring from DB responses
- `select('*')` -- always list explicit columns
- Read paths without caching
- Raw `throw error` from DB -- always `throw new Error(error.message)`
- Writing to tables without appropriate access policies
- Passing only `{ userId }` to services that write -- include the scoped DB client
