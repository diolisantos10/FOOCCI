/**
 * POST /api/orders/[id]/item-replacement
 *
 * Replaces one OrderItem with a different product/configuration.
 * Recalculates order total server-side. Does NOT touch external payments.
 *
 * Authorization: MANAGER or OWNER only.
 * Tenant: restaurantId from JWT; order validated to belong to that restaurant.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { replaceOrderItemSchema } from "@/validators/order";
import { OrderItemReplacementService } from "@/services/order/OrderItemReplacementService";
import { auditLog } from "@/lib/audit";
import {
  ok,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  serverError,
} from "@/lib/api-response";

type Params = { params: { id: string } };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    // Only MANAGER and OWNER may edit order items
    if (!["OWNER", "MANAGER"].includes(ctx.role)) {
      return forbidden("Apenas gerentes e proprietários podem alterar itens de um pedido.");
    }

    const body = await req.json();
    const parsed = replaceOrderItemSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest("Dados inválidos", parsed.error.flatten());
    }

    const result = await OrderItemReplacementService.replaceItem(
      ctx.restaurantId,
      params.id,
      parsed.data,
      ctx.userId,
    );

    if (!result.ok) {
      if (result.status === 404) return notFound(result.error);
      return badRequest(result.error);
    }

    auditLog({
      action:       "order.item_replaced",
      restaurantId: ctx.restaurantId,
      userId:       ctx.userId,
      targetId:     params.id,
      meta: {
        editLogId:     result.data.editLogId,
        reason:        parsed.data.reason,
        previousTotal: result.data.previousTotal,
        newTotal:      result.data.newTotal,
        priceDiff:     result.data.priceDiff,
      },
    });

    return ok(result.data);
  } catch (err) {
    console.error("[POST /api/orders/[id]/item-replacement]", err);
    return serverError();
  }
}
