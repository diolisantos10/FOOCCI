#!/usr/bin/env bash
set -u

echo "=================================================="
echo "FOOCCI EMERGENCY MIGRATION RECOVERY START"
echo "=================================================="

echo "Step 1: resolving failed migration as rolled back if needed..."
npx prisma migrate resolve --rolled-back 20260518000001_add_distance_min_fee_km || true

echo "Step 2: running prisma migrate deploy..."
npx prisma migrate deploy

echo "Step 3: scheduling manual guides self-seed (background)..."
# Keeps the lojista help guides in sync with the code on every deploy:
# once the server is up, upsert the code-defined guides into the DB
# (idempotent, published + agent-visible). Never blocks or fails the boot.
if [ -n "${ADMIN_SECRET:-}" ]; then
  (
    for delay in 30 45 60; do
      sleep "$delay"
      STATUS=$(curl --max-time 30 -s -o /tmp/seed-howtos.json -w "%{http_code}" \
        -X POST "http://localhost:${PORT:-3000}/api/admin/manual/seed-howtos" \
        -H "x-admin-secret: ${ADMIN_SECRET}" || echo "000")
      echo "[manual-sync] seed-howtos attempt → HTTP ${STATUS}"
      if [ "$STATUS" = "200" ]; then
        echo "[manual-sync] guides synced: $(cat /tmp/seed-howtos.json 2>/dev/null)"
        break
      fi
    done
  ) &
else
  echo "[manual-sync] ADMIN_SECRET not set — skipping guides self-seed."
fi

echo "Step 4: starting Next.js..."
npx next start
