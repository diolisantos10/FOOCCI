/**
 * POST /api/auto-simulator/resume
 *
 * Re-enables the auto-scheduler for the authenticated restaurant.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, unauthorized, serverError } from "@/lib/api-response";
import { AutoSimulatorService } from "@/services/ai/AutoSimulatorService";

export async function POST(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();

  try {
    AutoSimulatorService.clearLastError(ctx.restaurantId);
    const config = await AutoSimulatorService.updateConfig(ctx.restaurantId, { enabled: true });
    return ok(config);
  } catch (err) {
    return serverError("Erro ao retomar o agendamento", err);
  }
}
