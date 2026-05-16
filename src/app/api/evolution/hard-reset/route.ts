/**
 * POST /api/evolution/hard-reset
 *
 * OWNER-only. Full hard reset of the Evolution instance:
 *   1. Logout + delete (best-effort, 404 ignored)
 *   2. Wait 1.5 s
 *   3. POST /instance/create (qrcode:true, WHATSAPP-BAILEYS)
 *   4. Inspect create response — extract base64 image OR text code → generate image
 *   5. If QR found → return qr_base64 immediately (no restart, no polling)
 *   6. If not found → poll GET /instance/connect every 3 s for up to 30 s (10 attempts)
 *      Each poll also tries text-code → image generation via qrcode library
 *   7. Return full diagnostic when still not found
 *   8. Deactivate in DB (status = "Não conectado" until user scans)
 *
 * Returns qr_base64 (OWNER-only — the QR is meant for immediate display).
 * Never returns apiKey, webhookSecret, or auth tokens.
 */

import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { getTenantContext } from "@/lib/tenant";
import { EvolutionConfigService } from "@/services/evolution/EvolutionConfigService";
import { EvolutionClient, EvolutionApiError } from "@/lib/evolution/EvolutionClient";
import { extractEvolutionQr, isCountOnlyResponse } from "@/lib/evolution/extractQr";
import { unauthorized, forbidden, serverError } from "@/lib/api-response";

const QR_FLOW_VERSION = "CREATE_QR_PRIMARY_V2" as const;

interface StepResult {
  step:   string;
  ok:     boolean;
  data?:  unknown;
  error?: string;
}

export interface PollAttempt {
  attempt:     number;
  endpoint:    string;
  httpStatus:  number;
  keys:        string[];
  qrFound:     boolean;
  isCountOnly: boolean;
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

/**
 * Try to extract a renderable QR image from a raw Evolution API response.
 * If the response has a base64 PNG → use it.
 * If the response has only a text code (2@...) → generate a QR PNG via qrcode lib.
 * Never throws — always returns nulls on failure.
 */
async function tryGetQRImage(raw: unknown): Promise<{
  base64:  string | null;
  text:    string | null;
  pairing: string | null;
  source:  string | null;
}> {
  const extracted = extractEvolutionQr(raw);

  let base64 = extracted.base64;
  let source = extracted.foundIn;

  // If we have a text code but no image, generate the QR image
  if (!base64 && extracted.code) {
    try {
      base64 = await QRCode.toDataURL(extracted.code, { margin: 1, width: 256 });
      source = `generated_from_code(${extracted.foundIn ?? "code"})`;
    } catch {
      // ignore — keep base64 null
    }
  }

  return {
    base64,
    text:    extracted.code,
    pairing: extracted.pairingCode,
    source,
  };
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

    // ── 1. Logout — best-effort ────────────────────────────────────────────────
    steps.push(await safeStep("logout", () => EvolutionClient.logoutInstance(cfg)));

    // ── 2. Delete — best-effort ────────────────────────────────────────────────
    const deleteStep = await safeStep("delete", () => EvolutionClient.deleteInstance(cfg));
    steps.push(deleteStep);

    await sleep(1500);

    // ── 3. Create with qrcode:true ────────────────────────────────────────────
    const createStep = await safeStep("create", () =>
      EvolutionClient.createInstance(cfg, {
        instanceName:    cfg.instanceName,
        integration:     "WHATSAPP-BAILEYS",
        webhookUrl,
        webhookByEvents: true,
        webhookEvents:   ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "CONNECTION_UPDATE"],
        webhookSecret:   cfg.webhookSecret,
      })
    );
    steps.push(createStep);

    if (!createStep.ok) {
      return NextResponse.json({
        success:       false,
        qrFlowVersion: QR_FLOW_VERSION,
        stage:         "create_failed",
        error:         "Falha ao recriar instância Evolution.",
        detail:        createStep.error,
        failedSteps:   steps.filter((s) => !s.ok).map((s) => `${s.step}: ${s.error ?? ""}`),
      });
    }

    // ── 4. Inspect create response ─────────────────────────────────────────────
    const createData  = createStep.data as Record<string, unknown> | null;
    const createKeys  = createData ? Object.keys(createData) : [];

