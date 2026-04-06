# Claude Project Rules

## Hard Rule: Prompt Tracking Log (Mandatory)

After finishing EVERY user task, the agent MUST create exactly one new markdown file inside `docs/prompts/`.

### Required behavior

1. Read existing files in `docs/prompts/` and find the highest numeric ID used.
2. Create the next file with ID = previous max + 1.
3. Use zero-padded IDs with 4 digits.
4. Filename format MUST be: `docs/prompts/####-prompt-log.md`.
   - Examples: `0001-prompt-log.md`, `0002-prompt-log.md`.
5. If no files exist yet, start at `0001-prompt-log.md`.
6. The file content MUST include:
   - The user prompt, copied explicitly.
   - Exactly 3 bullet points summarizing what the agent mainly did.
   - A timestamp.
7. This rule is mandatory and must not be skipped.

### Required file template

```md
# Prompt Log

- Timestamp: YYYY-MM-DD HH:mm:ss
- Task ID: ####

## User Prompt

> [Paste the exact user prompt here]

## Agent Main Actions

- [Main action 1]
- [Main action 2]
- [Main action 3]
```

### Enforcement

- The task is not complete until the corresponding prompt log file is created in `docs/prompts/`.
