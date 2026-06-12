#!/usr/bin/env bash
#
# Deploy the Astro SSR frontend to Cloudflare Workers.
#
# Decision Context:
# - Why this script: the frontend reads PRIVATE_BACKEND_URL via import.meta.env, which Vite
#   inlines at BUILD time. So the Render backend URL must be present in the environment when
#   `astro build` runs — not at Worker runtime. This script exports it, builds, then deploys
#   the produced Worker with `wrangler deploy`.
# - PRIVATE_IS_PROD=true so SSR auth sets Secure cookies behind Cloudflare's TLS.
# - Previously fixed bugs: none relevant (new file).
#
# Usage:
#   BACKEND_URL=https://sumate-ya-backend.onrender.com scripts/deploy-frontend.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/apps/frontend"

BACKEND_URL="${BACKEND_URL:-${PRIVATE_BACKEND_URL:-}}"
if [[ -z "$BACKEND_URL" ]]; then
  echo "ERROR: set BACKEND_URL (or PRIVATE_BACKEND_URL) to the Render backend URL." >&2
  exit 1
fi

export PRIVATE_BACKEND_URL="$BACKEND_URL"
export PRIVATE_IS_PROD="true"

echo "[deploy-frontend] building with PRIVATE_BACKEND_URL=$PRIVATE_BACKEND_URL"
pnpm run build

echo "[deploy-frontend] deploying Worker to Cloudflare"
npx wrangler deploy --var "PRIVATE_BACKEND_URL:$PRIVATE_BACKEND_URL"
