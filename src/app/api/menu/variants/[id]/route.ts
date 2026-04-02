import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { updateVariantSchema, reorderVariantsSchema } from "@/validators/menu";
import { MenuItemVariantService } from "@/services/menu/MenuItemVariantService";
import { ok, noContent, badRequest, unauthorized, forbidden, notFound, serverError } from "@/lib/api-response";

type Params = { params: { id: string } };

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    if (!["OWNER", "MANAGER"].includes(ctx.role)) return forbidden();

    const body = await req.json();

    // Reorder variants within an item via ?action=reorder&itemId=...
    if (req.nextUrl.searchParams.get("action") === "reorder") {
      const itemId = req.nextUrl.searchParams.get("itemId");
      if (!itemId) return badRequest("itemId query param required for reorder");

      const parsed = reorderVariantsSchema.safeParse(body);
      if (!parsed.success) return badRequest("Validation failed", parsed.error.flatten());

      const result = await MenuItemVariantService.reorder(ctx.restaurantId, itemId, parsed.data);
      if (!result.ok) return notFound(result.error);
      return ok(result.data);
    }

    const parsed = updateVariantSchema.safeParse(body);
    if (!parsed.success) return badRequest("Validation failed", parsed.error.flatten());

    const result = await MenuItemVariantService.update(ctx.restaurantId, params.id, parsed.data);
    if (!result.ok) return notFound(result.error);

    return ok(result.data);
  } catch (err) {
    console.error("[PATCH /api/menu/variants/[id]]", err);
    return serverError();
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    if (!["OWNER", "MANAGER"].includes(ctx.role)) return forbidden();

    const result = await MenuItemVariantService.remove(ctx.restaurantId, params.id);
    if (!result.ok) return notFound(result.error);

    return noContent();
  } catch (err) {
    console.error("[DELETE /api/menu/variants/[id]]", err);
    return serverError();
  }
}
