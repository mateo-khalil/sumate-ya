# Prompt Log

- Timestamp: 2026-04-12 16:46:47
- Task ID: c1c2df20

## User Prompt

> modify the porompt logger rules and add a rule to if the pormpot have secerts, like use this apy key for etc filter that api key with ****

## Agent Main Actions

- Updated prompt tracking rules to require redacting secrets in logged user prompts.
- Added explicit masking guidance (`****`) for API keys, tokens, passwords, private keys, connection strings, and webhook secrets.
- Updated the prompt log template text to enforce redaction language in future entries.
