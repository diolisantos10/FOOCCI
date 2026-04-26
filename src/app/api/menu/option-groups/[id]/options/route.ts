import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { createOptionItemSchema } from "@/validators/menu";
import { OptionGroupService } from "@/services/menu/OptionGroupService";
import { created, badRequest, unauthorized, forbidden, notFound, serverError } from "@/lib/api-response";

type Params = { params: { id: string } };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    if (!["OWNER", "MANAGER"].includes(ctx.role)) return forbidden();

    const body = await req.json();
    const parsed = createOptionItemSchema.safeParse(body);
    if (!parsed.success) return badRequest("Validation failed", parsed.error.flatten());

    const result = await OptionGroupService.createOption(ctx.restaurantId, params.id, parsed.data);
    if (!result.ok) return notFound(result.error);

    return created(result.data);
  } catch (err) {
    console.error("[POST /api/menu/option-groups/[id]/options]", err);
    return serverError();
  }
}
