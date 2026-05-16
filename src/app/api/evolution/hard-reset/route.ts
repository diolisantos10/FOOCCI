/**
 * POST /api/evolution/hard-reset
 *
 * OWNER-only. Hard reset of the Evolution instance with multi-strategy QR capture:
 *   1. Logout + delete (best-effort)
 *   2. Wait 1.5 s
 *   3. POST /instance/create (qrcode:true, WHATSAPP-BAILEYS, with webhook)
 *   4. Extract QR from create response — base64 or text-code → PNG via qrcode lib
 *   5. If QR found → return immediately
 *   6. If create returns qrcode.count only (no image/code):
 *      a. Delete (best-effort) + wait 1.5 s
 *      b. POST /instance/create again WITHOUT webhook (minimal payload)
 *      c. Extract QR from alt create response
 *      d. If QR found → return immediately
 *   7. Poll 12 × 5 s = 60 s, trying 4 endpoints per round:
 *      GET /instance/connect, GET /instance/qrcode, GET /qrcode/base64, POST /instance/connect
 *   8. Deactivate in DB
 *   9. Return full diagnostic with qrcode_shape, endpoint_results, recommendation
 *
 * Never returns apiKey, webhookSecret, or auth tokens.
 * OWNER-only endpoint — qr_base64 is safe to return directly.
 */

import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { getTenantContext } from "@/lib/tenant";
import { EvolutionConfigService } from "@/services/evolution/EvolutionConfigService";
import { EvolutionClient, EvolutionApiError } from "@/lib/evolution/EvolutionClient";
import { extractEvolutionQr, isCountOnlyResponse } from "@/lib/evolution/extractQr";
import { unauthorized, forbidden, serverError } from "@/lib/api-response";

const QR_FLOW_VERSION = "MULTI_ENDPOINT_V3" as const;

interface StepResult {
  step:   string;
  ok:     boolean;
  data?:  unknown;
  error?: string;
}

export interface EndpointAttempt {
  method:      string;
  path:        string;
  httpStatus:  number;
  keys:        string[];
  qrFound:     boolean;
  isCountOnly: boolean;
  error?:      string;
}

export interface PollRound {
  round:     number;
  endpoints: EndpointAttempt[];
  qrFound:   boolean;
}

async function safeStep(label: string, fn: () => Promise<unknown>): Promise<StepResult> {
  try {
    const data = await fn();
    return { step: label, ok: true, data };
  } catch (err) {
    const msg = err instanceof EvolutionApiError
      ? `HTTP ${err.status}: ${JSON.stringify(err.body)}`
      : err instanceof Error ? err.message : String(err);
    return { step: label, ok: false, error: msg };
  }
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

async function tryGetQRImage(raw: unknown): Promise<{
  base64:  string | null;
  text:    string | null;
  pairing: string | null;
  source:  string | null;
}> {
  const extracted = extractEvolutionQr(raw);
  let base64 = extracted.base64;
  let source = extracted.foundIn;

  if (!base64 && extracted.code) {
    try {
      base64 = await QRCode.toDataURL(extracted.code, { margin: 1, width: 256 });
      source = `generated_from_code(${extracted.foundIn ?? "code"})`;
    } catch { /* ignore */ }
  }

  return { base64, text: extracted.code, pairing: extracted.pairingCode, source };
}

/** Build a shape map for diagnostics: top-level keys → their nested keys. Never includes values. */
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

/** Probe one raw endpoint. Never throws. Returns sanitized metadata. */
async function probeEndpoint(
  baseUrl: string,
  apiKey: string,
  method: string,
  path: string,
): Promise<EndpointAttempt & { qr: Awaited<ReturnType<typeof tryGetQRImage>> | null }> {
  const ep: EndpointAttempt & { qr: Awaited<ReturnType<typeof tryGetQRImage>> | null } = {
    method, path, httpStatus: 0, keys: [], qrFound: false, isCountOnly: false, qr: null,
  };
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
      method,
      headers: { "Content-Type": "application/json", apikey: apiKey },
    });
    ep.httpStatus = res.status;
    if (res.ok) {
      const body = await res.json().catch(() => ({})) as Record<string, unknown>;
      ep.keys        = Object.keys(body);
      ep.isCountOnly = isCountOnlyResponse(body);
      ep.qr          = await tryGetQRImage(body);
      ep.qrFound     = !!(ep.qr.base64 || ep.qr.pairing);
    }
  } catch (e) {
    ep.error = e instanceof Error ? e.message : String(e);
  }
  return ep;
}

