# Claude Project Rules

## Hard Rule: Prompt Tracking Log (Mandatory)

After finishing EVERY user task, the agent MUST create exactly one new markdown file inside `docs/prompts/`.

### Required behavior

1. Generate a random task ID (recommended: 8+ lowercase alphanumeric characters).
2. Check `docs/prompts/` to ensure the generated ID is not already used.
3. If there is a collision, generate a new random ID and retry.
4. Filename format MUST be: `docs/prompts/<random-id>-prompt-log.md`.
   - Examples: `a7f3k9q2-prompt-log.md`, `x4m1t8vb-prompt-log.md`.
5. Do not use sequential numbering.
6. The file content MUST include:
   - The user prompt, copied explicitly.
   - Exactly 3 bullet points summarizing what the agent mainly did.
   - A timestamp.
7. This rule is mandatory and must not be skipped.

### Required file template

```md
# Prompt Log

- Timestamp: YYYY-MM-DD HH:mm:ss
- Task ID: <random-id>

## User Prompt

> [Paste the exact user prompt here]

## Agent Main Actions

- [Main action 1]
- [Main action 2]
- [Main action 3]
```

### Enforcement

- The task is not complete until the corresponding prompt log file is created in `docs/prompts/`.
