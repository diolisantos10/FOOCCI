import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { updateMenuCategorySchema, reorderCategoriesSchema } from "@/validators/menu";
import { MenuCategoryService } from "@/services/menu/MenuCategoryService";
import {
  ok, noContent, badRequest, unauthorized, forbidden,
  notFound, conflict, serverError,
} from "@/lib/api-response";

type Params = { params: { id: string } };

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const result = await MenuCategoryService.getById(ctx.restaurantId, params.id);
    if (!result.ok) return notFound(result.error);

    return ok(result.data);
  } catch (err) {
    console.error("[GET /api/menu/categories/[id]]", err);
    return serverError();
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    if (!["OWNER", "MANAGER"].includes(ctx.role)) return forbidden();

    const body = await req.json();

    // Support reorder batch via ?action=reorder
    if (req.nextUrl.searchParams.get("action") === "reorder") {
      const parsed = reorderCategoriesSchema.safeParse(body);
      if (!parsed.success) return badRequest("Validation failed", parsed.error.flatten());

      const result = await MenuCategoryService.reorder(ctx.restaurantId, parsed.data);
      if (!result.ok) return badRequest(result.error);
      return ok(result.data);
    }

    const parsed = updateMenuCategorySchema.safeParse(body);
    if (!parsed.success) return badRequest("Validation failed", parsed.error.flatten());

    const result = await MenuCategoryService.update(ctx.restaurantId, params.id, parsed.data);
    if (!result.ok) return notFound(result.error);

    return ok(result.data);
  } catch (err) {
    console.error("[PATCH /api/menu/categories/[id]]", err);
    return serverError();
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    if (!["OWNER", "MANAGER"].includes(ctx.role)) return forbidden();

    const result = await MenuCategoryService.remove(ctx.restaurantId, params.id);
    if (!result.ok) {
      if (result.status === 409) return conflict(result.error);
      return notFound(result.error);
    }

    return noContent();
  } catch (err) {
    console.error("[DELETE /api/menu/categories/[id]]", err);
    return serverError();
  }
}
