/**
 * POST /api/evolution/env-audit
 *
 * OWNER-only. Returns a structured audit of Evolution API v2.2.3 environment
 * variable requirements, prioritised for the known symptom:
 * "POST /instance/create and GET /instance/connect both return { count } only".
 *
 * This endpoint cannot read the Evolution server's actual env vars — those
 * are only visible inside the Railway container. It provides:
 *   - What env vars are required by Evolution v2.2.3
 *   - Which are most likely missing given the { count } symptom
 *   - Exact Railway variable names and recommended values
 *   - Upgrade recommendation if env fix is insufficient
 *   - Log grep patterns to use after setting LOG_BAILEYS=debug
 *
 * Never exposes apiKey, webhookSecret, or auth tokens.
 */

import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { EvolutionConfigService } from "@/services/evolution/EvolutionConfigService";
import { unauthorized, forbidden, serverError } from "@/lib/api-response";

interface EnvVar {
  name:        string;
  recommended: string;
  description: string;
  impact:      "critical" | "high" | "medium" | "low";
  missingEffect: string;
}

interface EnvFix {
  priority:   number;
  variable:   string;
  action:     "SET" | "SET_OR_REMOVE" | "VERIFY";
  value?:     string;
  reason:     string;
  railwayHow: string;
}

function maskUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.hostname}`;
  } catch {
    return url.slice(0, 40) + "…";
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();
    if (ctx.role !== "OWNER") return forbidden("Auditoria restrita ao proprietário.");

    const snapResult = await EvolutionConfigService.getSnapshot(ctx.restaurantId);
    if (!snapResult.ok) {
      return NextResponse.json(
        { success: false, error: "Evolution config não encontrado." },
        { status: 400 }
      );
    }

    const cfg = snapResult.data;

    // ── Check Evolution version from GET / ───────────────────────────────────
    let evolutionVersion = "unknown";
    let versionHttpStatus = 0;
    let versionFields: string[] = [];
    try {
      const res = await fetch(cfg.baseUrl.replace(/\/$/, ""), { method: "GET" });
      versionHttpStatus = res.status;
      if (res.ok) {
        const body = await res.json().catch(() => ({})) as Record<string, unknown>;
        versionFields = Object.keys(body);
        if (typeof body.version === "string") evolutionVersion = body.version;
        else if (typeof body.Version === "string") evolutionVersion = body.Version;
      }
    } catch { /* ignore */ }

    // ── Prioritised fixes for "qrcode.count only" symptom ───────────────────
    const prioritisedFixes: EnvFix[] = [
      {
        priority:   1,
        variable:   "LOG_BAILEYS",
        action:     "SET",
        value:      "debug",
        reason:     "Without Baileys debug logs, the root cause is invisible. Set this FIRST so Railway logs show the exact WebSocket/connection error during QR generation.",
        railwayHow: "Railway Dashboard → Evolution API service → Variables → Add: LOG_BAILEYS = debug → then redeploy and check logs.",
      },
      {
        priority:   2,
        variable:   "LOG_LEVEL",
        action:     "SET",
        value:      "DEBUG",
        reason:     "Enables verbose server-level logging alongside Baileys debug. Pair with LOG_BAILEYS=debug.",
        railwayHow: "Railway Variables → LOG_LEVEL = DEBUG",
      },
      {
        priority:   3,
        variable:   "QRCODE_LIMIT",
        action:     "SET",
        value:      "30",
        reason:     "If QRCODE_LIMIT is 0 or missing, Evolution does not allow QR generation. qrcode.count appears but no QR is ever created.",
        railwayHow: "Railway Variables → QRCODE_LIMIT = 30",
      },
      {
        priority:   4,
        variable:   "CONFIG_SESSION_PHONE_VERSION",
        action:     "SET_OR_REMOVE",
        value:      "2.3000.1015901307",
        reason:     "Evolution v2.2.3 was released in 2023 with an older Baileys that may use a WhatsApp Web version WhatsApp has since deprecated. If WhatsApp rejects the protocol version, Baileys never receives the QR challenge — the instance stays in 'connecting' with only { count }. Either remove this variable entirely (to use Baileys built-in default) or set it to a current value.",
        railwayHow: "Railway Variables → CONFIG_SESSION_PHONE_VERSION = 2.3000.1015901307  OR  delete the variable to use the Baileys default for your installed version.",
      },
      {
        priority:   5,
        variable:   "CONFIG_SESSION_PHONE_CLIENT",
        action:     "SET",
        value:      "Evolution API",
        reason:     "Baileys uses this as the browser/client name reported to WhatsApp. Missing can cause handshake issues.",
        railwayHow: "Railway Variables → CONFIG_SESSION_PHONE_CLIENT = Evolution API",
      },
      {
        priority:   6,
        variable:   "CONFIG_SESSION_PHONE_NAME",
        action:     "SET",
        value:      "Chrome",
        reason:     "Paired with CONFIG_SESSION_PHONE_CLIENT. Baileys identifies itself to WhatsApp as 'Evolution API on Chrome'.",
        railwayHow: "Railway Variables → CONFIG_SESSION_PHONE_NAME = Chrome",
      },
      {
        priority:   7,
        variable:   "SERVER_URL",
        action:     "VERIFY",
        value:      cfg.baseUrl,
        reason:     "Must be the publicly accessible URL of the Evolution API service. Used internally for QR code generation and webhook registration.",
        railwayHow: "Railway Variables → SERVER_URL = (the public URL of your Evolution Railway service, e.g. https://evolution-api-production-636c.up.railway.app)",
      },
      {
        priority:   8,
        variable:   "DATABASE_ENABLED",
        action:     "SET",
        value:      "true",
        reason:     "If false, Evolution uses in-memory storage only. Session data is lost on restart, preventing stable Baileys connections.",
        railwayHow: "Railway Variables → DATABASE_ENABLED = true",
      },
      {
        priority:   9,
        variable:   "DATABASE_SAVE_DATA_INSTANCE",
        action:     "SET",
        value:      "true",
        reason:     "Required to persist instance state across Evolution restarts.",
        railwayHow: "Railway Variables → DATABASE_SAVE_DATA_INSTANCE = true",
      },
      {
        priority:   10,
        variable:   "CACHE_REDIS_ENABLED",
        action:     "SET",
        value:      "false",
        reason:     "If set to true but Redis is not actually configured (CACHE_REDIS_URI missing or wrong), Evolution may fail silently when managing QR state. Set to false unless you have Redis.",
        railwayHow: "Railway Variables → CACHE_REDIS_ENABLED = false  (unless you have a Redis service configured)",
      },
      {
        priority:   11,
        variable:   "CACHE_LOCAL_ENABLED",
        action:     "SET",
        value:      "true",
        reason:     "Enables in-memory LRU cache as fallback when Redis is disabled.",
        railwayHow: "Railway Variables → CACHE_LOCAL_ENABLED = true",
      },
      {
        priority:   12,
        variable:   "DEL_INSTANCE",
        action:     "SET",
        value:      "false",
        reason:     "If true, Evolution auto-deletes instances that disconnect — meaning after a QR scan timeout, the instance disappears and the user must reconfigure from scratch.",
        railwayHow: "Railway Variables → DEL_INSTANCE = false",
      },
    ];

    // ── Full required var list ─────────────────────────────────────────────
    const allRequiredVars: EnvVar[] = [
      { name: "SERVER_URL",                      recommended: cfg.baseUrl,                      impact: "critical", description: "Public URL of this Evolution API service",                                      missingEffect: "QR codes, webhooks, and callbacks will use wrong base URL" },
      { name: "AUTHENTICATION_TYPE",             recommended: "apikey",                         impact: "critical", description: "Authentication method",                                                         missingEffect: "All requests will fail authentication" },
      { name: "AUTHENTICATION_API_KEY",          recommended: "(current key — already set)",    impact: "critical", description: "Global API key for Evolution API access",                                      missingEffect: "All requests rejected" },
      { name: "QRCODE_LIMIT",                    recommended: "30",                             impact: "critical", description: "Max QR codes per instance",                                                   missingEffect: "0 or missing → QR generation disabled → { count } only" },
      { name: "LOG_BAILEYS",                     recommended: "error (prod) / debug (debug)",   impact: "high",     description: "Baileys WebSocket client log level",                                          missingEffect: "Cannot see Baileys connection errors in Railway logs" },
      { name: "LOG_LEVEL",                       recommended: "ERROR (prod) / DEBUG (debug)",   impact: "medium",   description: "Server log level",                                                             missingEffect: "Errors may not appear in Railway logs" },
      { name: "CONFIG_SESSION_PHONE_CLIENT",     recommended: "Evolution API",                  impact: "high",     description: "Browser client name reported to WhatsApp",                                    missingEffect: "Baileys may use a generic name that WhatsApp rejects" },
      { name: "CONFIG_SESSION_PHONE_NAME",       recommended: "Chrome",                         impact: "high",     description: "Browser name for WhatsApp session",                                           missingEffect: "Handshake may fail if WhatsApp doesn't recognize the browser" },
      { name: "CONFIG_SESSION_PHONE_VERSION",    recommended: "2.3000.1015901307 (or remove)",  impact: "critical", description: "WhatsApp Web protocol version Baileys reports. MUST be a version WhatsApp still accepts in 2025", missingEffect: "If outdated, WhatsApp rejects the WebSocket → no QR ever generated" },
      { name: "DATABASE_ENABLED",                recommended: "true",                           impact: "high",     description: "Enable PostgreSQL persistence",                                               missingEffect: "Sessions lost on restart, instance state not reliable" },
      { name: "DATABASE_CONNECTION_URI",         recommended: "(PostgreSQL connection string)",  impact: "critical", description: "PostgreSQL URL",                                                              missingEffect: "All database operations fail" },
      { name: "DATABASE_SAVE_DATA_INSTANCE",     recommended: "true",                           impact: "high",     description: "Persist instance state to DB",                                               missingEffect: "Instance config lost on restart" },
      { name: "DATABASE_SAVE_DATA_NEW_MESSAGE",  recommended: "true",                           impact: "medium",   description: "Persist incoming messages",                                                   missingEffect: "Messages not stored" },
      { name: "DATABASE_SAVE_MESSAGE_UPDATE",    recommended: "true",                           impact: "medium",   description: "Persist message status updates",                                              missingEffect: "Delivery receipts not tracked" },
      { name: "DATABASE_SAVE_DATA_CONTACTS",     recommended: "true",                           impact: "medium",   description: "Persist contacts",                                                            missingEffect: "Contact list not saved" },
      { name: "DATABASE_SAVE_DATA_CHATS",        recommended: "true",                           impact: "medium",   description: "Persist chat list",                                                           missingEffect: "Chat history not saved" },
      { name: "DATABASE_SAVE_DATA_LABELS",       recommended: "true",                           impact: "low",      description: "Persist WhatsApp labels",                                                    missingEffect: "Labels not saved" },
      { name: "DATABASE_SAVE_DATA_HISTORIC",     recommended: "true",                           impact: "medium",   description: "Persist message history",                                                    missingEffect: "Historic messages not saved" },
      { name: "CACHE_REDIS_ENABLED",             recommended: "false",                          impact: "high",     description: "Enable Redis cache. Only set true if Redis service is configured",           missingEffect: "If true without Redis URI → Evolution fails when accessing cache" },
      { name: "CACHE_LOCAL_ENABLED",             recommended: "true",                           impact: "medium",   description: "Enable in-memory LRU cache (fallback when Redis disabled)",                 missingEffect: "No caching — slightly slower but functional" },
      { name: "DEL_INSTANCE",                    recommended: "false",                          impact: "high",     description: "Auto-delete disconnected instances",                                         missingEffect: "If true → instance deleted after QR timeout, requires full reconfiguration" },
    ];

    // ── Upgrade recommendation ────────────────────────────────────────────
    const upgradeRecommendation = {
      needed: evolutionVersion === "2.2.3" || evolutionVersion === "unknown",
      reason: "Evolution v2.2.3 was released in 2023 with Baileys v5.x that may use WhatsApp Web protocol versions WhatsApp deprecated in 2024–2025. The latest Evolution v2.x uses updated Baileys that auto-fetches the current WhatsApp Web version, eliminating CONFIG_SESSION_PHONE_VERSION compatibility issues.",
      currentVersion: evolutionVersion,
      recommendedVersion: "latest v2.x (check https://github.com/EvolutionAPI/evolution-api/releases)",
      railwayUpgradePath: [
        "1. On Railway: Evolution API service → Settings → Source → Docker Image",
        "2. Change the image tag from a fixed version to 'latest' or the current stable tag (e.g. atendai/evolution-api:latest)",
        "3. Redeploy the service",
        "4. Verify GET / returns a version ≥ 2.7.x",
        "5. The instanceName 'sushicazza' can remain — Evolution migrates existing instances on startup",
        "IMPORTANT: Back up your DATABASE_CONNECTION_URI and AUTHENTICATION_API_KEY before upgrading",
      ],
      riskLevel: "low" as const,
      riskNote: "API schema changes between minor versions are backward-compatible. The /instance/create, /instance/connect, and webhook endpoints remain stable across v2.x.",
    };

    // ── Log grep patterns for after enabling LOG_BAILEYS=debug ────────────
    const logPatterns = {
      command: "railway logs --service <evolution-service-name>",
      patterns: [
        { grep: "Connection Closed", meaning: "WhatsApp closed the WebSocket — likely version/IP rejection" },
        { grep: "Connecting to WA Web", meaning: "Baileys is attempting to connect" },
        { grep: "QR", meaning: "QR generation attempt" },
        { grep: "Error\\|error", meaning: "Any error during connection" },
        { grep: "version", meaning: "Shows which WA Web version Baileys is using" },
        { grep: "Stream Errored", meaning: "WebSocket stream error — often version mismatch" },
        { grep: "connection.update", meaning: "Connection state changes" },
      ],
      railwayCLI: [
        "# Install: npm install -g @railway/cli",
        "# Login: railway login",
        "# View logs: railway logs --service evolution-api",
        "# Search: railway logs --service evolution-api | grep -i 'qr\\|error\\|baileys\\|version'",
      ],
    };

    return NextResponse.json({
      success: true,
      auditVersion: "ENV_AUDIT_V1",
      instanceName: cfg.instanceName,
      evolutionBaseUrl: maskUrl(cfg.baseUrl),
      evolutionVersion: { detected: evolutionVersion, httpStatus: versionHttpStatus, responseFields: versionFields },
      symptom: "qrcode_count_only_server_wide",

      prioritisedFixes,
      allRequiredVars,
      upgradeRecommendation,
      logPatterns,

      summary: {
        step1: "Imediato: Adicione LOG_BAILEYS=debug + QRCODE_LIMIT=30 no Railway → redeploy → leia os logs.",
        step2: "Se LOG_BAILEYS mostrar erro de versão/protocolo: remova CONFIG_SESSION_PHONE_VERSION ou set 2.3000.1015901307.",
        step3: "Se logs mostrarem 'Connection Closed' ou 'Stream Errored' mesmo com versão correta: IP Railway bloqueado pelo WhatsApp → mude de provedor ou use proxy residencial.",
        step4: "Solução definitiva: atualize Evolution para latest v2.x → Baileys atualizado resolve a maioria dos problemas de compatibilidade.",
        scriptToRun: "scripts/evolution-railway-health-check.sh — execute dentro do container Evolution via Railway shell para testar DNS/rede/env.",
      },
    });

  } catch (err) {
    console.error("[POST /api/evolution/env-audit]", err);
    return serverError();
  }
}
