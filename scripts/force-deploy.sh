#!/usr/bin/env bash
# scripts/force-deploy.sh
#
# Manually trigger a Railway deploy by calling the deploy hook.
#
# Usage:
#   RAILWAY_WEBHOOK_URL="https://..." ./scripts/force-deploy.sh
#   OR export RAILWAY_WEBHOOK_URL in your shell and just run:
#   ./scripts/force-deploy.sh
#
# The deploy hook URL is in Railway dashboard:
#   Project → Service → Settings → Deploy → Deploy Hook (copy the URL)
# Store it as RAILWAY_WEBHOOK_URL in your environment or .env.local.

set -euo pipefail

WEBHOOK_URL="${RAILWAY_WEBHOOK_URL:-}"

if [[ -z "$WEBHOOK_URL" ]]; then
  echo "[force-deploy] ERROR: RAILWAY_WEBHOOK_URL is not set."
  echo "  Export it or call: RAILWAY_WEBHOOK_URL='<url>' ./scripts/force-deploy.sh"
  exit 1
fi

BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

echo "[force-deploy] Triggering Railway deploy..."
echo "  Branch : $BRANCH"
echo "  Commit : $COMMIT"
echo "  Time   : $TIMESTAMP"

HTTP_STATUS=$(curl -s -o /tmp/railway_deploy_response.txt -w "%{http_code}" \
  -X POST \
  -H "Content-Type: application/json" \
  "$WEBHOOK_URL")

BODY=$(cat /tmp/railway_deploy_response.txt 2>/dev/null || echo "(no body)")

echo "[force-deploy] Response status : $HTTP_STATUS"
echo "[force-deploy] Response body   : $BODY"

if [[ "$HTTP_STATUS" == "200" || "$HTTP_STATUS" == "202" ]]; then
  echo "[force-deploy] Deploy triggered successfully."
else
  echo "[force-deploy] ERROR: Unexpected status $HTTP_STATUS. Check the URL and Railway dashboard."
  exit 1
fi
