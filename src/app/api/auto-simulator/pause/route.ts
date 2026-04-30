/**
 * POST /api/auto-simulator/pause
 *
 * Disables the auto-scheduler for the authenticated restaurant
 * without stopping a run that is already in progress.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, unauthorized, serverError } from "@/lib/api-response";
import { AutoSimulatorService } from "@/services/ai/AutoSimulatorService";

export async function POST(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();

  try {
    const config = await AutoSimulatorService.updateConfig(ctx.restaurantId, { enabled: false });
    return ok(config);
  } catch (err) {
    return serverError("Erro ao pausar o agendamento", err);
  }
}
