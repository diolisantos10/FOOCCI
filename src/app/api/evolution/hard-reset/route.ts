/**
 * POST /api/evolution/hard-reset
 *
 * OWNER-only. Performs a full hard reset of the Evolution instance:
 *   1. Fetch current connection state
 *   2. Logout existing WhatsApp session (best-effort)
 *   3. Delete the instance entirely
 *   4. Recreate it with the correct webhook config
 *   5. Trigger QR generation and return state
 *
 * Returns a detailed step-by-step report so the caller knows exactly
 * what happened at each stage. Never exposes raw API keys.
 *
 * This endpoint exists for break-glass / support scenarios.
 * It is idempotent: calling it on a clean instance is safe.
 */

import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { EvolutionConfigService } from "@/services/evolution/EvolutionConfigService";
import { EvolutionClient, EvolutionApiError } from "@/lib/evolution/EvolutionClient";
import { unauthorized, forbidden, serverError } from "@/lib/api-response";

interface StepResult {
  step: string;
  ok: boolean;
  data?: unknown;
  error?: string;
}

async function safeStep(
  label: string,
  fn: () => Promise<unknown>
): Promise<StepResult> {
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

export async function POST(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();
    if (ctx.role !== "OWNER") return forbidden("Apenas o proprietário pode executar reset.");

    const snapResult = await EvolutionConfigService.getSnapshot(
      ctx.restaurantId,
      true  // include webhookSecret for instance recreation
    );
    if (!snapResult.ok) {
      return NextResponse.json(
        { success: false, error: "Evolution config não encontrado.", steps: [] },
        { status: 400 }
      );
    }

    const cfg = snapResult.data;
    const webhookUrl = `${
      process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://foocci.com.br"
    }/api/webhooks/evolution`;

    const steps: StepResult[] = [];

    // ── Step 1: Current state ────────────────────────────────
    const stateStep = await safeStep("1. GET connectionState", () =>
      EvolutionClient.getInstanceStatus(cfg)
    );
    steps.push(stateStep);

    // ── Step 2: Logout (best-effort) ─────────────────────────
    steps.push(await safeStep("2. DELETE logout", () =>
      EvolutionClient.logoutInstance(cfg)
    ));

    // ── Step 3: Delete instance ──────────────────────────────
    const deleteStep = await safeStep("3. DELETE instance", () =>
      EvolutionClient.deleteInstance(cfg)
    );
    steps.push(deleteStep);

    // ── Step 4: Verify instance gone ─────────────────────────
    steps.push(await safeStep("4. GET fetchInstances", () =>
      EvolutionClient.fetchInstances(cfg)
    ));

    // ── Step 5: Recreate instance ────────────────────────────
    const createStep = await safeStep("5. POST createInstance", () =>
      EvolutionClient.createInstance(cfg, {
        instanceName:   cfg.instanceName,
        integration:    "WHATSAPP-BAILEYS",
        webhookUrl,
        webhookByEvents: true,
        webhookEvents:  ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "CONNECTION_UPDATE"],
        webhookSecret:  cfg.webhookSecret,
      })
    );
    steps.push(createStep);

    // Short pause — Evolution needs a moment to initialise the new instance
    await new Promise((r) => setTimeout(r, 2000));

    // ── Step 6: Get QR ───────────────────────────────────────
    const qrStep = await safeStep("6. GET connect (QR)", () =>
      EvolutionClient.getQRCode(cfg)
    );
    steps.push(qrStep);

    // Activate in DB so the Foocci UI unlocks
    await EvolutionConfigService.activate(ctx.restaurantId);

    // ── Summary ──────────────────────────────────────────────
    const qrResult = qrStep.ok
      ? (qrStep.data as { base64?: string | null; instanceState?: string })
      : null;

    const hasQR          = !!(qrResult?.base64);
    const instanceState  = qrResult?.instanceState ?? "unknown";

    return NextResponse.json({
      success:       true,
      instanceName:  cfg.instanceName,
      webhookUrl,
      instanceState,
      hasQR,
      qrFieldPath:   hasQR ? "steps[5].data.base64" : null,
      steps,
    });
  } catch (err) {
    console.error("[POST /api/evolution/hard-reset]", err);
    return serverError();
  }
}
