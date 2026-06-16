#!/usr/bin/env bash
#
# Deploy the Astro SSR frontend to Vercel.
#
# Decision Context:
# - Why this script: the frontend reads PRIVATE_BACKEND_URL via import.meta.env, which Vite
#   inlines at BUILD time. So the Render backend URL must be present in the environment when
#   `astro build` runs — not at runtime. This script exports it, builds locally, then ships the
#   produced artifact with `vercel deploy --prebuilt`.
# - Why --prebuilt: @astrojs/vercel writes apps/frontend/.vercel/output (Build Output API format)
#   directly from `astro build`. Deploying that prebuilt output guarantees Vercel ships exactly
#   what was built here with the inlined backend URL — no second build on Vercel's CI that could
#   miss the env var.
# - PRIVATE_IS_PROD=true so SSR auth sets Secure cookies behind Vercel's TLS.
# - Migrated from Cloudflare Workers (`wrangler deploy`). The project must be linked once with
#   `vercel link` (run from apps/frontend) so .vercel/project.json exists before the first deploy.
# - Previously fixed bugs: none relevant.
#
# Usage:
#   BACKEND_URL=https://sumate-ya-backend.onrender.com scripts/deploy-frontend.sh
#   Add --prod to push to production:
#   BACKEND_URL=https://sumate-ya-backend.onrender.com scripts/deploy-frontend.sh --prod
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

# Pass through --prod (or any extra vercel flags) to the deploy step.
DEPLOY_ARGS=("$@")

echo "[deploy-frontend] building with PRIVATE_BACKEND_URL=$PRIVATE_BACKEND_URL"
pnpm run build

echo "[deploy-frontend] deploying prebuilt output to Vercel"
vercel deploy --prebuilt "${DEPLOY_ARGS[@]}"
