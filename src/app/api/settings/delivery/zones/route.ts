import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { upsertDeliveryZoneSchema } from "@/validators/settings";
import { RestaurantSettingsService } from "@/services/settings/RestaurantSettingsService";
import { ok, badRequest, unauthorized, forbidden, serverError } from "@/lib/api-response";

export async function GET(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();
    const result = await RestaurantSettingsService.listDeliveryZones(ctx.restaurantId);
    if (!result.ok) return serverError(result.error);
    return ok(result.data);
  } catch (err) {
    console.error("[GET /api/settings/delivery/zones]", err);
    return serverError();
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();
    if (!["OWNER", "MANAGER"].includes(ctx.role)) return forbidden();
    const parsed = upsertDeliveryZoneSchema.safeParse(await req.json());
    if (!parsed.success) return badRequest("Validation failed", parsed.error.flatten());
    const result = await RestaurantSettingsService.createDeliveryZone(ctx.restaurantId, parsed.data);
    if (!result.ok) return serverError(result.error);
    return ok(result.data);
  } catch (err) {
    console.error("[POST /api/settings/delivery/zones]", err);
    return serverError();
  }
}
