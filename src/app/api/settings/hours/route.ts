import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { upsertHoursSchema } from "@/validators/settings";
import { RestaurantSettingsService } from "@/services/settings/RestaurantSettingsService";
import { ok, badRequest, unauthorized, forbidden, serverError } from "@/lib/api-response";

export async function GET(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();
    const result = await RestaurantSettingsService.getHours(ctx.restaurantId);
    if (!result.ok) return serverError(result.error);
    return ok(result.data);
  } catch (err) {
    console.error("[GET /api/settings/hours]", err);
    return serverError();
  }
}

export async function PUT(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();
    if (!["OWNER", "MANAGER"].includes(ctx.role)) return forbidden();
    const parsed = upsertHoursSchema.safeParse(await req.json());
    if (!parsed.success) return badRequest("Validation failed", parsed.error.flatten());
    const result = await RestaurantSettingsService.upsertHours(ctx.restaurantId, parsed.data);
    if (!result.ok) return serverError(result.error);
    return ok(result.data);
  } catch (err) {
    console.error("[PUT /api/settings/hours]", err);
    return serverError();
  }
}
