import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, unauthorized, serverError } from "@/lib/api-response";
import { AdaptiveCRMService } from "@/services/crm/AdaptiveCRMService";

export async function GET(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const result = await AdaptiveCRMService.getBrainSummary(ctx.restaurantId);
    if (!result.ok) return serverError(result.error);

    return ok(result.data);
  } catch (err) {
    console.error("[GET /api/crm/brain]", err);
    return serverError();
  }
}
