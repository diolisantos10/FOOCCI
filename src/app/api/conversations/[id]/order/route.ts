/**
 * GET /api/conversations/[id]/order
 *
 * Returns two fields:
 *   - `order`  — most recent active (non-delivered, non-cancelled) Order, or null
 *   - `draft`  — active (OPEN) OrderDraft linked to this conversation, or null
 *
 * The draft panel is displayed in the Chat Inbox when the AI is still collecting
 * the order (before confirm_order is called). Once the order is confirmed, `order`
 * is populated and `draft` will be CONFIRMED/absent.
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
      select: { id: true, customerId: true, restaurantId: true },
    });

    if (!conversation || conversation.restaurantId !== ctx.restaurantId) {
      return notFound("Conversation not found");
    }

    if (!conversation.customerId) return ok({ order: null, draft: null });

    const [order, draft] = await Promise.all([
      prisma.order.findFirst({
        where: {
          customerId:   conversation.customerId,
          restaurantId: ctx.restaurantId,
          status:       { notIn: ["DELIVERED", "CANCELLED"] },
        },
        orderBy: { createdAt: "desc" },
        select: {
          id:        true,
          status:    true,
          total:     true,
          type:      true,
          createdAt: true,
          items: {
            select: { name: true, quantity: true, price: true },
            take:   5,
          },
        },
      }),

      prisma.orderDraft.findFirst({
        where: {
          conversationId: conversation.id,
          restaurantId:   ctx.restaurantId,
          status:         "OPEN",
        },
        orderBy: { createdAt: "desc" },
        select: {
          id:             true,
          fulfillmentType: true,
          totalAmount:    true,
          updatedAt:      true,
          items: {
            select: {
              quantity:  true,
              unitPrice: true,
              menuItem:  { select: { name: true } },
            },
          },
        },
      }),
    ]);

    return ok({ order: order ?? null, draft: draft ?? null });
  } catch (err) {
    console.error("[GET /api/conversations/[id]/order]", err);
    return serverError();
  }
}
