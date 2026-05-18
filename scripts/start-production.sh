#!/usr/bin/env bash
set -u

echo "=================================================="
echo "FOOCCI EMERGENCY MIGRATION RECOVERY START"
echo "=================================================="

echo "Step 1: resolving failed migration as rolled back if needed..."
npx prisma migrate resolve --rolled-back 20260518000001_add_distance_min_fee_km || true

echo "Step 2: running prisma migrate deploy..."
npx prisma migrate deploy

echo "Step 3: starting Next.js..."
npx next start
