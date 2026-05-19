/**
 * GET /api/pedido/order-status?orderId=<cuid>
 *
 * Public endpoint — no auth required.
 * Used by the customer-facing PedidoClient to poll order status after checkout.
 *
 * Security: Order IDs are CUIDs (cryptographically non-sequential, ~128 bits of
 * entropy). The orderId itself acts as a bearer token — only the customer who
 * received it from the finalize response can use it. Returns only safe public
 * data (no phone numbers, no admin details).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const FINAL_STATUSES = new Set(["DELIVERED", "CANCELLED"]);

const PAYMENT_LABELS: Record<string, string> = {
  CASH:          "Dinheiro",
  PIX:           "PIX",
  PIX_IN_PERSON: "PIX na entrega",
  CREDIT_CARD:   "Cartão Crédito",
  DEBIT_CARD:    "Cartão Débito",
  CARD_MACHINE:  "Cartão Maquininha",
  ONLINE:        "Online",
};

export async function GET(req: NextRequest) {
  const orderId = req.nextUrl.searchParams.get("orderId");
  if (!orderId || orderId.length < 10) {
    return NextResponse.json({ error: "orderId required" }, { status: 400 });
  }

  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id:          true,
        status:      true,
        type:        true,
        cancelledAt: true,
        completedAt: true,
        createdAt:   true,
        estimatedAt: true,
        restaurant: {
          select: {
            name:    true,
            logoUrl: true,
            storeProfile: { select: { whatsappPhone: true } },
          },
        },
        items: {
          select: { name: true, quantity: true },
          orderBy: { id: "asc" },
        },
        payment: {
          select: { method: true },
        },
      },
    });

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const isFinal = FINAL_STATUSES.has(order.status);
    const rawPhone = order.restaurant.storeProfile?.whatsappPhone ?? null;

    return NextResponse.json({
      id:          order.id,
      orderNumber: order.id.slice(-6).toUpperCase(),
      status:      order.status,
      type:        order.type,
      isFinal,
      cancelledAt: order.cancelledAt?.toISOString() ?? null,
      completedAt: order.completedAt?.toISOString() ?? null,
      createdAt:   order.createdAt.toISOString(),
      estimatedAt: order.estimatedAt?.toISOString() ?? null,
      restaurantName:  order.restaurant.name,
      restaurantPhone: rawPhone ?? null,
      items: order.items.map((i) => ({ name: i.name, quantity: i.quantity })),
      paymentMethod:      order.payment?.method ?? null,
      paymentMethodLabel: order.payment?.method
        ? (PAYMENT_LABELS[order.payment.method] ?? order.payment.method)
        : null,
    });
  } catch (err) {
    console.error("[GET /api/pedido/order-status]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
