import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { updateDraftItemSchema } from "@/validators/order";
import { OrderDraftService } from "@/services/order/OrderDraftService";
import { ok, noContent, badRequest, unauthorized, notFound, serverError } from "@/lib/api-response";

type Params = { params: { id: string; itemId: string } };

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const body = await req.json();
    const parsed = updateDraftItemSchema.safeParse(body);
    if (!parsed.success) return badRequest("Validation failed", parsed.error.flatten());

    const result = await OrderDraftService.updateItem(
      ctx.restaurantId,
      params.id,
      params.itemId,
      parsed.data
    );
    if (!result.ok) {
      if (result.status === 404) return notFound(result.error);
      return badRequest(result.error);
    }

    return ok(result.data);
  } catch (err) {
    console.error("[PATCH /api/orders/drafts/[id]/items/[itemId]]", err);
    return serverError();
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const result = await OrderDraftService.removeItem(
      ctx.restaurantId,
      params.id,
      params.itemId
    );
    if (!result.ok) {
      if (result.status === 404) return notFound(result.error);
      return badRequest(result.error);
    }

    return ok(result.data);
  } catch (err) {
    console.error("[DELETE /api/orders/drafts/[id]/items/[itemId]]", err);
    return serverError();
  }
}
