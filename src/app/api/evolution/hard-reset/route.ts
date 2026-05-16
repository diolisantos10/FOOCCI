/**
 * POST /api/evolution/hard-reset
 *
 * OWNER-only. Full hard reset of the Evolution instance:
 *   1. Logout existing WhatsApp session (best-effort)
 *   2. Delete the instance
 *   3. Recreate with correct webhook config + qrcode:true
 *   4. Capture QR from the create response (primary source in v2.2.3)
 *   5. Return qr_base64 directly — UI renders it without polling /instance/connect
 *   6. Only restart if QR NOT in create and state is not "connecting"
 *   7. Never call GET /instance/connect here — that would consume the QR
 *   8. Deactivate in DB
 *
 * Returns qr_base64 (the actual QR image) because this is an OWNER-only endpoint
 * and the QR is meant to be displayed immediately. API key and webhook secret
 * are never returned.
 */

import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { EvolutionConfigService } from "@/services/evolution/EvolutionConfigService";
import { EvolutionClient, EvolutionApiError } from "@/lib/evolution/EvolutionClient";
import { extractEvolutionQr } from "@/lib/evolution/extractQr";
import { unauthorized, forbidden, serverError } from "@/lib/api-response";

const QR_FLOW_VERSION = "CREATE_QR_PRIMARY_V2" as const;

interface StepResult {
  step:   string;
  ok:     boolean;
  data?:  unknown;
  error?: string;
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

    // ── 1. Logout — best-effort (may fail if already disconnected) ────────────
    steps.push(await safeStep("logout", () => EvolutionClient.logoutInstance(cfg)));

    // ── 2. Delete instance ────────────────────────────────────────────────────
    const deleteStep = await safeStep("delete", () => EvolutionClient.deleteInstance(cfg));
    steps.push(deleteStep);

    // Let Evolution finish cleanup
    await sleep(1500);

    // ── 3. Recreate instance with qrcode:true ─────────────────────────────────
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
        success:        false,
        qrFlowVersion:  QR_FLOW_VERSION,
        error:          "Falha ao recriar instância Evolution.",
        failedStep:     "create",
        stepDetail:     createStep.error,
        steps,
      });
    }

    // ── 4. Extract QR from create response (primary source in v2.2.3) ─────────
    // IMPORTANT: Do NOT call GET /instance/connect here — that would "consume"
    // the QR so the UI's subsequent poll would see { count } instead of the image.
    const createData = createStep.data as Record<string, unknown> | null;
    const createQR   = createData ? extractEvolutionQr(createData) : null;
    const qrFoundInCreate      = !!(createQR?.base64);
    const pairingFoundInCreate = !!(createQR?.pairingCode);
    const anyQRInCreate        = qrFoundInCreate || pairingFoundInCreate;

    // Sanitized diagnostic — never returns the actual QR image
    const createKeys       = createData ? Object.keys(createData) : [];
    const createNestedKeys: Record<string, string[]> = {};
    if (createData) {
      for (const k of createKeys) {
        const v = createData[k];
        if (typeof v === "object" && v !== null && !Array.isArray(v)) {
          createNestedKeys[k] = Object.keys(v as Record<string, unknown>);
        }
      }
    }

    const create_instance_qr = {
      create_status:         "success",
      create_top_level_keys: createKeys,
      create_nested_keys:    createNestedKeys,
      qr_found:              qrFoundInCreate,
      qr_candidate_field:    createQR?.foundIn ?? null,
      qr_candidate_length:   createQR?.base64 ? createQR.base64.length : null,
      pairing_code_found:    pairingFoundInCreate,
      pairing_code_length:   createQR?.pairingCode ? createQR.pairingCode.length : null,
      reason: !anyQRInCreate
        ? `QR não encontrado no create response. Chaves: [${createKeys.join(", ")}]`
        : null,
    };

    // ── 5. Only restart if QR was NOT in create and state is not "connecting" ──
    // Calling restart when QR IS in create would invalidate it. We prefer the
    // UI's polling to call GET /instance/connect as the FIRST consumer of the QR.
    if (!anyQRInCreate) {
      await sleep(3000);

      const stateCheck = await safeStep("check_state", () => EvolutionClient.getInstanceStatus(cfg));
      steps.push(stateCheck);

      const currentState = stateCheck.ok
        ? (stateCheck.data as { state?: string })?.state ?? "unknown"
        : "unknown";

      if (currentState !== "connecting") {
        const restartStep = await safeStep("restart", () => EvolutionClient.restartInstance(cfg));
        steps.push(restartStep);
        // Wait for Evolution to generate a new QR before the UI polls
        await sleep(5000);
      }
      // DO NOT call getQRCode() here — let the UI's first poll consume it
    }

    // ── 6. Deactivate in DB ───────────────────────────────────────────────────
    await EvolutionConfigService.deactivate(ctx.restaurantId);

    const failedSteps = steps.filter((s) => !s.ok).map((s) => `${s.step}: ${s.error ?? ""}`);

    return NextResponse.json({
      ok:                 true,
      success:            true,
      action:             "hard_reset_create_qr",
      qrFlowVersion:      QR_FLOW_VERSION,
      hardResetUsesCreateQr: true,
      resetDone:          deleteStep.ok && createStep.ok,
      instanceName:       cfg.instanceName,
      instanceState:      "connecting",
      // QR returned directly — OWNER-only endpoint, meant for immediate display
      qr_found:           anyQRInCreate,
      qr_base64:          createQR?.base64 ?? null,
      qr_text:            createQR?.code ?? null,
      qr_source:          createQR?.foundIn ?? null,
      create_response_keys:  createKeys,
      create_response_shape: createNestedKeys,
      create_instance_qr,
      message: anyQRInCreate
        ? `QR capturado do create response (campo: ${createQR?.foundIn ?? "?"})`
        : `Instância recriada mas QR não encontrado no create. Chaves: [${createKeys.join(", ")}]`,
      failedSteps,
    });

  } catch (err) {
    console.error("[POST /api/evolution/hard-reset]", err);
    return serverError();
  }
}
