import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { upsertDeliveryZoneSchema } from "@/validators/settings";
import { RestaurantSettingsService } from "@/services/settings/RestaurantSettingsService";
import { ok, badRequest, unauthorized, forbidden, notFound, serverError } from "@/lib/api-response";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();
    if (!["OWNER", "MANAGER"].includes(ctx.role)) return forbidden();
    const { id } = await params;
    const parsed = upsertDeliveryZoneSchema.safeParse(await req.json());
    if (!parsed.success) return badRequest("Validation failed", parsed.error.flatten());
    const result = await RestaurantSettingsService.updateDeliveryZone(id, ctx.restaurantId, parsed.data);
    if (!result.ok) return notFound(result.error);
    return ok(result.data);
  } catch (err) {
    console.error("[PUT /api/settings/delivery/zones/[id]]", err);
    return serverError();
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();
    if (!["OWNER", "MANAGER"].includes(ctx.role)) return forbidden();
    const { id } = await params;
    const result = await RestaurantSettingsService.deleteDeliveryZone(id, ctx.restaurantId);
    if (!result.ok) return notFound(result.error);
    return ok(null);
  } catch (err) {
    console.error("[DELETE /api/settings/delivery/zones/[id]]", err);
    return serverError();
  }
}
