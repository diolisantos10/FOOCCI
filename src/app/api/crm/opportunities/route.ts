import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, unauthorized, serverError } from "@/lib/api-response";
import { CRMService } from "@/services/crm/CRMService";

export async function GET(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const name = await CRMService.getRestaurantName(ctx.restaurantId);
    const result = await CRMService.getOpportunities(ctx.restaurantId, name);
    if (!result.ok) return serverError(result.error);

    return ok(result.data);
  } catch (err) {
    console.error("[GET /api/crm/opportunities]", err);
    return serverError();
  }
}
