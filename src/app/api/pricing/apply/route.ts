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
import { applyPricesSchema } from "@/validators/pricing";
import { applySuggestedPrices } from "@/services/menu/RepriceService";

/**
 * POST /api/pricing/apply — the lojista applies the suggested (ideal) price
 * to the given items. The target price is recomputed server-side from the
 * saved config; the client never sends prices.
 */
export async function POST(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();
    if (!["OWNER", "MANAGER"].includes(ctx.role)) return forbidden();

    const body = await req.json();
    const parsed = applyPricesSchema.safeParse(body);
    if (!parsed.success) return badRequest("Validation failed", parsed.error.flatten());

    const result = await applySuggestedPrices(
      ctx.restaurantId,
      parsed.data.itemIds,
      ctx.userId
    );

    if (!result.ok) {
      return result.status === 404 ? notFound(result.error) : badRequest(result.error);
    }
    return ok(result.data);
  } catch (err) {
    console.error("[POST /api/pricing/apply]", err);
    return serverError();
  }
}
