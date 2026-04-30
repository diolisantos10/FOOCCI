/**
 * POST /api/auto-simulator/stop
 *
 * Requests an abort of the current run and disables the scheduler.
 * The running simulation finishes its current scenario then halts —
 * it does not cut a scenario mid-execution.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, unauthorized, serverError } from "@/lib/api-response";
import { AutoSimulatorService } from "@/services/ai/AutoSimulatorService";

export async function POST(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();

  try {
    AutoSimulatorService.requestStop(ctx.restaurantId);
    const config = await AutoSimulatorService.updateConfig(ctx.restaurantId, { enabled: false });
    return ok({ stopped: true, config });
  } catch (err) {
    return serverError("Erro ao parar o simulador", err);
  }
}
