/**
 * GET /api/crm/weekly-plan/autonomy — read the restaurant's autonomy settings.
 * PUT /api/crm/weekly-plan/autonomy — update mode (COPILOT | AUTOPILOT) and guardrails.
 *
 * Body (PUT): { mode?: "COPILOT" | "AUTOPILOT", config?: Partial<AutonomyConfig> }
 * Tenant-scoped.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, badRequest, unauthorized, serverError } from "@/lib/api-response";
import { CrmWeeklyPlanService } from "@/services/crm/weeklyPlan/CrmWeeklyPlanService";

export async function GET(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();
    return ok(await CrmWeeklyPlanService.getAutonomy(ctx.restaurantId));
  } catch (err) {
    console.error("[GET /api/crm/weekly-plan/autonomy]", err);
    return serverError();
  }
}

export async function PUT(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const body = await req.json().catch(() => ({}));
    const mode = body?.mode;
    if (mode !== undefined && mode !== "COPILOT" && mode !== "AUTOPILOT") {
      return badRequest("mode deve ser 'COPILOT' ou 'AUTOPILOT'.");
    }

    const result = await CrmWeeklyPlanService.setAutonomy(ctx.restaurantId, {
      mode,
      config: body?.config,
    });
    return ok(result);
  } catch (err) {
    console.error("[PUT /api/crm/weekly-plan/autonomy]", err);
    return serverError();
  }
}
