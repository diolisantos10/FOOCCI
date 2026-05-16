/**
 * POST /api/evolution/deep-probe
 *
 * OWNER-only. Definitive infrastructure diagnostic for Evolution API QR failures.
 *
 * This endpoint answers the single most important question:
 *   "Is the QR failure specific to the configured instance, or does it affect
 *    ALL new instances on this Evolution API server?"
 *
 * Steps:
 *   1. GET /  — version/health (no auth required by most Evolution versions)
 *   2. GET /instance/fetchInstances — inspect real instance state fields
 *   3. GET /instance/settings/find/{name} — instance settings (sanitized)
 *   4. Create a temporary fresh instance with a unique name
 *   5. Inspect temp create response for QR
 *   6. Wait 10 s → poll temp instance 3×5s for QR
 *   7. Delete temp instance (always, even on error)
 *   8. Return verdict: instance-specific OR server-wide
 *
 * Never returns apiKey, webhookSecret, or auth tokens.
 * Total expected runtime: ~30–40 seconds.
 */

import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { getTenantContext } from "@/lib/tenant";
import { EvolutionConfigService } from "@/services/evolution/EvolutionConfigService";
import { extractEvolutionQr, isCountOnlyResponse } from "@/lib/evolution/extractQr";
import { unauthorized, forbidden, serverError } from "@/lib/api-response";

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

async function tryGetQRImage(raw: unknown): Promise<{
  base64: string | null; text: string | null; source: string | null;
}> {
  const ex = extractEvolutionQr(raw);
  let base64 = ex.base64;
  let source = ex.foundIn;
  if (!base64 && ex.code) {
    try {
      base64 = await QRCode.toDataURL(ex.code, { margin: 1, width: 256 });
      source = `generated_from_code(${ex.foundIn ?? "code"})`;
    } catch { /* ignore */ }
  }
  return { base64, text: ex.code, source };
}

/** Probe a single endpoint — sanitized metadata only, never exposes QR image. */
async function probe(
  baseUrl: string,
  apiKey: string,
  method: string,
  path: string,
): Promise<{
  method: string; path: string; httpStatus: number;
  keys: string[]; isCountOnly: boolean; qrFound: boolean; error?: string;
}> {
  const meta = { method, path, httpStatus: 0, keys: [] as string[], isCountOnly: false, qrFound: false };
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
      method,
      headers: { "Content-Type": "application/json", apikey: apiKey },
    });
    meta.httpStatus = res.status;
    if (res.ok) {
      const body = await res.json().catch(() => ({})) as Record<string, unknown>;
      meta.keys        = Object.keys(body);
      meta.isCountOnly = isCountOnlyResponse(body);
      const qr = await tryGetQRImage(body);
      meta.qrFound = !!(qr.base64 || qr.text);
    }
  } catch (e) {
    return { ...meta, error: e instanceof Error ? e.message : String(e) };
  }
  return meta;
}

function buildShape(data: Record<string, unknown>): Record<string, string[]> {
  const shape: Record<string, string[]> = {};
  for (const k of Object.keys(data)) {
    const v = data[k];
    if (typeof v === "object" && v !== null && !Array.isArray(v)) {
      shape[k] = Object.keys(v as Record<string, unknown>);
    }
  }
  return shape;
}

