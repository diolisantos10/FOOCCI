import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import {
  ok,
  badRequest,
  notFound,
  unauthorized,
  forbidden,
  serverError,
} from "@/lib/api-response";
import { recipeLineSchema, removeRecipeLineSchema } from "@/validators/ingredients";
import { removeRecipeLine, setRecipeLine } from "@/services/menu/RecipeCostService";

/**
 * PUT /api/pricing/recipe — upsert one ficha line (product × ingredient ×
 * quantity). A complete ficha recomputes the product cost (source RECIPE)
 * and runs the reprice device.
 */
export async function PUT(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();
    if (!["OWNER", "MANAGER"].includes(ctx.role)) return forbidden();

    const body = await req.json();
    const parsed = recipeLineSchema.safeParse(body);
    if (!parsed.success) return badRequest("Validation failed", parsed.error.flatten());

    const { menuItemId, ingredientId, quantity } = parsed.data;
    const result = await setRecipeLine(ctx.restaurantId, menuItemId, ingredientId, quantity, ctx.userId);
    if (!result.ok) return notFound(result.error);
    return ok(result.data);
  } catch (err) {
    console.error("[PUT /api/pricing/recipe]", err);
    return serverError();
  }
}

/** DELETE /api/pricing/recipe — remove one ficha line. */
export async function DELETE(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();
    if (!["OWNER", "MANAGER"].includes(ctx.role)) return forbidden();

    const body = await req.json();
    const parsed = removeRecipeLineSchema.safeParse(body);
    if (!parsed.success) return badRequest("Validation failed", parsed.error.flatten());

    const { menuItemId, ingredientId } = parsed.data;
    const result = await removeRecipeLine(ctx.restaurantId, menuItemId, ingredientId, ctx.userId);
    if (!result.ok) return notFound(result.error);
    return ok(result.data);
  } catch (err) {
    console.error("[DELETE /api/pricing/recipe]", err);
    return serverError();
  }
}
