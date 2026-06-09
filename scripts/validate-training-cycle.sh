#!/usr/bin/env bash
#
# validate-training-cycle.sh
#
# Runtime validation of the Agent Training Center v1.1 full loop:
#   batch → scenario → diagnosis → proposal → suggestions queue
#
# Requires:
#   BASE_URL   — e.g. https://foocci.com.br
#   ADMIN_SECRET — from Railway env
#
# Usage:
#   BASE_URL=https://foocci.com.br ADMIN_SECRET=xxx bash scripts/validate-training-cycle.sh

set -euo pipefail

BASE="${BASE_URL:-https://foocci.com.br}"
SECRET="${ADMIN_SECRET:?ADMIN_SECRET is required}"
H=(-H "x-admin-secret: $SECRET" -H "Content-Type: application/json" -s)

echo ""
echo "╔═══════════════════════════════════════════════════════════════════╗"
echo "║  FOOCCI — Training Center v1.1 Runtime Validation               ║"
echo "╚═══════════════════════════════════════════════════════════════════╝"
echo ""

# ── 1. Health ────────────────────────────────────────────────────────────────
echo "▶ 1. Production health"
HEALTH=$(curl -s "$BASE/api/health")
echo "$HEALTH" | python3 -m json.tool 2>/dev/null || echo "$HEALTH"
echo ""

# ── 2. Fresh batch ───────────────────────────────────────────────────────────
echo "▶ 2. Triggering fresh training batch (count=10, mode=QUICK)…"
RUN=$(curl "${H[@]}" -X POST "$BASE/api/admin/training/runs" \
  -d '{"agentType":"WHATSAPP_ORDERING","mode":"QUICK","count":10}')
echo "$RUN" | python3 -m json.tool 2>/dev/null || echo "$RUN"
RUN_ID=$(echo "$RUN" | python3 -c "import sys,json; print(json.load(sys.stdin)['runId'])" 2>/dev/null || echo "")
echo "  runId: $RUN_ID"
echo ""

if [ -z "$RUN_ID" ]; then
  echo "❌ Could not get runId — check ADMIN_SECRET and BASE_URL."
  exit 1
fi

# Wait for batch to complete (async, poll every 5s up to 120s)
echo "  Waiting for run to complete…"
for i in $(seq 1 24); do
  sleep 5
  STATUS=$(curl "${H[@]}" "$BASE/api/admin/training/runs/$RUN_ID" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('run',d).get('status','?'))" 2>/dev/null || echo "?")
  echo "  [$i] status: $STATUS"
  if [[ "$STATUS" == "COMPLETED" || "$STATUS" == "FAILED" ]]; then
    break
  fi
done

echo ""
echo "▶ 3. Run report"
REPORT=$(curl "${H[@]}" "$BASE/api/admin/training/runs/$RUN_ID/report")
echo "$REPORT" | python3 -m json.tool 2>/dev/null || echo "$REPORT"
echo ""

# ── 3. Find price-lookup scenario ────────────────────────────────────────────
echo "▶ 4. Scenarios in this run"
SCENARIOS=$(curl "${H[@]}" "$BASE/api/admin/training/scenarios?runId=$RUN_ID&perPage=20")
echo "$SCENARIOS" | python3 -m json.tool 2>/dev/null || echo "$SCENARIOS"
echo ""

# Find the price lookup scenario
PRICE_ID=$(echo "$SCENARIOS" | python3 -c "
import sys, json
data = json.load(sys.stdin)
scenarios = data.get('scenarios', [])
for s in scenarios:
    if 'preço' in (s.get('title') or '').lower() or 'preco' in (s.get('goal') or '').lower():
        print(s['id'])
        break
" 2>/dev/null || echo "")

if [ -n "$PRICE_ID" ]; then
  echo "▶ 5. Price-lookup scenario detail (id=$PRICE_ID)"
  curl "${H[@]}" "$BASE/api/admin/training/scenarios/$PRICE_ID" | python3 -m json.tool 2>/dev/null
  echo ""
fi

# ── 4. Find a WARN/FAIL scenario ─────────────────────────────────────────────
WARN_ID=$(echo "$SCENARIOS" | python3 -c "
import sys, json
data = json.load(sys.stdin)
scenarios = data.get('scenarios', [])
for s in scenarios:
    if s.get('status') in ('WARN', 'FAIL'):
        print(s['id'])
        break
" 2>/dev/null || echo "")

if [ -n "$WARN_ID" ]; then
  echo "▶ 6. Generating diagnosis for WARN scenario (id=$WARN_ID)"
  EVAL=$(curl "${H[@]}" -X POST "$BASE/api/admin/training/scenarios/$WARN_ID/evaluate")
  echo "$EVAL" | python3 -m json.tool 2>/dev/null || echo "$EVAL"
  echo ""

  echo "▶ 7. Creating improvement proposal for WARN scenario"
  PROPOSAL=$(curl "${H[@]}" -X POST "$BASE/api/admin/training/scenarios/$WARN_ID/proposal")
  echo "$PROPOSAL" | python3 -m json.tool 2>/dev/null || echo "$PROPOSAL"
  echo ""
else
  echo "  No WARN/FAIL scenario found — all passed! Run with more scenarios or check batch."
fi

# ── 5. Grouped problems ───────────────────────────────────────────────────────
echo "▶ 8. Grouped problems (last 48h)"
PROBLEMS=$(curl "${H[@]}" "$BASE/api/admin/training/scenarios/problems")
echo "$PROBLEMS" | python3 -m json.tool 2>/dev/null || echo "$PROBLEMS"
echo ""

# ── 6. Proposals queue ────────────────────────────────────────────────────────
echo "▶ 9. Proposals queue (PENDING_APPROVAL)"
PROPS=$(curl "${H[@]}" "$BASE/api/admin/training/proposals?status=PENDING_APPROVAL")
echo "$PROPS" | python3 -m json.tool 2>/dev/null || echo "$PROPS"
echo ""

# ── 7. Summary ────────────────────────────────────────────────────────────────
echo "╔═══════════════════════════════════════════════════════════════════╗"
echo "║  Validation complete. Check output above for:                    ║"
echo "║  • Run status COMPLETED                                          ║"
echo "║  • sideEffectsPerformed: []                                      ║"
echo "║  • priceLookupScore on price scenario                            ║"
echo "║  • Proposal status = PENDING_APPROVAL                            ║"
echo "╚═══════════════════════════════════════════════════════════════════╝"
echo ""
