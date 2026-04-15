# Prompt Log

- Timestamp: 2026-04-15 12:00:00
- Task ID: g5t8w2np

## User Prompt

> add a rule that always the backend functions needs to log the errors etc.

## Agent Main Actions

- Added a mandatory "Error & Event Logging" section to `.claude/rules/backend.md` with rules for logging errors, contextual info, log levels, and Supabase-specific patterns.
- Added code examples showing the required logging format with `[ClassName.methodName]` prefix and entity IDs.
- Added two new anti-pattern entries prohibiting silent error swallowing and context-free log messages.