export async function POST(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();
    if (ctx.role !== "OWNER") return forbidden("Apenas o proprietário pode executar reset.");

    const snapResult = await EvolutionConfigService.getSnapshot(ctx.restaurantId, true);
    if (!snapResult.ok) {
      return NextResponse.json(
        { success: false, error: "Evolution config não encontrado." },
        { status: 400 }
      );
    }

    const cfg = snapResult.data;
    const webhookUrl = `${
      process.env.NEXTAUTH_URL ??
      process.env.NEXT_PUBLIC_APP_URL ??
      "https://foocci.com.br"
    }/api/webhooks/evolution`;

    const steps: StepResult[] = [];

    // ── 1. Logout + Delete (best-effort) ──────────────────────────────────────
    steps.push(await safeStep("logout", () => EvolutionClient.logoutInstance(cfg)));
    const deleteStep = await safeStep("delete", () => EvolutionClient.deleteInstance(cfg));
    steps.push(deleteStep);
    await sleep(1500);

    // ── 2. Create PRIMARY (with webhook) ──────────────────────────────────────
    const createPrimaryStep = await safeStep("create_primary", () =>
      EvolutionClient.createInstance(cfg, {
        instanceName:    cfg.instanceName,
        integration:     "WHATSAPP-BAILEYS",
        webhookUrl,
        webhookByEvents: true,
        webhookEvents:   ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "CONNECTION_UPDATE"],
        webhookSecret:   cfg.webhookSecret,
      })
    );
    steps.push(createPrimaryStep);

    if (!createPrimaryStep.ok) {
      return NextResponse.json({
        success:       false,
        qrFlowVersion: QR_FLOW_VERSION,
        stage:         "create_primary_failed",
        error:         "Falha ao recriar instância Evolution.",
        detail:        createPrimaryStep.error,
        failedSteps:   steps.filter((s) => !s.ok).map((s) => `${s.step}: ${s.error ?? ""}`),
      });
    }

    // ── 3. Inspect primary create response ────────────────────────────────────
    const primaryData = createPrimaryStep.data as Record<string, unknown> | null;
    const createKeys  = primaryData ? Object.keys(primaryData) : [];
    const createShape = primaryData ? buildShape(primaryData) : {};

    // Detailed qrcode field inspection
    const qrcodeValue   = primaryData?.["qrcode"];
    const qrcodeShape   = (typeof qrcodeValue === "object" && qrcodeValue !== null && !Array.isArray(qrcodeValue))
      ? Object.keys(qrcodeValue as Record<string, unknown>)
      : typeof qrcodeValue === "string" ? ["<string>"] : [];
    const qrcodeIsCount = isCountOnlyResponse(qrcodeValue) ||
      (qrcodeShape.length === 1 && qrcodeShape[0] === "count");

    const primaryQR = primaryData ? await tryGetQRImage(primaryData) : null;

    let finalBase64  = primaryQR?.base64  ?? null;
    let finalText    = primaryQR?.text    ?? null;
    let finalPairing = primaryQR?.pairing ?? null;
    let finalSource  = primaryQR?.source  ?? null;
    let qrFound      = !!(finalBase64 || finalPairing);
    let stage        = qrFound ? "create_primary_qr" : "create_primary_count_only";

    // ── 4. If primary is count-only → Alt Create (no webhook) ─────────────────
    let altCreateKeys:  string[] = [];
    let altCreateShape: Record<string, string[]> = {};

    if (!qrFound && qrcodeIsCount) {
      // Delete the count-only instance before retry
      steps.push(await safeStep("delete_before_alt", () => EvolutionClient.deleteInstance(cfg)));
      await sleep(1500);

      const createAltStep = await safeStep("create_alt_no_webhook", () =>
        EvolutionClient.createInstance(cfg, {
          instanceName: cfg.instanceName,
          integration:  "WHATSAPP-BAILEYS",
          // No webhook — minimal payload to eliminate webhook validation as a failure cause
        })
      );
      steps.push(createAltStep);

      if (createAltStep.ok) {
        const altData = createAltStep.data as Record<string, unknown> | null;
        altCreateKeys  = altData ? Object.keys(altData) : [];
        altCreateShape = altData ? buildShape(altData) : {};

        const altQR = altData ? await tryGetQRImage(altData) : null;
        if (altQR?.base64 || altQR?.pairing) {
          finalBase64  = altQR.base64;
          finalText    = altQR.text;
          finalPairing = altQR.pairing;
          finalSource  = `alt_create:${altQR.source ?? "unknown"}`;
          qrFound      = true;
          stage        = "create_alt_qr";
        } else {
          stage = "create_alt_count_only";
        }
      }
    }

    // ── 5. Poll — 12 rounds × 5 s = 60 s, trying 4 endpoints per round ────────
    const pollRounds: PollRound[] = [];

    if (!qrFound) {
      const QR_PATHS: Array<{ method: string; path: string }> = [
        { method: "GET",  path: `/instance/connect/${cfg.instanceName}` },
        { method: "GET",  path: `/instance/qrcode/${cfg.instanceName}` },
        { method: "GET",  path: `/qrcode/base64/${cfg.instanceName}` },
        { method: "POST", path: `/instance/connect/${cfg.instanceName}` },
      ];

      for (let round = 1; round <= 12 && !qrFound; round++) {
        await sleep(5000);

        const roundEndpoints: EndpointAttempt[] = [];
        let roundQRFound = false;

        for (const ep of QR_PATHS) {
          const result = await probeEndpoint(cfg.baseUrl, cfg.apiKey, ep.method, ep.path);

          if (result.qrFound && result.qr && !qrFound) {
            finalBase64  = result.qr.base64;
            finalText    = result.qr.text;
            finalPairing = result.qr.pairing;
            finalSource  = `poll_r${round}:${ep.method}:${ep.path}:${result.qr.source ?? ""}`;
            qrFound      = true;
            stage        = "poll_qr_found";
            roundQRFound = true;
          }

          // Strip qr from stored result to avoid storing base64 in memory
          const { qr: _qr, ...epMeta } = result;
          roundEndpoints.push(epMeta);

          if (qrFound) break;
        }

        pollRounds.push({ round, endpoints: roundEndpoints, qrFound: roundQRFound });
      }

      if (!qrFound) stage = "all_endpoints_count_only";
    }

    // ── 6. Deactivate in DB ────────────────────────────────────────────────────
    await EvolutionConfigService.deactivate(ctx.restaurantId);

    // ── 7. Build recommendation ────────────────────────────────────────────────
    const allCountOnly = pollRounds.length > 0 && pollRounds.every((r) =>
      r.endpoints.every((e) => e.isCountOnly || e.httpStatus === 0 || e.httpStatus >= 400)
    );

    const recommendation = qrFound
      ? null
      : allCountOnly || qrcodeIsCount
        ? "A Evolution API retornou apenas qrcode.count — sem base64/code. Isso indica que a instância está em 'connecting' mas sem QR disponível via HTTP. Causas comuns: (1) Evolution não consegue alcançar servidores WhatsApp (verifique firewall/Railway), (2) A instância precisa de mais tempo — aguarde e tente novamente, (3) Versão da Evolution não suporta QR via HTTP GET — consulte suporte Foocci."
        : "Nenhum endpoint retornou QR. Verifique conectividade da Evolution e tente novamente.";

    const failedSteps = steps.filter((s) => !s.ok).map((s) => `${s.step}: ${s.error ?? ""}`);

    return NextResponse.json({
      ok:            true,
      success:       true,
      action:        "hard_reset_multi_endpoint",
      qrFlowVersion: QR_FLOW_VERSION,
      instanceName:  cfg.instanceName,
      stage,
      // ── QR result ─────────────────────────────────────────────────────────
      qr_found:   qrFound,
      qr_base64:  finalBase64,
      qr_text:    finalText,
      qr_source:  finalSource,
      // ── Create response diagnostics ────────────────────────────────────────
      create_response_keys:  createKeys,
      create_response_shape: createShape,
      qrcode_shape:          qrcodeShape,
      qrcode_is_count_only:  qrcodeIsCount,
      alt_create_keys:       altCreateKeys,
      alt_create_shape:      altCreateShape,
      // ── Poll diagnostics ───────────────────────────────────────────────────
      poll_rounds:   pollRounds,
      poll_rounds_count: pollRounds.length,
      // ── Recommendation ────────────────────────────────────────────────────
      recommendation,
      message: qrFound
        ? `QR capturado via ${finalSource}`
        : `Evolution não retornou QR em ${pollRounds.length} rodada(s) × 4 endpoints. ${recommendation ?? ""}`,
      failedSteps,
    });

  } catch (err) {
    console.error("[POST /api/evolution/hard-reset]", err);
    return serverError();
  }
}
