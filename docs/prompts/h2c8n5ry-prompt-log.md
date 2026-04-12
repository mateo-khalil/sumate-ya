# Prompt Log

- Timestamp: 2026-04-07 23:24:10
- Task ID: h2c8n5ry

## User Prompt

> set some basic files in this folders so these persist in git, also add to backend rules that always use this structure. make sure that the backend rules are references in claude.md as: always before working on abckend read this etc.
> apps/backend/src/config
> apps/backend/src/controllers
> apps/backend/src/data
> apps/backend/src/middleware
> apps/backend/src/repositories
> apps/backend/src/routes
> apps/backend/src/scripts
> apps/backend/src/services

## Agent Main Actions

- Added `.gitkeep` placeholder files in the requested backend source subfolders so Git tracks the structure.
- Updated backend rule documentation to make the backend source structure mandatory and persistent.
- Updated `claude.md` with an explicit backend-rules-first requirement before any work in `apps/backend/**`.
