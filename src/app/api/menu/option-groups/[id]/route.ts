import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { updateOptionGroupSchema } from "@/validators/menu";
import { OptionGroupService } from "@/services/menu/OptionGroupService";
import { ok, noContent, badRequest, unauthorized, forbidden, notFound, serverError } from "@/lib/api-response";

type Params = { params: { id: string } };

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    if (!["OWNER", "MANAGER"].includes(ctx.role)) return forbidden();

    const body = await req.json();
    const parsed = updateOptionGroupSchema.safeParse(body);
    if (!parsed.success) return badRequest("Validation failed", parsed.error.flatten());

    const result = await OptionGroupService.updateGroup(ctx.restaurantId, params.id, parsed.data);
    if (!result.ok) return notFound(result.error);

    return ok(result.data);
  } catch (err) {
    console.error("[PATCH /api/menu/option-groups/[id]]", err);
    return serverError();
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    if (!["OWNER", "MANAGER"].includes(ctx.role)) return forbidden();

    const result = await OptionGroupService.removeGroup(ctx.restaurantId, params.id);
    if (!result.ok) return notFound(result.error);

    return noContent();
  } catch (err) {
    console.error("[DELETE /api/menu/option-groups/[id]]", err);
    return serverError();
  }
}
