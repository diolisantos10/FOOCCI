/**
 * POST /api/crm/weekly-plan/[id]/reject — reject the whole plan.
 *
 * Marks all still-actionable items REJECTED and the plan REJECTED. Already-executed
 * items (live campaigns) are left untouched. Tenant-scoped.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, badRequest, unauthorized, serverError } from "@/lib/api-response";
import { CrmWeeklyPlanService } from "@/services/crm/weeklyPlan/CrmWeeklyPlanService";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const plan = await CrmWeeklyPlanService.rejectPlan(ctx.restaurantId, params.id);
    return ok({ plan });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao rejeitar plano.";
    if (message.includes("não encontrad")) return badRequest(message);
    console.error("[POST /api/crm/weekly-plan/[id]/reject]", err);
    return serverError();
  }
}
