/**
 * GET /api/evolution/qr
 *
 * Authenticated proxy — fetches the QR code for the tenant's Evolution instance.
 * Returns { base64: "data:image/png;base64,...", code: "..." } or { base64: null }
 * when the instance is already connected.
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

    const qr = await EvolutionClient.getQRCode(snapResult.data);
    // Activate the integration whenever QR is fetched — user is actively connecting.
    await EvolutionConfigService.activate(ctx.restaurantId);

    // QR code available — return it
    if (qr.base64) {
      return ok({ base64: qr.base64, code: qr.code });
    }

    // Instance already connected
    if (qr.instanceState === "open") {
      return ok({ base64: null, code: null, connected: true });
    }

    // Instance disconnected (QR expired) — trigger restart so a new QR is generated
    if (qr.instanceState === "close") {
      try {
        await EvolutionClient.restartInstance(snapResult.data);
      } catch (restartErr) {
        console.warn(
          "[GET /api/evolution/qr] restart failed:",
          restartErr instanceof Error ? restartErr.message : restartErr
        );
      }
      return ok({ base64: null, code: null, restarting: true });
    }

    // No QR and no clear state — return null and let frontend poll
    return ok({ base64: null, code: null });
  } catch (err) {
    if (err instanceof EvolutionApiError) {
      // 4xx from Evolution (e.g. instance already open) → return empty gracefully
      return ok({ base64: null, code: null, error: "evolution_error", status: err.status });
    }
    console.error("[GET /api/evolution/qr]", err);
    return serverError();
  }
}
