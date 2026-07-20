import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, notFound, unauthorized, forbidden, serverError } from "@/lib/api-response";
import { deleteIngredient } from "@/services/menu/RecipeCostService";

/** DELETE /api/pricing/ingredients/[id] — remove an insumo (recipe lines cascade). */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();
    if (!["OWNER", "MANAGER"].includes(ctx.role)) return forbidden();

    const result = await deleteIngredient(ctx.restaurantId, params.id, ctx.userId);
    if (!result.ok) return notFound(result.error);
    return ok(result.data);
  } catch (err) {
    console.error("[DELETE /api/pricing/ingredients/[id]]", err);
    return serverError();
  }
}
