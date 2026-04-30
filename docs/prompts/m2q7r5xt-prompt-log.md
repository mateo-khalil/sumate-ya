# Prompt Log

- Timestamp: 2026-04-28 00:03:32
- Task ID: m2q7r5xt

## User Prompt

> You have been given comments on the previous commits you made in the repository.
> Address the new comments: 3150565271 (fix misleading doc comment in validators.ts) and 3150565304 (extract duplicated parseGqlError into a shared utility).

## Agent Main Actions

- Fixed the misleading doc comment in `apps/backend/src/lib/validators.ts` to say "matches the canonical hyphenated UUID format used by our DB IDs and seeded data" instead of "matches exactly what Postgres accepts".
- Created a shared utility `apps/frontend/src/lib/parseGqlError.ts` containing the `parseGqlError` function.
- Removed the duplicated local `parseGqlError` definitions from `ProposeResultForm.tsx` and `MatchResultsSection.tsx` and updated both to import from the shared utility.
