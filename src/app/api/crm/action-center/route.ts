import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, unauthorized, serverError } from "@/lib/api-response";
import { CrmActionCenterService } from "@/services/crm/CrmActionCenterService";

/**
 * GET /api/crm/action-center
 *
 * Returns a ranked feed of CRM opportunities for the owner to act on.
 * Read-only. Tenant-scoped. Never sends messages or triggers campaigns.
 */
export async function GET(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const result = await CrmActionCenterService.getActionCenter(ctx.restaurantId);
    return ok(result);
  } catch (err) {
    console.error("[GET /api/crm/action-center]", err);
    return serverError();
  }
}
