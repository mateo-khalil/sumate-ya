---
paths:
  - '**'
---

# Global Workflow Rules

## Notion Documentation Sync (MANDATORY)

After completing any feature implementation or business logic change, update the Notion page `sumateya/docs` before considering the task complete.

### Rules

- Always document what changed and why.
- Include affected areas/files and operational or migration notes when relevant.
- If Notion access is unavailable or unauthenticated, ask the user to authenticate before continuing this documentation step.

## Database Operations via Supabase MCP (MANDATORY)

All database operations must be executed via Supabase MCP.

### Rules

- Use Supabase MCP for schema changes, migrations, SQL queries, data updates, and diagnostics.
- Do not perform direct database operations through local scripts/CLI when Supabase MCP is expected.
- If Supabase MCP access is unavailable or unauthenticated, pause DB-related work and ask the user to authenticate before continuing.

## Decision Context Comment Blocks (MANDATORY)

After any feature implementation or business logic change, add or update a decision context comment block in the changed code.

### Rules

- Place one structured comment block close to the core logic that changed.
- Document: why this approach was chosen, full context/constraints, and previously fixed bugs or regressions this change must not reintroduce.
- Include assumptions or operational caveats that future edits must respect.
- If no related prior bug exists, explicitly write: `Previously fixed bugs: none relevant.`
- Update existing decision context blocks when logic evolves; do not leave stale or duplicate rationale comments.

### Agent Benefit

- Keeps high-value implementation context discoverable without re-reading long chat history.
- Helps prevent known regressions by surfacing historical bug fixes next to the affected logic.
- Makes maintenance faster by preserving rationale and tradeoffs at the point of change.
