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
import { categoryMarkupSchema } from "@/validators/pricing";
import { updateCategoryMarkups } from "@/services/menu/RepriceService";

/**
 * PATCH /api/pricing/markup — save per-category markup overrides (aba Markup).
 * null clears an override (category goes back to the global markup). In AUTO
 * mode the device immediately re-derives affected prices within the guardrail.
 */
export async function PATCH(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();
    if (!["OWNER", "MANAGER"].includes(ctx.role)) return forbidden();

    const body = await req.json();
    const parsed = categoryMarkupSchema.safeParse(body);
    if (!parsed.success) return badRequest("Validation failed", parsed.error.flatten());

    const result = await updateCategoryMarkups(ctx.restaurantId, parsed.data.items, ctx.userId);
    if (!result.ok) {
      return result.status === 404 ? notFound(result.error) : badRequest(result.error);
    }
    return ok(result.data);
  } catch (err) {
    console.error("[PATCH /api/pricing/markup]", err);
    return serverError();
  }
}
