import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { upsertDeliverySchema } from "@/validators/settings";
import { RestaurantSettingsService } from "@/services/settings/RestaurantSettingsService";
import { ok, badRequest, unauthorized, forbidden, notFound, serverError } from "@/lib/api-response";

export async function GET(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();
    const result = await RestaurantSettingsService.getDelivery(ctx.restaurantId);
    if (!result.ok) {
      console.info("[delivery-settings GET] no config row", { restaurantId: ctx.restaurantId });
      return notFound(result.error);
    }
    console.info("[delivery-settings GET] loaded", {
      restaurantId: ctx.restaurantId,
      mode: result.data.mode,
      fee: String(result.data.fee),
      freeDeliveryAbove: String(result.data.freeDeliveryAbove),
    });
    return ok(result.data);
  } catch (err) {
    console.error("[GET /api/settings/delivery]", err);
    return serverError();
  }
}

export async function PUT(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();
    if (!["OWNER", "MANAGER"].includes(ctx.role)) return forbidden();
    const body = await req.json();
    console.info("[delivery-settings PUT] incoming", {
      restaurantId: ctx.restaurantId,
      mode: body.mode,
      fee: body.fee,
      freeDeliveryAbove: body.freeDeliveryAbove,
    });
    const parsed = upsertDeliverySchema.safeParse(body);
    if (!parsed.success) return badRequest("Validation failed", parsed.error.flatten());
    const result = await RestaurantSettingsService.upsertDelivery(ctx.restaurantId, parsed.data);
    if (!result.ok) return serverError(result.error);
    console.info("[delivery-settings PUT] saved", {
      restaurantId: ctx.restaurantId,
      mode: result.data.mode,
      fee: String(result.data.fee),
      freeDeliveryAbove: String(result.data.freeDeliveryAbove),
    });
    return ok(result.data);
  } catch (err) {
    console.error("[PUT /api/settings/delivery]", err);
    return serverError();
  }
}
