import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { orderListQuerySchema } from "@/validators/order";
import { OrderService } from "@/services/order/OrderService";
import { ok, badRequest, unauthorized, serverError } from "@/lib/api-response";

export async function GET(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const parsed = orderListQuerySchema.safeParse(
      Object.fromEntries(req.nextUrl.searchParams.entries())
    );
    if (!parsed.success) return badRequest("Invalid query", parsed.error.flatten());

    const result = await OrderService.list(ctx.restaurantId, parsed.data);
    if (!result.ok) return serverError(result.error);

    return ok(result.data);
  } catch (err) {
    console.error("[GET /api/orders]", err);
    return serverError();
  }
}
