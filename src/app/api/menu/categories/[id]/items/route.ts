import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { createMenuItemSchema } from "@/validators/menu";
import { MenuItemService } from "@/services/menu/MenuItemService";
import { ok, created, badRequest, unauthorized, notFound, serverError } from "@/lib/api-response";

type Params = { params: { id: string } };

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const activeOnly = req.nextUrl.searchParams.get("activeOnly") === "true";
    const result = await MenuItemService.listByCategory(
      ctx.restaurantId,
      params.id,
      activeOnly
    );
    if (!result.ok) return notFound(result.error);

    return ok(result.data);
  } catch (err) {
    console.error("[GET /api/menu/categories/[id]/items]", err);
    return serverError();
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const body = await req.json();
    const parsed = createMenuItemSchema.safeParse(body);
    if (!parsed.success) return badRequest("Validation failed", parsed.error.flatten());

    const result = await MenuItemService.create(ctx.restaurantId, params.id, parsed.data);
    if (!result.ok) return notFound(result.error);

    return created(result.data);
  } catch (err) {
    console.error("[POST /api/menu/categories/[id]/items]", err);
    return serverError();
  }
}
