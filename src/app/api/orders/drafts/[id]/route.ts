/**
 * GET   /api/orders/drafts/[id]       – fetch draft with items
 * PATCH /api/orders/drafts/[id]       – update fulfillmentType, address, deliveryFee, notes
 * POST  /api/orders/drafts/[id]/items – add item     (see /items/route.ts)
 */
import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { addDraftItemSchema, updateDraftSchema } from "@/validators/order";
import { OrderDraftService } from "@/services/order/OrderDraftService";
import { ok, created, badRequest, unauthorized, notFound, serverError } from "@/lib/api-response";

type Params = { params: { id: string } };

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const result = await OrderDraftService.getById(ctx.restaurantId, params.id);
    if (!result.ok) return notFound(result.error);

    return ok(result.data);
  } catch (err) {
    console.error("[GET /api/orders/drafts/[id]]", err);
    return serverError();
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const body = await req.json();

    // ?action=add-item
    if (req.nextUrl.searchParams.get("action") === "add-item") {
      const parsed = addDraftItemSchema.safeParse(body);
      if (!parsed.success) return badRequest("Validation failed", parsed.error.flatten());

      const result = await OrderDraftService.addItem(ctx.restaurantId, params.id, parsed.data);
      if (!result.ok) {
        if (result.status === 404) return notFound(result.error);
        return badRequest(result.error);
      }
      return ok(result.data);
    }

    const parsed = updateDraftSchema.safeParse(body);
    if (!parsed.success) return badRequest("Validation failed", parsed.error.flatten());

    const result = await OrderDraftService.update(ctx.restaurantId, params.id, parsed.data);
    if (!result.ok) {
      if (result.status === 404) return notFound(result.error);
      return badRequest(result.error);
    }

    return ok(result.data);
  } catch (err) {
    console.error("[PATCH /api/orders/drafts/[id]]", err);
    return serverError();
  }
}
