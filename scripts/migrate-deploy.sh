#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Robust PRE-DEPLOY migration for Railway. Two failure modes it heals:
#
# 1) Advisory-lock race — when two deploys start close together, both run
#    `migrate deploy` at once; the loser fails in ~20s. We retry so it succeeds
#    the moment the other deploy releases the lock.
#
# 2) P3009 (a migration stuck in "failed" state) — a deploy killed mid-migration
#    (e.g. by that race, or a timeout) leaves a migration marked started-but-not-
#    finished. Every later `migrate deploy` then refuses with P3009. We detect the
#    stuck migration from the error and roll it back, then retry (which re-applies
#    it cleanly). Safe here because ALL our migrations are additive single
#    statements wrapped in a transaction: a killed one never committed its DDL, so
#    rolling back + re-applying is a no-op-then-clean-apply, never data loss.
#
# Wired via railway.toml [deploy] preDeployCommand (config-as-code overrides the
# dashboard command). start-production.sh also migrates at boot (idempotent).
# ─────────────────────────────────────────────────────────────────────────────
set -u

echo "── Pre-deploy migration ──────────────────────────"
echo "Migration status before:"
npx prisma migrate status || true

# Known historical P3009 (idempotent; harmless if already resolved/absent).
npx prisma migrate resolve --rolled-back 20260518000001_add_distance_min_fee_km || true

for attempt in 1 2 3 4 5 6; do
  out=$(npx prisma migrate deploy 2>&1); code=$?
  printf '%s\n' "$out"
  if [ "$code" -eq 0 ]; then
    echo "✓ migrate deploy ok (attempt ${attempt})"
    exit 0
  fi

  # P3009 recovery: roll back the stuck migration named in the error, then retry.
  if printf '%s' "$out" | grep -qiE "P3009|failed migrations"; then
    stuck=$(printf '%s' "$out" | grep -oE '[0-9]{14}_[a-zA-Z0-9_]+' | head -1)
    if [ -n "$stuck" ]; then
      echo "P3009 detected — rolling back stuck migration: ${stuck}"
      npx prisma migrate resolve --rolled-back "$stuck" || true
      continue   # retry immediately; the migration re-applies from scratch
    fi
  fi

  # Otherwise assume advisory-lock contention from a concurrent deploy: back off.
  wait=$(( attempt * 8 ))
  echo "migrate deploy failed (attempt ${attempt}/6) — retrying in ${wait}s"
  sleep "${wait}"
done

echo "✗ migrate deploy still failing after retries — inspect the status output above."
exit 1
