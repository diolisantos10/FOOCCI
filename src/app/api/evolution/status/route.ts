/**
 * GET /api/evolution/status
 *
 * Proxies a connection state check to the Evolution API.
 * Returns the current instance connection state: "open" | "close" | "connecting"
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { EvolutionConfigService } from "@/services/evolution/EvolutionConfigService";
import { EvolutionClient, EvolutionApiError } from "@/lib/evolution/EvolutionClient";
import { ok, unauthorized, notFound, serverError } from "@/lib/api-response";

export async function GET(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const snapshotResult = await EvolutionConfigService.getSnapshot(ctx.restaurantId);
    if (!snapshotResult.ok) {
      if (snapshotResult.status === 404) return notFound(snapshotResult.error);
      return serverError(snapshotResult.error);
    }

    const status = await EvolutionClient.getInstanceStatus(snapshotResult.data);
    return ok(status);
  } catch (err) {
    if (err instanceof EvolutionApiError) {
      return serverError(`Evolution API returned ${err.status}`);
    }
    console.error("[GET /api/evolution/status]", err);
    return serverError();
  }
}
