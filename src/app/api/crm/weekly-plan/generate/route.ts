/**
 * POST /api/crm/weekly-plan/generate — generate (or regenerate) this week's plan.
 *
 * Body: { force?: boolean }  — force discards an existing plan for the week and
 * recomputes it. Tenant-scoped; the lojista only ever regenerates their own plan.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, unauthorized, serverError } from "@/lib/api-response";
import { CrmWeeklyPlannerService } from "@/services/crm/weeklyPlan/CrmWeeklyPlannerService";
import { CrmWeeklyPlanService } from "@/services/crm/weeklyPlan/CrmWeeklyPlanService";

export async function POST(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const body = await req.json().catch(() => ({}));
    const force = body?.force === true;

    const result = await CrmWeeklyPlannerService.generateForRestaurant(ctx.restaurantId, { force });
    const plan = await CrmWeeklyPlanService.getCurrentPlan(ctx.restaurantId);

    return ok({ ...result, plan });
  } catch (err) {
    console.error("[POST /api/crm/weekly-plan/generate]", err);
    return serverError();
  }
}
