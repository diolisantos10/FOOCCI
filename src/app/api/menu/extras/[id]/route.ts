import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { MenuItemExtraService } from "@/services/menu/MenuItemExtraService";
import { noContent, unauthorized, forbidden, notFound, serverError } from "@/lib/api-response";

type Params = { params: { id: string } };

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    if (!["OWNER", "MANAGER"].includes(ctx.role)) return forbidden();

    const result = await MenuItemExtraService.remove(ctx.restaurantId, params.id);
    if (!result.ok) return notFound(result.error);

    return noContent();
  } catch (err) {
    console.error("[DELETE /api/menu/extras/[id]]", err);
    return serverError();
  }
}
