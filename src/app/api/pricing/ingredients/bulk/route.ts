import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, badRequest, unauthorized, forbidden, serverError } from "@/lib/api-response";
import { bulkIngredientsSchema } from "@/validators/ingredients";
import { bulkCreateIngredients } from "@/services/menu/RecipeCostService";

/**
 * POST /api/pricing/ingredients/bulk — adiciona insumos em massa a partir de
 * uma lista (colada ou de arquivo .txt/.csv, parseada no cliente). Dedupe na
 * própria lista e contra o catálogo; nunca sobrescreve insumo existente.
 */
export async function POST(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();
    if (!["OWNER", "MANAGER"].includes(ctx.role)) return forbidden();

    const body = await req.json();
    const parsed = bulkIngredientsSchema.safeParse(body);
    if (!parsed.success) return badRequest("Validation failed", parsed.error.flatten());

    const result = await bulkCreateIngredients(ctx.restaurantId, parsed.data.items);
    if (!result.ok) return badRequest(result.error);
    return ok(result.data);
  } catch (err) {
    console.error("[POST /api/pricing/ingredients/bulk]", err);
    return serverError();
  }
}
