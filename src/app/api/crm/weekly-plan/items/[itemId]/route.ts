/**
 * PATCH /api/crm/weekly-plan/items/[itemId] — act on a single proposed item.
 *
 * Body: { action: "approve" | "reject" | "edit", messageTemplate?, suggestedScheduleConfig?, couponCode? }
 *   - approve → marks APPROVED and executes (creates the recurring campaign)
 *   - reject  → marks REJECTED
 *   - edit    → updates message / schedule / coupon before approval
 * Tenant-scoped.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, badRequest, unauthorized, serverError } from "@/lib/api-response";
import { CrmWeeklyPlanService } from "@/services/crm/weeklyPlan/CrmWeeklyPlanService";

export async function PATCH(req: NextRequest, { params }: { params: { itemId: string } }) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const body = await req.json().catch(() => ({}));
    const action = body?.action;

    let item;
    switch (action) {
      case "approve":
        item = await CrmWeeklyPlanService.approveItem(ctx.restaurantId, params.itemId);
        break;
      case "reject":
        item = await CrmWeeklyPlanService.rejectItem(ctx.restaurantId, params.itemId);
        break;
      case "edit":
        item = await CrmWeeklyPlanService.editItem(ctx.restaurantId, params.itemId, {
          messageTemplate: body?.messageTemplate,
          suggestedScheduleConfig: body?.suggestedScheduleConfig,
          couponCode: body?.couponCode,
        });
        break;
      default:
        return badRequest("action deve ser 'approve', 'reject' ou 'edit'.");
    }

    return ok({ item });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao atualizar item.";
    if (message.includes("não encontrad") || message.includes("não é possível")) {
      return badRequest(message);
    }
    console.error("[PATCH /api/crm/weekly-plan/items/[itemId]]", err);
    return serverError();
  }
}
