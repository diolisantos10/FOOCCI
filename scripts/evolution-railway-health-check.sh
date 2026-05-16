#!/bin/bash
# ============================================================
# Evolution API — Railway Health Check
# Run INSIDE the Evolution API Railway container.
#
# Via Railway CLI:
#   railway run --service <evolution-service-name> -- bash /app/scripts/evolution-railway-health-check.sh
#
# Via Railway Dashboard:
#   Service → Settings → Shell → paste contents and run
# ============================================================

set -euo pipefail

OK="\033[0;32m OK\033[0m"
FAIL="\033[0;31m FAIL\033[0m"
WARN="\033[0;33m WARN\033[0m"
MISSING="\033[0;31m MISSING\033[0m"
SET="\033[0;32m SET\033[0m"

echo ""
echo "============================================================"
echo " Evolution API — Railway Health Check"
echo " $(date)"
echo "============================================================"
echo ""

# ── 1. Environment variables ────────────────────────────────────────────────
echo "── 1. Environment Variables ────────────────────────────────"
check_var() {
  local name="$1"
  local val="${!name:-}"
  local required="${2:-false}"
  if [ -z "$val" ]; then
    if [ "$required" = "true" ]; then
      echo -e "  ${name}:${MISSING} (required)"
    else
      echo -e "  ${name}:${WARN} not set (optional/has default)"
    fi
  else
    echo -e "  ${name}:${SET}"
  fi
}

check_var_value() {
  local name="$1"
  local val="${!name:-}"
  if [ -z "$val" ]; then
    echo -e "  ${name}: ${MISSING}"
  else
    echo -e "  ${name}: ${val}"
  fi
}

echo ""
echo "  Server:"
check_var_value SERVER_URL
check_var_value SERVER_PORT

echo ""
echo "  QR Code:"
check_var_value QRCODE_LIMIT
check_var_value QRCODE_COLOR

echo ""
echo "  Session / Baileys:"
check_var_value CONFIG_SESSION_PHONE_CLIENT
check_var_value CONFIG_SESSION_PHONE_NAME
check_var_value CONFIG_SESSION_PHONE_VERSION

echo ""
echo "  Logs:"
check_var_value LOG_LEVEL
check_var_value LOG_BAILEYS

echo ""
echo "  Instance lifecycle:"
check_var_value DEL_INSTANCE

echo ""
echo "  Database:"
check_var_value DATABASE_ENABLED
if [ -n "${DATABASE_CONNECTION_URI:-}" ]; then
  # Mask password in URI — show scheme + host only
  masked=$(echo "${DATABASE_CONNECTION_URI}" | sed 's/:[^:@]*@/:****@/' | cut -c1-60)
  echo -e "  DATABASE_CONNECTION_URI: ${masked}..."
else
  echo -e "  DATABASE_CONNECTION_URI:${MISSING}"
fi
check_var_value DATABASE_SAVE_DATA_INSTANCE
check_var_value DATABASE_SAVE_DATA_NEW_MESSAGE
check_var_value DATABASE_SAVE_MESSAGE_UPDATE
check_var_value DATABASE_SAVE_DATA_CONTACTS
check_var_value DATABASE_SAVE_DATA_CHATS
check_var_value DATABASE_SAVE_DATA_LABELS
check_var_value DATABASE_SAVE_DATA_HISTORIC

echo ""
echo "  Cache / Redis:"
check_var_value CACHE_REDIS_ENABLED
check_var_value CACHE_LOCAL_ENABLED
if [ "${CACHE_REDIS_ENABLED:-false}" = "true" ]; then
  if [ -n "${CACHE_REDIS_URI:-}" ]; then
    redis_masked=$(echo "${CACHE_REDIS_URI}" | sed 's/:[^:@]*@/:****@/' | cut -c1-50)
    echo -e "  CACHE_REDIS_URI: ${redis_masked}"
  else
    echo -e "  CACHE_REDIS_URI:${MISSING} (CACHE_REDIS_ENABLED=true but URI not set!)"
  fi
fi

echo ""
# ── 2. DNS resolution ───────────────────────────────────────────────────────
echo "── 2. DNS Resolution ───────────────────────────────────────"
dns_check() {
  local host="$1"
  printf "  %-35s" "${host}:"
  if curl -s --connect-timeout 3 --max-time 5 -o /dev/null "https://${host}" 2>/dev/null; then
    echo -e "${OK}"
  else
    # try lower-level
    if getent hosts "${host}" &>/dev/null 2>&1; then
      echo -e " DNS OK (TCP may be blocked)"
    else
      echo -e "${FAIL} (DNS failed)"
    fi
  fi
}
dns_check "web.whatsapp.com"
dns_check "g.whatsapp.net"
dns_check "mmg.whatsapp.net"
dns_check "static.whatsapp.net"

