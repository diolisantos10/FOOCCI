import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { createExtraSchema } from "@/validators/menu";
import { MenuItemExtraService } from "@/services/menu/MenuItemExtraService";
import { ok, created, badRequest, unauthorized, forbidden, notFound, serverError } from "@/lib/api-response";

type Params = { params: { id: string } };

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const result = await MenuItemExtraService.list(ctx.restaurantId, params.id);
    if (!result.ok) return notFound(result.error);

    return ok(result.data);
  } catch (err) {
    console.error("[GET /api/menu/items/[id]/extras]", err);
    return serverError();
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    if (!["OWNER", "MANAGER"].includes(ctx.role)) return forbidden();

    const body = await req.json();
    const parsed = createExtraSchema.safeParse(body);
    if (!parsed.success) return badRequest("Validation failed", parsed.error.flatten());

    const result = await MenuItemExtraService.create(ctx.restaurantId, params.id, parsed.data);
    if (!result.ok) return notFound(result.error);

    return created(result.data);
  } catch (err) {
    console.error("[POST /api/menu/items/[id]/extras]", err);
    return serverError();
  }
}
