# Prompt Log

- Timestamp: 2026-04-12 16:18:23
- Task ID: 4405775b

## User Prompt

> Modificá las reglas para NUNCA darle al usuario un codigo sql ya que nunca deberia aplicar codigo sql directamente en supabase.
>
> siempre tenés que insistirle al usuario para que se conecte con supabase mcp.
>
> agrega reglas para esto

## Agent Main Actions

- Updated global workflow rules to explicitly prohibit returning raw SQL and require MCP-first execution.
- Updated root project rules to enforce insisting on Supabase MCP connection/authentication before DB operations.
- Updated backend rules to align SQL-handling policy and MCP-only database operation flow.
