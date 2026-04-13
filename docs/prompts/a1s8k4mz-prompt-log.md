# Prompt Log

- Timestamp: 2026-04-13 18:50:00
- Task ID: a1s8k4mz

## User Prompt

> migrate this to use supabase Secret keys instead of service key.

## Agent Main Actions

- Migrated backend configuration to use `SUPABASE_SECRET_KEY` as the canonical server credential, while keeping temporary fallback support for legacy `SUPABASE_SERVICE_KEY` during rollout.
- Updated tracked documentation and examples in `apps/backend/.env.example` and `README.md` to describe the new `sb_secret_...` server key contract.
- Renamed local `.env` files from `SUPABASE_SERVICE_KEY` to `SUPABASE_SECRET_KEY`, validated the backend config file still typed cleanly, and documented the change in `sumateya/docs` on Notion.