    // Two-level shape for diagnostics (never includes values — only key names)
    const createShape: Record<string, string[]> = {};
    if (createData) {
      for (const k of createKeys) {
        const v = createData[k];
        if (typeof v === "object" && v !== null && !Array.isArray(v)) {
          createShape[k] = Object.keys(v as Record<string, unknown>);
        }
      }
    }

    const createQR = createData ? await tryGetQRImage(createData) : null;

    let finalBase64  = createQR?.base64  ?? null;
    let finalText    = createQR?.text    ?? null;
    let finalPairing = createQR?.pairing ?? null;
    let finalSource  = createQR?.source  ?? null;
    let qrFound      = !!(finalBase64 || finalPairing);
    let stage        = qrFound ? "create_response_qr" : "create_response_no_qr";

    // ── 5. Poll if not found in create ─────────────────────────────────────────
    const pollAttempts: PollAttempt[] = [];

    if (!qrFound) {
      // Check instance state — only restart if not already "connecting"
      const stateCheck = await safeStep("check_state", () => EvolutionClient.getInstanceStatus(cfg));
      steps.push(stateCheck);

      const currentState = stateCheck.ok
        ? (stateCheck.data as { state?: string })?.state ?? "unknown"
        : "unknown";

      if (currentState !== "connecting") {
        const restartStep = await safeStep("restart", () => EvolutionClient.restartInstance(cfg));
        steps.push(restartStep);
        await sleep(3000);  // give Evolution time to move to "connecting"
      }

      const connectUrl = `${cfg.baseUrl.replace(/\/$/, "")}/instance/connect/${cfg.instanceName}`;

      for (let attempt = 1; attempt <= 10 && !qrFound; attempt++) {
        await sleep(3000);  // 10 × 3 s = 30 s max polling window

        let httpStatus   = 0;
        let pollKeys: string[] = [];
        let isCount      = false;
        let pollQRFound  = false;

        try {
          const pollRes = await fetch(connectUrl, {
            method:  "GET",
            headers: { "Content-Type": "application/json", apikey: cfg.apiKey },
          });

          httpStatus = pollRes.status;

          if (pollRes.ok) {
            const rawBody = await pollRes.json().catch(() => ({})) as Record<string, unknown>;
            pollKeys = Object.keys(rawBody);
            isCount  = isCountOnlyResponse(rawBody);

            const pollQR = await tryGetQRImage(rawBody);

            if (pollQR.base64 || pollQR.pairing) {
              finalBase64  = pollQR.base64;
              finalText    = pollQR.text;
              finalPairing = pollQR.pairing;
              finalSource  = `poll_${attempt}:${pollQR.source ?? "connect"}`;
              qrFound      = true;
              stage        = "poll_qr_found";
              pollQRFound  = true;
            }
          }
        } catch {
          // network error on individual poll — log and continue
        }

        pollAttempts.push({
          attempt,
          endpoint:   `/instance/connect/${cfg.instanceName}`,
          httpStatus,
          keys:       pollKeys,
          qrFound:    pollQRFound,
          isCountOnly: isCount,
        });
      }

      if (!qrFound) stage = "polling_no_qr";
    }

    // ── 6. Deactivate in DB ────────────────────────────────────────────────────
    await EvolutionConfigService.deactivate(ctx.restaurantId);

    const failedSteps = steps.filter((s) => !s.ok).map((s) => `${s.step}: ${s.error ?? ""}`);

    return NextResponse.json({
      ok:            true,
      success:       true,
      action:        "hard_reset_create_qr",
      qrFlowVersion: QR_FLOW_VERSION,
      resetDone:     deleteStep.ok && createStep.ok,
      instanceName:  cfg.instanceName,
      instanceState: "connecting",
      stage,
      // ── QR result ─────────────────────────────────────────────────────────
      qr_found:   qrFound,
      qr_base64:  finalBase64,   // full PNG data URL — OWNER-only endpoint
      qr_text:    finalText,     // text code (for reference only)
      qr_source:  finalSource,   // which field/path the QR came from
      // ── Diagnostic (always returned for visibility) ────────────────────────
      create_response_keys:  createKeys,
      create_response_shape: createShape,
      poll_attempts:         pollAttempts,
      message: qrFound
        ? `QR capturado (${finalSource})`
        : `Evolution respondeu mas nenhum QR encontrado. ${pollAttempts.length} poll(s) realizados.`,
      failedSteps,
    });

  } catch (err) {
    console.error("[POST /api/evolution/hard-reset]", err);
    return serverError();
  }
}
