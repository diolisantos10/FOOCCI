import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { upsertPaymentSchema } from "@/validators/settings";
import { RestaurantSettingsService } from "@/services/settings/RestaurantSettingsService";
import { ok, badRequest, unauthorized, forbidden, notFound, serverError } from "@/lib/api-response";

export async function GET(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();
    const result = await RestaurantSettingsService.getPayment(ctx.restaurantId);
    if (!result.ok) return notFound(result.error);
    return ok(result.data);
  } catch (err) {
    console.error("[GET /api/settings/payment]", err);
    return serverError();
  }
}

export async function PUT(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();
    if (!["OWNER", "MANAGER"].includes(ctx.role)) return forbidden();
    const parsed = upsertPaymentSchema.safeParse(await req.json());
    if (!parsed.success) return badRequest("Validation failed", parsed.error.flatten());
    const result = await RestaurantSettingsService.upsertPayment(ctx.restaurantId, parsed.data);
    if (!result.ok) return serverError(result.error);
    return ok(result.data);
  } catch (err) {
    console.error("[PUT /api/settings/payment]", err);
    return serverError();
  }
}
