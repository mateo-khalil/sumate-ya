#!/usr/bin/env bash
# Frees the dev ports used by the monorepo so a fresh `turbo dev` (or a fresh
# Playwright run) can bind them.
#
# Decision Context:
# - 4000 = backend (Express + Apollo, started by `tsx watch`).
# - 4321 = frontend (Astro dev server).
# - Both are bound by long-running watchers. A crashed `npm run test:e2e`,
#   a Ctrl+C that only killed the parent npm process, or a tsx-watch restart
#   that half-died can leave one or both of these ports bound by a zombie.
# - When Playwright re-runs with `reuseExistingServer: !CI`, it only probes the
#   FRONTEND url (4321). If 4321 is alive but the backend (4000) is dead, every
#   /perfil-style SSR page hangs forever and tests appear to "freeze" mid-run
#   (we hit this on profile-avatar-upload.spec.ts:235 / [54/60]).
# - Always running this before `dev` and before `test:e2e` guarantees both ports
#   are clean and the dev stack boots from a known state.
# - Previously fixed bugs: tests hanging at [54/60] because backend on 4000 died
#   after a tsx-watch restart while frontend on 4321 stayed up — Playwright
#   never noticed because reuseExistingServer only probes the frontend URL.
set -u

# Accept ports as CLI args so callers can clean only what they care about
# (e.g. `dev:frontend` only needs 4321 freed, not 4000). Default targets both
# dev ports — that matches the full-stack `dev` and `test:e2e` flows.
if [ "$#" -gt 0 ]; then
  PORTS=("$@")
else
  PORTS=(4000 4321)
fi
killed_any=0

for port in "${PORTS[@]}"; do
  # `lsof -ti :PORT` prints PIDs only; suppress errors when no process matches.
  pids=$(lsof -ti tcp:"$port" 2>/dev/null || true)
  if [ -n "$pids" ]; then
    printf '[kill-dev-ports] freeing :%s (pids: %s)\n' "$port" "$(echo "$pids" | tr '\n' ' ')"
    # shellcheck disable=SC2086
    kill -9 $pids 2>/dev/null || true
    killed_any=1
  fi
done

if [ "$killed_any" -eq 0 ]; then
  printf '[kill-dev-ports] ports already free: %s\n' "${PORTS[*]}"
fi

# Always succeed — this is a best-effort cleanup, never a build blocker.
exit 0
