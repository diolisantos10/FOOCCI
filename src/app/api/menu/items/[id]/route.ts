import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { updateMenuItemSchema, reorderItemsSchema } from "@/validators/menu";
import { MenuItemService } from "@/services/menu/MenuItemService";
import { ok, noContent, badRequest, unauthorized, forbidden, notFound, serverError } from "@/lib/api-response";

type Params = { params: { id: string } };

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const result = await MenuItemService.getById(ctx.restaurantId, params.id);
    if (!result.ok) return notFound(result.error);

    return ok(result.data);
  } catch (err) {
    console.error("[GET /api/menu/items/[id]]", err);
    return serverError();
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    if (!["OWNER", "MANAGER"].includes(ctx.role)) return forbidden();

    const body = await req.json();

    // Reorder items within a category via ?action=reorder&categoryId=...
    if (req.nextUrl.searchParams.get("action") === "reorder") {
      const categoryId = req.nextUrl.searchParams.get("categoryId");
      if (!categoryId) return badRequest("categoryId query param required for reorder");

      const parsed = reorderItemsSchema.safeParse(body);
      if (!parsed.success) return badRequest("Validation failed", parsed.error.flatten());

      const result = await MenuItemService.reorder(ctx.restaurantId, categoryId, parsed.data);
      if (!result.ok) return notFound(result.error);
      return ok(result.data);
    }

    const parsed = updateMenuItemSchema.safeParse(body);
    if (!parsed.success) return badRequest("Validation failed", parsed.error.flatten());

    const result = await MenuItemService.update(ctx.restaurantId, params.id, parsed.data);
    if (!result.ok) return notFound(result.error);

    return ok(result.data);
  } catch (err) {
    console.error("[PATCH /api/menu/items/[id]]", err);
    return serverError();
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    if (!["OWNER", "MANAGER"].includes(ctx.role)) return forbidden();

    const result = await MenuItemService.remove(ctx.restaurantId, params.id);
    if (!result.ok) return notFound(result.error);

    return noContent();
  } catch (err) {
    console.error("[DELETE /api/menu/items/[id]]", err);
    return serverError();
  }
}
