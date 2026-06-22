/**
 * GET /api/crm/weekly-plan — the restaurant's current Weekly Strategist plan.
 *
 * Returns the latest weekly plan (with items) plus the active autonomy settings.
 * Read-only. Tenant-scoped.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, unauthorized, serverError } from "@/lib/api-response";
import { CrmWeeklyPlanService } from "@/services/crm/weeklyPlan/CrmWeeklyPlanService";

export async function GET(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const [plan, autonomy] = await Promise.all([
      CrmWeeklyPlanService.getCurrentPlan(ctx.restaurantId),
      CrmWeeklyPlanService.getAutonomy(ctx.restaurantId),
    ]);

    return ok({ plan, autonomy });
  } catch (err) {
    console.error("[GET /api/crm/weekly-plan]", err);
    return serverError();
  }
}
