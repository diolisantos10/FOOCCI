import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { createMenuCategorySchema } from "@/validators/menu";
import { MenuCategoryService } from "@/services/menu/MenuCategoryService";
import { ok, created, badRequest, unauthorized, serverError } from "@/lib/api-response";

export async function GET(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const activeOnly = req.nextUrl.searchParams.get("activeOnly") === "true";
    const result = await MenuCategoryService.list(ctx.restaurantId, activeOnly);
    if (!result.ok) return serverError(result.error);

    return ok(result.data);
  } catch (err) {
    console.error("[GET /api/menu/categories]", err);
    return serverError();
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const body = await req.json();
    const parsed = createMenuCategorySchema.safeParse(body);
    if (!parsed.success) return badRequest("Validation failed", parsed.error.flatten());

    const result = await MenuCategoryService.create(ctx.restaurantId, parsed.data);
    if (!result.ok) return serverError(result.error);

    return created(result.data);
  } catch (err) {
    console.error("[POST /api/menu/categories]", err);
    return serverError();
  }
}