echo ""
# ── 3. HTTPS connectivity ───────────────────────────────────────────────────
echo "── 3. HTTPS Connectivity ───────────────────────────────────"
https_check() {
  local url="$1"
  printf "  %-50s" "${url}:"
  status=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 --max-time 10 "${url}" 2>/dev/null || echo "ERR")
  if [ "$status" = "ERR" ] || [ "$status" = "000" ]; then
    echo -e "${FAIL}"
  else
    echo -e " HTTP ${status}${OK}"
  fi
}
https_check "https://web.whatsapp.com"
https_check "https://g.whatsapp.net"
https_check "https://static.whatsapp.net"

echo ""
# ── 4. WebSocket upgrade test ───────────────────────────────────────────────
echo "── 4. WebSocket Upgrade (TCP to :443) ──────────────────────"
ws_check() {
  local host="$1"
  local port="${2:-443}"
  printf "  %-40s" "TCP ${host}:${port}:"
  # Test if we can open a TCP connection
  timeout 5 bash -c "cat < /dev/null > /dev/tcp/${host}/${port}" 2>/dev/null \
    && echo -e "${OK}" \
    || echo -e "${FAIL} (connection refused or timeout)"
}
ws_check "web.whatsapp.com" 443
ws_check "g.whatsapp.net" 443

echo ""
# ── 5. Database ping ────────────────────────────────────────────────────────
echo "── 5. Database ─────────────────────────────────────────────"
if [ "${DATABASE_ENABLED:-false}" = "true" ]; then
  if [ -n "${DATABASE_CONNECTION_URI:-}" ]; then
    if command -v node &>/dev/null; then
      printf "  PostgreSQL connection: "
      node -e "
const { Client } = require('pg');
const c = new Client({ connectionString: process.env.DATABASE_CONNECTION_URI });
c.connect().then(() => { console.log('OK'); c.end(); }).catch(e => { console.log('FAIL: ' + e.message.split('\\n')[0]); process.exit(1); });
" 2>/dev/null && echo "" || true
    else
      echo "  node not found — skipping DB test"
    fi
  else
    echo -e "  DATABASE_CONNECTION_URI not set${MISSING}"
  fi
else
  echo "  DATABASE_ENABLED != true — skipping"
fi

echo ""
# ── 6. Redis ping ───────────────────────────────────────────────────────────
echo "── 6. Redis ────────────────────────────────────────────────"
if [ "${CACHE_REDIS_ENABLED:-false}" = "true" ]; then
  if [ -n "${CACHE_REDIS_URI:-}" ]; then
    if command -v redis-cli &>/dev/null; then
      printf "  Redis PING: "
      redis-cli -u "${CACHE_REDIS_URI}" PING 2>/dev/null | head -1 || echo "FAIL"
    else
      printf "  TCP to redis host: "
      redis_host=$(echo "${CACHE_REDIS_URI}" | sed 's|.*@||' | cut -d: -f1 | tr -d '/')
      redis_port=$(echo "${CACHE_REDIS_URI}" | sed 's|.*@||' | cut -d: -f2 | cut -d/ -f1)
      timeout 3 bash -c "cat < /dev/null > /dev/tcp/${redis_host}/${redis_port:-6379}" 2>/dev/null \
        && echo -e "${OK}" || echo -e "${FAIL}"
    fi
  else
    echo -e "  CACHE_REDIS_URI not set${MISSING}"
  fi
else
  echo "  CACHE_REDIS_ENABLED != true — skipping"
fi

echo ""
# ── 7. Node / Evolution version ─────────────────────────────────────────────
echo "── 7. Runtime ──────────────────────────────────────────────"
printf "  Node.js: "
node --version 2>/dev/null || echo "not found"
printf "  npm:     "
npm --version 2>/dev/null || echo "not found"
if [ -f /app/package.json ]; then
  printf "  Evolution version (package.json): "
  node -p "require('/app/package.json').version" 2>/dev/null || echo "—"
fi

echo ""
echo "============================================================"
echo " DIAGNÓSTICO COMPLETO"
echo "============================================================"
echo ""
echo "Se todas as verificações de rede falharam para WhatsApp:"
echo "  → IP Railway/GCP está bloqueado pelo WhatsApp."
echo "  → Solução: proxy residencial ou mudar de provedor."
echo ""
echo "Se rede OK mas QR não gera — verifique nos logs da Evolution:"
echo "  railway logs --service <evolution> | grep -iE 'baileys|qr|error|close|version'"
echo ""
echo "Variáveis críticas que podem estar causando { count } sem QR:"
echo "  1. CONFIG_SESSION_PHONE_VERSION — remova ou set para versão atual WhatsApp"
echo "  2. QRCODE_LIMIT=0 ou ausente — set QRCODE_LIMIT=30"
echo "  3. LOG_BAILEYS=debug — ative para ver o erro real"
echo ""
