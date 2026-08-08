import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { updateOrderStatusSchema } from "@/validators/order";
import { OrderService } from "@/services/order/OrderService";
import { OrderDeleteService } from "@/services/order/OrderDeleteService";
import { auditLog } from "@/lib/audit";
import { ok, badRequest, unauthorized, forbidden, notFound, serverError } from "@/lib/api-response";

type Params = { params: { id: string } };

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const result = await OrderService.getById(ctx.restaurantId, params.id);
    if (!result.ok) return notFound(result.error);

    return ok(result.data);
  } catch (err) {
    console.error("[GET /api/orders/[id]]", err);
    return serverError();
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const body = await req.json();
    const parsed = updateOrderStatusSchema.safeParse(body);
    if (!parsed.success) return badRequest("Validation failed", parsed.error.flatten());

    // ctx.userId é quem está agindo: vira o carimbo alarmAckAt/alarmAckByUserId,
    // que é o que cala o som do pedido em TODA aba e TODO aparelho.
    const result = await OrderService.updateStatus(ctx.restaurantId, params.id, parsed.data, ctx.userId);
    if (!result.ok) {
      if (result.status === 404) return notFound(result.error);
      return badRequest(result.error);
    }

    auditLog({
      action: "order.status_change",
      restaurantId: ctx.restaurantId,
      userId: ctx.userId,
      targetId: params.id,
      meta: { status: parsed.data.status },
    });

    return ok(result.data);
  } catch (err) {
    console.error("[PATCH /api/orders/[id]]", err);
    return serverError();
  }
}

/**
 * DELETE /api/orders/[id]
 *
 * Permanently removes an order and reverses all its internal side-effects:
 * order items, payment, coupon usage, customer metrics, and linked OrderDraft.
 *
 * Restricted to OWNER role only.
 * TODO: When MASTER_ADMIN role is added, also allow MASTER_ADMIN here.
 */
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    // Destructive delete: OWNER only
    if (ctx.role !== "OWNER") {
      return forbidden("Apenas proprietários podem apagar pedidos permanentemente.");
    }

    const result = await OrderDeleteService.deleteOrder(ctx.restaurantId, params.id);
    if (!result.ok) {
      if (result.status === 404) return notFound(result.error);
      return serverError(result.error);
    }

    auditLog({
      action:       "order.delete",
      restaurantId: ctx.restaurantId,
      userId:       ctx.userId,
      targetId:     params.id,
      meta: { customerMetricsRebuilt: result.data.customerMetricsRebuilt },
    });

    return ok({ deletedId: params.id });
  } catch (err) {
    console.error("[DELETE /api/orders/[id]]", err);
    return serverError();
  }
}
