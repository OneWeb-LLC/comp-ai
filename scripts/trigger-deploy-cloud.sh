#!/usr/bin/env bash
# Deploy Trigger.dev task definitions to Trigger.dev Cloud (staging or prod).
# Run from a workstation or CI with TRIGGER_ACCESS_TOKEN / trigger CLI login — never commit secrets.
set -euo pipefail

TRIGGER_VERSION="${TRIGGER_CLI_VERSION:-4.4.3}"
ENV_NAME="${TRIGGER_DEPLOY_ENV:-staging}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

deploy_app() {
  echo "trigger-deploy: apps/app → ${ENV_NAME}"
  cd "$ROOT/apps/app"
  bunx "trigger.dev@${TRIGGER_VERSION}" deploy --env "${ENV_NAME}"
}

deploy_api() {
  echo "trigger-deploy: apps/api → ${ENV_NAME}"
  cd "$ROOT/apps/api"
  bunx "trigger.dev@${TRIGGER_VERSION}" deploy --env "${ENV_NAME}"
}

deploy_app
deploy_api

echo "trigger-deploy: done. Verify a safe run in the Trigger.dev dashboard (e.g. refreshExpiringTokensSchedule dry test)."