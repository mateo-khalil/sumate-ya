---
paths:
  - apps/manager/**
---

# Manager Rules (React + Vite + Apollo + Radix)

## Domain Context
The manager app is the admin/organizer dashboard for the football player connection platform — organizers manage matches, venues, teams, and player rosters from here.

## Component Decomposition (MANDATORY)
Pages must be **orchestration only** — extract all UI blocks into subcomponents.

**File size limits:**
- Page files: < 150 lines (data wiring + composition only)
- Component files: < 200 lines (extract subcomponents if larger)

**Component placement:**
| Component type          | Location                            |
| ----------------------- | ----------------------------------- |
| Primitive UI            | `src/components/ui/`                |
| Feature-specific        | `src/components/[feature]/`         |
| Shared across features  | `src/components/shared/`            |
| Layout structure        | `src/components/layout/`            |

**Before writing code, ask:**
1. Does this logic/UI already exist? → Extract to shared component
2. Is this block > 50 lines? → Extract to subcomponent
3. Multiple responsibilities? → Split into focused components

## State Management
| Layer        | Technology   | Use Case                              |
| ------------ | ------------ | ------------------------------------- |
| Global state | Zustand      | Selected venue/team, app-wide state   |
| Auth/Theme   | React Context | User session, theme only             |
| Server state | Apollo Client | GraphQL data, caching                |

- **Never mix**: Zustand for global, Context for auth/theme only
- Context-aware components must always handle missing selection state (e.g., `!selectedVenueId`)

## UI Patterns
- All components built on Radix UI primitives for accessibility
- Use CVA (Class Variance Authority) for variant management
- Components use `React.forwardRef` and `asChild` pattern for composition

## GraphQL
- Never use inline GraphQL — always define in `src/graphql/queries.ts` or `mutations.ts`
- Generated types in `src/graphql/generated/` — never edit directly
- After editing GraphQL: run `pnpm run codegen`

## Adding a New Page
1. `src/pages/[page].tsx` — Page component (orchestration only)
2. `src/graphql/queries.ts` or `mutations.ts` — GraphQL operations
3. `pnpm run codegen` — Generate types
4. Wire generated hooks into page

## Optimistic Updates (MANDATORY for mutations that affect visible lists)

When a mutation creates, updates, or deletes data that is currently displayed in the UI (e.g. match rosters, scheduled games), **always use optimistic updates via the Zustand store**:

1. **Build an optimistic object** with a temp ID (`opt-${Date.now()}`) and correct `__typename` values from generated types
2. **Write to the Zustand store first** — UI updates instantly
3. **Close modal / show success toast** before awaiting the mutation
4. **Await the mutation** — on success, `refetchQueries` replaces optimistic data with real server data
5. **On error, roll back** — remove the optimistic entry from the store and show error toast

**Critical**: Pages/components that render lists must **read from the Zustand store**, not directly from Apollo query data. The store is the source of truth because it contains both server data and optimistic entries.

```typescript
// ✅ CORRECT — reads from store (includes optimistic entries)
const { matches: storeMatches } = useMatchStore();
const allMatches = storeMatches.length > 0 ? storeMatches : (queryData ?? []);

// ❌ WRONG — reads only Apollo data, misses optimistic entries
const matches = data?.organizerMatches ?? [];
```

## Anti-Patterns
- **NEVER** write monolithic page components (500+ line files)
- **NEVER** use inline GraphQL
- **NEVER** mix Zustand and Context for the same state concern
- **NEVER** edit generated GraphQL types — run codegen
- **NEVER** store secrets in code — use environment variables
- **NEVER** read Apollo query data directly for lists that support optimistic updates — always read from the Zustand store
