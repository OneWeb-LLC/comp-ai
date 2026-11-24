#!/usr/bin/env bash
# Builds a workspace package on Vercel from apps/<app> root directory config.
# Usage: vercel-monorepo-build.sh @trycompai/app
set -euo pipefail

FILTER="${1:?Pass a turbo filter, e.g. @trycompai/app}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

export SKIP_ENV_VALIDATION="${SKIP_ENV_VALIDATION:-true}"
export NODE_OPTIONS="${NODE_OPTIONS:---max_old_space_size=6144}"

# Vercel uses Turbopack for Next.js; do not force standalone output (Docker-only).
unset NEXT_OUTPUT_STANDALONE

if [[ ! -d node_modules ]]; then
  echo "vercel-monorepo-build: node_modules missing; run install from monorepo root first"
  exit 1
fi

bunx turbo run build --filter="${FILTER}"