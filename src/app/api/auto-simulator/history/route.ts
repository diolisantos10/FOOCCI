/**
 * GET /api/auto-simulator/history
 *
 * Returns the last 20 SimulationRun records for the authenticated restaurant.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, unauthorized, serverError } from "@/lib/api-response";
import { AutoSimulatorService } from "@/services/ai/AutoSimulatorService";

export async function GET(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();

  try {
    const runs = await AutoSimulatorService.getHistory(ctx.restaurantId, 20);
    return ok(runs);
  } catch (err) {
    return serverError("Erro ao buscar histórico de simulações", err);
  }
}
