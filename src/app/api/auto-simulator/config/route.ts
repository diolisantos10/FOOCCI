/**
 * GET  /api/auto-simulator/config  — read current config (or defaults)
 * PATCH /api/auto-simulator/config — update enabled / intervalMinutes / scenarioCount
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, unauthorized, badRequest, serverError } from "@/lib/api-response";
import { AutoSimulatorService } from "@/services/ai/AutoSimulatorService";

export async function GET(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();

  try {
    const config = await AutoSimulatorService.getConfig(ctx.restaurantId);
    return ok(config);
  } catch (err) {
    return serverError("Erro ao buscar configuração", err);
  }
}

export async function PATCH(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return badRequest("Body inválido");

    const data: { enabled?: boolean; intervalMinutes?: number; scenarioCount?: number } = {};
    if (typeof body.enabled         === "boolean") data.enabled         = body.enabled;
    if (typeof body.intervalMinutes === "number")  data.intervalMinutes = Math.max(5, body.intervalMinutes);
    if (typeof body.scenarioCount   === "number")  data.scenarioCount   = Math.min(Math.max(body.scenarioCount, 1), 20);

    const config = await AutoSimulatorService.updateConfig(ctx.restaurantId, data);
    return ok(config);
  } catch (err) {
    return serverError("Erro ao atualizar configuração", err);
  }
}
