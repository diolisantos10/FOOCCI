/**
 * GET /api/evolution/qr
 *
 * State-aware QR proxy. Always checks connectionState first so the
 * response is deterministic regardless of what Evolution returns from
 * GET /instance/connect.
 *
 * Response shapes:
 *   { base64: "data:image/png;…", code: "…" }           — QR image ready
 *   { pairingCode: "ABCD-EFGH", code: "…" }             — pairing code (no image)
 *   { connected: true }                                   — already open
 *   { restarting: true }                                  — restart triggered, retry
 *   { error: "not_configured" }                           — no credentials in DB
 *   { error: "instance_not_found" }                       — instance deleted on Evolution
 *   { error: "qr_shape_unknown", availableKeys: [...] }  — responded but no QR field found
 *   { error: "evolution_error", status: N }               — unexpected Evolution error
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, unauthorized, serverError } from "@/lib/api-response";
import { EvolutionConfigService } from "@/services/evolution/EvolutionConfigService";
import { EvolutionClient, EvolutionApiError } from "@/lib/evolution/EvolutionClient";
import { qrDiagnosticMeta } from "@/lib/evolution/extractQr";

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
      await EvolutionConfigService.activate(ctx.restaurantId);
      return ok({ base64: qr.base64, code: qr.code });
    }

    if (qr.pairingCode) {
      // Evolution returned a pairing code instead of QR image
      return ok({ pairingCode: qr.pairingCode, code: qr.code });
    }

    // "connecting" but QR not ready — log what we got and retry
    console.warn(
      "[GET /api/evolution/qr] connecting but no QR extracted. foundIn:",
      qr.foundIn ?? "none"
    );
    return ok({ base64: null, code: null, restarting: true });

  } catch (err) {
    if (err instanceof EvolutionApiError) {
      console.error("[GET /api/evolution/qr] Evolution error:", err.status, err.body);
      // Log response shape for debugging (server-side only)
      if (err.body && typeof err.body === "object") {
        const meta = qrDiagnosticMeta(err.body);
        console.error("[GET /api/evolution/qr] response keys:", meta.availableKeys);
      }
      return ok({ base64: null, code: null, error: "evolution_error", status: err.status });
    }
    console.error("[GET /api/evolution/qr]", err);
    return serverError();
  }
}
