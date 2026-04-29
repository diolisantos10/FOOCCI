/**
 * POST /api/auto-simulator/run
 *
 * Manually triggers one auto-simulator run for the authenticated restaurant.
 * Returns the stored SimulationRun record when complete.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, unauthorized, serverError } from "@/lib/api-response";
import { AutoSimulatorService } from "@/services/ai/AutoSimulatorService";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();

  try {
    const body = await req.json().catch(() => ({})) as { scenarioCount?: number };
    const scenarioCount = typeof body.scenarioCount === "number"
      ? Math.min(Math.max(body.scenarioCount, 1), 20)
      : 10;

    const run = await AutoSimulatorService.executeRun(ctx.restaurantId, scenarioCount, "manual");
    return ok(run);
  } catch (err) {
    return serverError("Erro ao executar simulação automática", err);
  }
}
