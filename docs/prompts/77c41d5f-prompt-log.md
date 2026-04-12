# Prompt Log

- Timestamp: 2026-04-12 17:03:03
- Task ID: 77c41d5f

## User Prompt

> currenlty en root .env is not inside backend or forntend.
>
> make a command like npm run sumate-ya
>
> that basically creates a syslink of the .env into thos efolders.

## Agent Main Actions

- Added a new root script named `sumate-ya` in `package.json` to create symlinks for backend and frontend env files.
- Implemented forced symlink creation to map `apps/backend/.env` and `apps/frontend/.env` to root `.env`.
- Executed the script and verified both symlinks were created successfully.
