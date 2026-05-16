/**
 * GET /api/evolution/qr
 *
 * State-aware QR proxy. Always checks connectionState first so the
 * response is deterministic regardless of what Evolution returns from
 * GET /instance/connect.
 *
 * Response shapes:
 *   { base64: "data:image/png;base64,…", code: "…" }  — QR ready
 *   { connected: true }                                 — already open
 *   { restarting: true }                                — was close/connecting, restart triggered
 *   { error: "not_configured" }                         — no credentials in DB
 *   { error: "instance_not_found" }                     — instance deleted on Evolution side
 *   { error: "evolution_error", status: N }             — unexpected Evolution error
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, unauthorized, serverError } from "@/lib/api-response";
import { EvolutionConfigService } from "@/services/evolution/EvolutionConfigService";
import { EvolutionClient, EvolutionApiError } from "@/lib/evolution/EvolutionClient";

export async function GET(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const snapResult = await EvolutionConfigService.getSnapshot(ctx.restaurantId);
    if (!snapResult.ok) {
      return ok({ base64: null, code: null, error: "not_configured" });
    }

    const cfg = snapResult.data;

    // ── Step 1: check connection state (deterministic) ────────
    let state: "open" | "close" | "connecting";
    try {
      const status = await EvolutionClient.getInstanceStatus(cfg);
      state = status.state;
    } catch (stateErr) {
      if (stateErr instanceof EvolutionApiError && stateErr.status === 404) {
        return ok({ base64: null, code: null, error: "instance_not_found" });
      }
      throw stateErr;
    }

    // ── Step 2: route by state ────────────────────────────────

    if (state === "open") {
      await EvolutionConfigService.activate(ctx.restaurantId);
      return ok({ base64: null, code: null, connected: true });
    }

    if (state === "close") {
      // Not connecting yet — trigger restart so Evolution generates a QR
      try {
        await EvolutionClient.restartInstance(cfg);
      } catch (restartErr) {
        console.warn(
          "[GET /api/evolution/qr] restart failed:",
          restartErr instanceof Error ? restartErr.message : restartErr
        );
      }
      return ok({ base64: null, code: null, restarting: true });
    }

    // state === "connecting" → fetch QR
    const qr = await EvolutionClient.getQRCode(cfg);

    if (qr.base64) {
      // Activate in DB whenever QR is successfully retrieved
      await EvolutionConfigService.activate(ctx.restaurantId);
      return ok({ base64: qr.base64, code: qr.code });
    }

    // "connecting" but QR not ready yet — tell frontend to retry
    return ok({ base64: null, code: null, restarting: true });

  } catch (err) {
    if (err instanceof EvolutionApiError) {
      console.error("[GET /api/evolution/qr] Evolution error:", err.status, err.body);
      return ok({ base64: null, code: null, error: "evolution_error", status: err.status });
    }
    console.error("[GET /api/evolution/qr]", err);
    return serverError();
  }
}
