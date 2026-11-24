#!/usr/bin/env bash
# Apply Prisma migrations to a target database (preview/staging only).
# Requires DATABASE_URL with SSL (e.g. Supabase pooler or direct, ?sslmode=require).
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "supabase-migrate-deploy: DATABASE_URL is not set"
  exit 1
fi

if [[ "${ALLOW_PRODUCTION_MIGRATE:-}" != "true" ]]; then
  if [[ "${VERCEL_ENV:-}" == "production" || "${NODE_ENV:-}" == "production" ]]; then
    echo "supabase-migrate-deploy: refusing to migrate when NODE_ENV/VERCEL_ENV is production"
    echo "Set ALLOW_PRODUCTION_MIGRATE=true only with explicit owner approval"
    exit 1
  fi
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/packages/db"

echo "supabase-migrate-deploy: prisma migrate deploy (no destructive reset)"
bunx prisma migrate deploy