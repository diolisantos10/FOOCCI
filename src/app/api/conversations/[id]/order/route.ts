/**
 * GET /api/conversations/[id]/order
 *
 * Returns the most recent active (non-delivered, non-cancelled) Order
 * for the customer linked to this conversation.
 * Returns null in `data` when no active order exists.
 */

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTenantContext } from "@/lib/tenant";
import { ok, unauthorized, notFound, serverError } from "@/lib/api-response";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();

  try {
    const conversation = await prisma.conversation.findUnique({
      where:  { id: params.id },
      select: { customerId: true, restaurantId: true },
    });

    if (!conversation || conversation.restaurantId !== ctx.restaurantId) {
      return notFound("Conversation not found");
    }

    const order = await prisma.order.findFirst({
      where: {
        customerId:   conversation.customerId,
        restaurantId: ctx.restaurantId,
        status:       { notIn: ["DELIVERED", "CANCELLED"] },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id:     true,
        status: true,
        total:  true,
        type:   true,
        items: {
          select: { name: true, quantity: true, price: true },
          take:   5,
        },
      },
    });

    return ok(order ?? null);
  } catch (err) {
    console.error("[GET /api/conversations/[id]/order]", err);
    return serverError();
  }
}
