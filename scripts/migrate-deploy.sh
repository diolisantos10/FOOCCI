#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Robust PRE-DEPLOY migration for Railway.
#
# Why this exists: when two Railway deploys start close together (several chats
# push near-simultaneously), both pre-deploys run `prisma migrate deploy` at the
# same time. Prisma takes an advisory lock, so the second one FAILS in ~20s
# ("Pre-deploy command failed") even though nothing is actually broken. Retrying
# lets the loser succeed the moment the other deploy releases the lock.
#
# It also recovers a known previously-failed migration (P3009) so a stuck state
# self-heals instead of blocking every future deploy.
#
# Wired via railway.toml [deploy] preDeployCommand (config-as-code overrides the
# dashboard's plain `migrate deploy`). The boot script (start-production.sh) also
# migrates as a fallback; both are idempotent.
# ─────────────────────────────────────────────────────────────────────────────
set -u

echo "── Pre-deploy migration ──────────────────────────"

# P3009 recovery: mark a known failed migration as rolled-back. Idempotent and
# harmless if it's already resolved or absent.
npx prisma migrate resolve --rolled-back 20260518000001_add_distance_min_fee_km || true

# Retry to survive advisory-lock contention from a concurrent deploy.
for attempt in 1 2 3 4 5; do
  if npx prisma migrate deploy; then
    echo "✓ migrate deploy ok (attempt ${attempt})"
    exit 0
  fi
  wait=$(( attempt * 8 ))
  echo "migrate deploy failed (attempt ${attempt}/5) — likely a concurrent deploy holding the lock; retrying in ${wait}s"
  sleep "${wait}"
done

echo "✗ migrate deploy still failing after 5 attempts — a real migration problem, not the lock."
exit 1
