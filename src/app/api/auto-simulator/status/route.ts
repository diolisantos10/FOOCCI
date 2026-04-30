/**
 * GET /api/auto-simulator/status
 *
 * Returns whether a simulation run is currently in progress for the
 * authenticated restaurant, plus the lastRunAt timestamp from config.
 *
 * Used by the UI to poll for completion after a fire-and-forget enqueue.
 *
 * Response: { isRunning: boolean, lastRunAt: string | null }
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, unauthorized, serverError } from "@/lib/api-response";
import { AutoSimulatorService } from "@/services/ai/AutoSimulatorService";

export async function GET(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();

  try {
    const isRunning = AutoSimulatorService.isRunning(ctx.restaurantId);
    const config    = await AutoSimulatorService.getConfig(ctx.restaurantId);
    return ok({ isRunning, lastRunAt: config.lastRunAt });
  } catch (err) {
    return serverError("Erro ao buscar status do simulador", err);
  }
}
