import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import {
  ok,
  created,
  badRequest,
  conflict,
  notFound,
  unauthorized,
  forbidden,
  serverError,
} from "@/lib/api-response";
import { createIngredientSchema, updateIngredientsSchema } from "@/validators/ingredients";
import { createIngredient, updateIngredients } from "@/services/menu/RecipeCostService";

/** GET /api/pricing/ingredients — catalog + all recipe lines of the tenant. */
export async function GET(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const [ingredients, lines] = await Promise.all([
      prisma.ingredient.findMany({
        where: { restaurantId: ctx.restaurantId },
        orderBy: { name: "asc" },
        include: { _count: { select: { recipeLines: true } } },
      }),
      prisma.recipeLine.findMany({
        where: { menuItem: { category: { restaurantId: ctx.restaurantId } } },
        select: { menuItemId: true, ingredientId: true, quantity: true },
      }),
    ]);

    return ok({
      ingredients: ingredients.map((i) => ({
        id: i.id,
        name: i.name,
        unit: i.unit,
        costPerUnit: i.costPerUnit === null ? null : Number(i.costPerUnit),
        usedIn: i._count.recipeLines,
      })),
      lines: lines.map((l) => ({
        menuItemId: l.menuItemId,
        ingredientId: l.ingredientId,
        quantity: l.quantity === null ? null : Number(l.quantity),
      })),
    });
  } catch (err) {
    console.error("[GET /api/pricing/ingredients]", err);
    return serverError();
  }
}

/** POST /api/pricing/ingredients — register a new insumo. */
export async function POST(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();
    if (!["OWNER", "MANAGER"].includes(ctx.role)) return forbidden();

    const body = await req.json();
    const parsed = createIngredientSchema.safeParse(body);
    if (!parsed.success) return badRequest("Validation failed", parsed.error.flatten());

    const result = await createIngredient(ctx.restaurantId, parsed.data);
    if (!result.ok) {
      return result.status === 409 ? conflict(result.error) : badRequest(result.error);
    }
    return created(result.data);
  } catch (err) {
    console.error("[POST /api/pricing/ingredients]", err);
    return serverError();
  }
}

/**
 * PATCH /api/pricing/ingredients — batch edit (cost per unit / unit / name).
 * Cost changes recompute every complete ficha that uses the ingredient and
 * push the new product costs through the reprice device.
 */
export async function PATCH(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();
    if (!["OWNER", "MANAGER"].includes(ctx.role)) return forbidden();

    const body = await req.json();
    const parsed = updateIngredientsSchema.safeParse(body);
    if (!parsed.success) return badRequest("Validation failed", parsed.error.flatten());

    const result = await updateIngredients(ctx.restaurantId, parsed.data.items, ctx.userId);
    if (!result.ok) {
      return result.status === 404 ? notFound(result.error) : badRequest(result.error);
    }
    return ok(result.data);
  } catch (err) {
    console.error("[PATCH /api/pricing/ingredients]", err);
    return serverError();
  }
}
