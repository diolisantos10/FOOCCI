/**
 * POST /api/orders/drafts/[id]/confirm
 *
 * Atomic confirmation:
 *   - Validates draft is OPEN and has items
 *   - Creates Order + OrderItems
 *   - Marks OrderDraft.status = CONFIRMED (never deleted)
 *   - Updates Customer denormalized stats
 */
import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { confirmDraftSchema } from "@/validators/order";
import { OrderDraftService } from "@/services/order/OrderDraftService";
import { ok, badRequest, unauthorized, forbidden, notFound, serverError } from "@/lib/api-response";

type Params = { params: { id: string } };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const body = await req.json().catch(() => ({}));
    const parsed = confirmDraftSchema.safeParse(body);
    if (!parsed.success) return badRequest("Validation failed", parsed.error.flatten());

    // Only MANAGER+ can apply a discount
    if (parsed.data.discount > 0 && !["OWNER", "MANAGER"].includes(ctx.role)) {
      return forbidden("Only managers can apply discounts");
    }

    const result = await OrderDraftService.confirm(
      ctx.restaurantId,
      params.id,
      parsed.data
    );

    if (!result.ok) {
      if (result.status === 404) return notFound(result.error);
      return badRequest(result.error);
    }

    return ok(result.data);
  } catch (err) {
    console.error("[POST /api/orders/drafts/[id]/confirm]", err);
    return serverError();
  }
}
