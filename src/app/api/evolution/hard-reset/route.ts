/**
 * POST /api/evolution/hard-reset
 *
 * OWNER-only. Full hard reset of the Evolution instance:
 *   1. Logout existing WhatsApp session (best-effort)
 *   2. Delete the instance
 *   3. Recreate with correct webhook config
 *   4. Restart to move to "connecting" state
 *   5. Fetch QR (best-effort)
 *   6. Deactivate in DB — status stays "Não conectado" until user scans QR
 *
 * Never exposes API keys or secrets in the response.
 * Idempotent: safe to call on a clean instance.
 */

import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { EvolutionConfigService } from "@/services/evolution/EvolutionConfigService";
import { EvolutionClient, EvolutionApiError } from "@/lib/evolution/EvolutionClient";
import { unauthorized, forbidden, serverError } from "@/lib/api-response";

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

    // 1. Logout — best-effort (may fail if already disconnected)
    steps.push(await safeStep("logout", () => EvolutionClient.logoutInstance(cfg)));

    // 2. Delete instance
    const deleteStep = await safeStep("delete", () => EvolutionClient.deleteInstance(cfg));
    steps.push(deleteStep);

    // Short pause — let Evolution finish cleanup
    await sleep(1500);

    // 3. Recreate instance
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
      // Can't continue without a valid instance
      return NextResponse.json({
        success:      false,
        error:        "Falha ao recriar instância Evolution.",
        failedStep:   "create",
        stepDetail:   createStep.error,
        steps,
      });
    }

    // Give Evolution time to initialise the new instance
    await sleep(3000);

    // 4. Restart — moves "close" → "connecting" so QR is generated
    const restartStep = await safeStep("restart", () => EvolutionClient.restartInstance(cfg));
    steps.push(restartStep);

    // Wait for QR to be ready
    await sleep(2000);

    // 5. Try to fetch QR (best-effort — may still be initialising)
    const qrStep = await safeStep("getQR", () => EvolutionClient.getQRCode(cfg));
    steps.push(qrStep);

    // 6. Deactivate in DB so UI reflects "Não conectado" until user actually scans QR
    await EvolutionConfigService.deactivate(ctx.restaurantId);

    const qrResult = qrStep.ok
      ? (qrStep.data as { base64?: string | null; instanceState?: string })
      : null;

    const hasQR         = !!(qrResult?.base64);
    const instanceState = qrResult?.instanceState ?? (restartStep.ok ? "connecting" : "unknown");
    const failedSteps   = steps.filter((s) => !s.ok).map((s) => `${s.step}: ${s.error ?? ""}`);

    return NextResponse.json({
      success:       true,
      resetDone:     deleteStep.ok && createStep.ok,
      instanceName:  cfg.instanceName,
      webhookUrl,
      instanceState,
      hasQR,
      failedSteps,   // sanitized — no secrets
    });

  } catch (err) {
    console.error("[POST /api/evolution/hard-reset]", err);
    return serverError();
  }
}