export async function POST(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();
    if (ctx.role !== "OWNER") return forbidden("Diagnóstico profundo restrito ao proprietário.");

    const snapResult = await EvolutionConfigService.getSnapshot(ctx.restaurantId);
    if (!snapResult.ok) {
      return NextResponse.json(
        { success: false, error: "Evolution config não encontrado." },
        { status: 400 }
      );
    }

    const cfg     = snapResult.data;
    const baseUrl = cfg.baseUrl.replace(/\/$/, "");
    const apiKey  = cfg.apiKey;

    // ── Step 1: Version / health check ────────────────────────────────────────
    let versionInfo: Record<string, unknown> = {};
    let versionHttpStatus = 0;
    try {
      const res = await fetch(baseUrl, { method: "GET" });
      versionHttpStatus = res.status;
      if (res.ok) {
        const body = await res.json().catch(() => ({})) as Record<string, unknown>;
        // Sanitize: keep only non-sensitive string/number/boolean fields
        for (const [k, v] of Object.entries(body)) {
          const lower = k.toLowerCase();
          if (lower.includes("key") || lower.includes("token") || lower.includes("secret") || lower.includes("pass")) continue;
          if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
            versionInfo[k] = v;
          } else if (typeof v === "object" && v !== null && !Array.isArray(v)) {
            versionInfo[k] = Object.keys(v as Record<string, unknown>);
          }
        }
      }
    } catch (e) {
      versionInfo = { error: e instanceof Error ? e.message : String(e) };
    }

    // ── Step 2: Inspect configured instance via fetchInstances ─────────────────
    let configuredInstanceInfo: Record<string, unknown> | null = null;
    try {
      const res = await fetch(`${baseUrl}/instance/fetchInstances`, {
        method: "GET",
        headers: { apikey: apiKey },
      });
      if (res.ok) {
        const body = await res.json().catch(() => ({}));
        const list: unknown[] = Array.isArray(body) ? body : (body as Record<string, unknown[]>).instances ?? [];
        const found = list.find((item: unknown) => {
          if (typeof item !== "object" || !item) return false;
          const r = item as Record<string, unknown>;
          const inst = typeof r.instance === "object" ? r.instance as Record<string, unknown> : null;
          return (inst?.instanceName ?? r.instanceName) === cfg.instanceName;
        });
        if (found && typeof found === "object") {
          const r = found as Record<string, unknown>;
          const inst = typeof r.instance === "object" ? r.instance as Record<string, unknown> : r;
          // Return safe fields only — never apikey/token
          configuredInstanceInfo = {
            instanceName:      inst.instanceName,
            status:            inst.status,
            connectionStatus:  inst.connectionStatus,
            integration:       inst.integration,
            ownerJid:          inst.ownerJid ?? null,  // null = never authenticated
            profileName:       inst.profileName ?? null,
            hasOwner:          !!inst.ownerJid,
          };
        }
      }
    } catch { /* ignore */ }

    // ── Step 3: Instance settings ──────────────────────────────────────────────
    let instanceSettings: Record<string, unknown> = {};
    try {
      const res = await fetch(`${baseUrl}/instance/settings/find/${cfg.instanceName}`, {
        method: "GET",
        headers: { apikey: apiKey },
      });
      if (res.ok) {
        const body = await res.json().catch(() => ({})) as Record<string, unknown>;
        // Return all settings (none are sensitive)
        instanceSettings = body;
      }
    } catch { /* ignore */ }

    // ── Step 4–7: Temporary fresh instance lifecycle test ──────────────────────
    // This is the definitive test: creates a brand new instance (never connected before)
    // to determine if QR generation fails server-wide or only for this specific instance.
    const tempName      = `foocci-probe-${Date.now()}`;
    let tempCreated     = false;
    let tempCreateKeys: string[] = [];
    let tempCreateShape: Record<string, string[]> = {};
    let tempQrcodeShape: string[] = [];
    let tempQrcodeIsCountOnly = false;
    let tempCreateQRFound = false;
    const tempPollResults: Array<{ attempt: number; keys: string[]; isCountOnly: boolean; qrFound: boolean; httpStatus: number }> = [];
    let tempInstanceQRFound = false;
    let tempError: string | null = null;

    try {
      // 4a. Create temp instance — minimal payload, no webhook
      const createRes = await fetch(`${baseUrl}/instance/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: apiKey },
        body: JSON.stringify({
          instanceName: tempName,
          integration:  "WHATSAPP-BAILEYS",
          qrcode:       true,
        }),
      });

      if (createRes.ok) {
        tempCreated = true;
        const createBody = await createRes.json().catch(() => ({})) as Record<string, unknown>;
        tempCreateKeys  = Object.keys(createBody);
        tempCreateShape = buildShape(createBody);

        const qrcodeVal = createBody["qrcode"];
        if (typeof qrcodeVal === "object" && qrcodeVal !== null && !Array.isArray(qrcodeVal)) {
          tempQrcodeShape = Object.keys(qrcodeVal as Record<string, unknown>);
          tempQrcodeIsCountOnly = isCountOnlyResponse(qrcodeVal);
        }

        const tempCreateQR = await tryGetQRImage(createBody);
        tempCreateQRFound  = !!(tempCreateQR.base64 || tempCreateQR.text);

        // 4b. Wait 10 s before first poll (give Evolution time to establish Baileys socket)
        await sleep(10000);

        // 4c. Poll 3 × 5 s
        for (let attempt = 1; attempt <= 3 && !tempInstanceQRFound; attempt++) {
          const pollRes = await fetch(`${baseUrl}/instance/connect/${tempName}`, {
            method: "GET",
            headers: { "Content-Type": "application/json", apikey: apiKey },
          });
          const pollBody = await pollRes.json().catch(() => ({})) as Record<string, unknown>;
          const pollKeys = Object.keys(pollBody);
          const isCount  = isCountOnlyResponse(pollBody);
          const pollQR   = await tryGetQRImage(pollBody);
          const pollQRFound = !!(pollQR.base64 || pollQR.text);

          if (pollQRFound) tempInstanceQRFound = true;
          tempPollResults.push({
            attempt,
            keys: pollKeys,
            isCountOnly: isCount,
            qrFound: pollQRFound,
            httpStatus: pollRes.status,
          });

          if (!tempInstanceQRFound && attempt < 3) await sleep(5000);
        }
      } else {
        tempError = `Create failed: HTTP ${createRes.status}`;
      }
    } catch (e) {
      tempError = e instanceof Error ? e.message : String(e);
    } finally {
      // 7. Always delete the temp instance
      if (tempCreated) {
        try {
          await fetch(`${baseUrl}/instance/delete/${tempName}`, {
            method: "DELETE",
            headers: { apikey: apiKey },
          });
        } catch { /* ignore cleanup failure */ }
      }
    }

    // ── Verdict ────────────────────────────────────────────────────────────────
    const configuredInstanceStatus = configuredInstanceInfo?.status as string | undefined;
    const configuredHasOwner       = !!(configuredInstanceInfo?.hasOwner);

    let verdict: string;
    let verdictCode: "instance_specific" | "server_wide" | "inconclusive";
    let recommendation: string;

    if (tempError && !tempCreated) {
      verdict     = "Não foi possível criar instância temporária de teste.";
      verdictCode = "inconclusive";
      recommendation = `Erro ao criar instância de teste: ${tempError}. Verifique permissões da API Key ou se o Evolution está funcionando.`;
    } else if (tempInstanceQRFound || tempCreateQRFound) {
      verdict     = "✓ QR gerado com sucesso na instância de teste. O problema é ESPECÍFICO da instância configurada.";
      verdictCode = "instance_specific";
      recommendation = configuredHasOwner
        ? `A instância "${cfg.instanceName}" já foi autenticada anteriormente (ownerJid presente). O Baileys está tentando reconectar ao invés de gerar novo QR. SOLUÇÃO: troque o instanceName nas configurações (ex: "${cfg.instanceName}2") e salve. Ou entre em contato com o suporte Foocci para renomear a instância Evolution.`
        : `A instância "${cfg.instanceName}" tem estado corrompido. SOLUÇÃO: troque o instanceName nas configurações para um nome novo e salve — isso criará uma instância limpa que gerará QR normalmente.`;
    } else {
      verdict     = "✗ QR NÃO gerado nem na instância de teste. O problema é SERVER-WIDE — o servidor Evolution não consegue gerar QR para nenhuma instância.";
      verdictCode = "server_wide";
      recommendation = "Causa provável: o container Railway/Evolution não consegue abrir conexão WebSocket com servidores WhatsApp. Causas comuns: (1) IP do Railway bloqueado pelo WhatsApp — tente outro provedor ou use proxy residencial; (2) Evolution sem acesso a DNS externo — verifique firewall Railway; (3) Versão do Evolution/Baileys desatualizada — WhatsApp atualizou o protocolo; (4) Redis não configurado (se necessário para esta versão); (5) Variável QRCODE_LIMIT=0 ou zero nas env vars do Railway.";
    }

    return NextResponse.json({
      success:     true,
      probeVersion: "DEEP_PROBE_V1",
      instanceName: cfg.instanceName,

      // ── Evolution version ──────────────────────────────────────────────────
      evolutionVersion: { httpStatus: versionHttpStatus, info: versionInfo },

      // ── Configured instance state ──────────────────────────────────────────
      configuredInstance: configuredInstanceInfo,

      // ── Instance settings ──────────────────────────────────────────────────
      instanceSettings,

      // ── Temp instance lifecycle test ───────────────────────────────────────
      tempInstanceTest: {
        tempName,
        created:            tempCreated,
        createKeys:         tempCreateKeys,
        createShape:        tempCreateShape,
        qrcodeShape:        tempQrcodeShape,
        qrcodeIsCountOnly:  tempQrcodeIsCountOnly,
        createQRFound:      tempCreateQRFound,
        pollResults:        tempPollResults,
        qrFound:            tempInstanceQRFound,
        error:              tempError,
      },

      // ── Verdict ────────────────────────────────────────────────────────────
      verdict,
      verdictCode,
      recommendation,

      // ── Context for Railway config review ──────────────────────────────────
      railwayCheckList: [
        "Verifique QRCODE_LIMIT — deve ser ≥ 30 (padrão Evolution)",
        "Verifique LOG_BAILEYS — defina como 'debug' para ver erros Baileys nos logs Railway",
        "Verifique se o container tem acesso a web.whatsapp.com:443 e g.whatsapp.net:443",
        "Verifique DATABASE_ENABLED e DATABASE_CONNECTION_URI — necessários para persistir sessão",
        "Se REDIS_ENABLED=true, verifique REDIS_URI",
        "Verifique SERVER_URL — deve ser a URL pública da Evolution (usada no QR e webhooks)",
        "Verifique DEL_INSTANCE=false — se true, instâncias desconectadas são auto-deletadas",
        "Se o problema for server-wide: tente mudar a região Railway ou usar proxy SOCKS5 no Evolution",
      ],
    });

  } catch (err) {
    console.error("[POST /api/evolution/deep-probe]", err);
    return serverError();
  }
}
