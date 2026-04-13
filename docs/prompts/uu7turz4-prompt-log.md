# Prompt Log

- Timestamp: 2026-04-13 19:07:46
- Task ID: uu7turz4

## User Prompt

> agrega una regla que siempre un agente cuando termine de editar, corra turbo typecheck --force y debe dar pass para marcar la tarea como completada.

## Agent Main Actions

- Added a mandatory completion rule to the shared workflow instructions requiring `turbo typecheck --force` after any workspace edit.
- Added the same mandatory rule to the main repository agent guidance so task completion is explicitly blocked on a passing typecheck.
- Ran the repository typecheck validation and captured the current backend failures that still block a green completion state.