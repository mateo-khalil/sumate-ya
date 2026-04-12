---
paths:
  - apps/frontend/**
---

# Frontend Rules (Astro + React + shadcn/ui)

## Domain Context

This is the player-facing web app for the football platform. Frontend work should prioritize reusable UI, predictable state flow, and clear composition across Astro pages and React islands.

## Component Decomposition (MANDATORY)

Pages must be orchestration-oriented and composed from reusable UI blocks.

File size limits:

- All frontend source files: <= 600 lines (hard limit).
- Astro page files (`src/pages/**`): target <= 200 lines.
- React feature components: target <= 250 lines.

Component placement:
| Component type | Location |
| ----------------------- | ----------------------------------- |
| Primitive UI | `src/components/ui/` |
| Feature-specific | `src/components/[feature]/` |
| Shared across features | `src/components/shared/` |
| Layout structure | `src/layouts/` and `src/components/layout/` |

Before writing code, ask:

1. Does this logic/UI already exist? -> Reuse or extract.
2. Is this block too large for one file? -> Split by concern.
3. Are multiple responsibilities mixed together? -> Separate presentation, data, and state concerns.

## Reusable Components First (MANDATORY)

- Always check existing components in `src/components/` before creating new ones.
- If UI/logic appears in 2+ places, extract it into a shared component/hook.
- Keep primitive UI elements in `src/components/ui/` and compose feature components from them.

## State Management

| Layer        | Technology    | Use case                             |
| ------------ | ------------- | ------------------------------------ |
| Global state | nanostores    | Shared UI state and client app state |
| Auth/Theme   | React Context | Session/theme concerns only          |
| Server state | urql          | GraphQL data fetching and cache      |

- Do not duplicate the same state concern across nanostores and React Context.
- Keep server data in urql and UI interaction state in nanostores.

## UI Patterns

- Prefer Astro for static content and use React islands only for interactivity.
- Keep shadcn/Radix primitives as the base for accessible components.
- Use consistent composition patterns and avoid one-off visual implementations.

## GraphQL Rules

- Never use inline GraphQL strings inside UI components.
- Keep frontend operations in `apps/frontend/src/graphql/operations/`.
- Never edit generated GraphQL types directly.
- After editing `.graphql`, follow `.claude/rules/graphql.md` and run codegen.

## New Page Checklist

1. Add `src/pages/[route].astro` as orchestration shell.
2. Add/reuse feature components under `src/components/[feature]/`.
3. Add GraphQL operations in `src/graphql/operations/` when needed.
4. Run codegen after `.graphql` changes.

## Optimistic UI Updates

For list-affecting mutations (create/update/delete), update nanostore state optimistically so UI feedback is immediate.

1. Create an optimistic item with a temporary id.
2. Write optimistic state to the relevant nanostore first.
3. Execute mutation and reconcile with server response.
4. Roll back optimistic state on failure.

## Anti-Patterns

- **NEVER** copy-paste entire components for minor variants.
- **NEVER** build one-off UI when a reusable component fits.
- **NEVER** exceed 600 lines in a frontend source file.
- **NEVER** use inline GraphQL or edit generated GraphQL types.
- **NEVER** mix multiple state tools for the same responsibility.
