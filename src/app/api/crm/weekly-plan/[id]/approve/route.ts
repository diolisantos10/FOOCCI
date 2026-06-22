/**
 * POST /api/crm/weekly-plan/[id]/approve — approve the whole plan.
 *
 * Approves every still-proposed item and executes all approved items (each becomes
 * a recurring Campaign that the ScheduledCampaignRunner then sends safely).
 * Tenant-scoped.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, badRequest, unauthorized, serverError } from "@/lib/api-response";
import { CrmWeeklyPlanService } from "@/services/crm/weeklyPlan/CrmWeeklyPlanService";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const { executed } = await CrmWeeklyPlanService.approvePlan(ctx.restaurantId, params.id);
    const plan = await CrmWeeklyPlanService.getPlan(ctx.restaurantId, params.id);
    return ok({ executed, plan });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao aprovar plano.";
    if (message.includes("não encontrad")) return badRequest(message);
    console.error("[POST /api/crm/weekly-plan/[id]/approve]", err);
    return serverError();
  }
}
