import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import {
  ok,
  badRequest,
  notFound,
  unauthorized,
  forbidden,
  serverError,
} from "@/lib/api-response";
import { updateCostsSchema } from "@/validators/pricing";
import { updateCostsWithReprice } from "@/services/menu/RepriceService";

/**
 * PATCH /api/pricing/costs — save item unit costs (individual or bulk).
 * Audits every change (COST_EDIT) and, when the reprice device is in AUTO
 * mode, immediately applies the new ideal prices within the guardrail.
 */
export async function PATCH(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();
    if (!["OWNER", "MANAGER"].includes(ctx.role)) return forbidden();

    const body = await req.json();
    const parsed = updateCostsSchema.safeParse(body);
    if (!parsed.success) return badRequest("Validation failed", parsed.error.flatten());

    const result = await updateCostsWithReprice(
      ctx.restaurantId,
      parsed.data.items,
      ctx.userId
    );

    if (!result.ok) {
      return result.status === 404 ? notFound(result.error) : badRequest(result.error);
    }
    return ok(result.data);
  } catch (err) {
    console.error("[PATCH /api/pricing/costs]", err);
    return serverError();
  }
}
