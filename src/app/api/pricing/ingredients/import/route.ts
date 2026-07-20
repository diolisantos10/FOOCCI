import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, unauthorized, forbidden, serverError } from "@/lib/api-response";
import { importFromMenu } from "@/services/menu/RecipeCostService";

/**
 * POST /api/pricing/ingredients/import — (re)seed the catalog from the
 * cardápio's ingredients text. Idempotent and additive: creates only missing
 * insumos/links, never touches costs or removes anything.
 */
export async function POST(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();
    if (!["OWNER", "MANAGER"].includes(ctx.role)) return forbidden();

    const outcome = await importFromMenu(ctx.restaurantId);
    return ok(outcome);
  } catch (err) {
    console.error("[POST /api/pricing/ingredients/import]", err);
    return serverError();
  }
}
