/**
 * POST /api/orders/manual
 *
 * Creates a manual order (phone order, walk-in, etc.) on behalf of a customer.
 * Restricted to OWNER and MANAGER roles.
 * Order is created with source="manual" and status=CONFIRMED.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { getTenantContext } from "@/lib/tenant";
import { Decimal } from "@prisma/client/runtime/library";

const bodySchema = z.object({
  customerName: z.string().min(1),
  customerPhone: z.string().optional(),
  notes: z.string().min(1),
  total: z.number().positive(),
  deliveryFee: z.number().min(0).default(0),
  type: z.enum(["DELIVERY", "PICKUP"]),
  paymentMethod: z.enum(["CASH", "PIX", "CREDIT_CARD", "DEBIT_CARD", "CARD_MACHINE"]),
});

export async function POST(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  if (!["OWNER", "MANAGER"].includes(ctx.role)) {
    return NextResponse.json(
      { error: "Sem permissão. Apenas OWNER ou MANAGER pode criar pedidos manuais." },
      { status: 403 }
    );
  }

  const raw = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.errors[0];
    return NextResponse.json({ error: first?.message ?? "Dados inválidos" }, { status: 400 });
  }

  const { customerName, customerPhone, notes, total, deliveryFee, type, paymentMethod } =
    parsed.data;
  const { restaurantId } = ctx;

  const subtotal = Math.max(0, total - deliveryFee);
  const phone = customerPhone?.trim() || `GUEST-${randomUUID()}`;
  const isGuest = phone.startsWith("GUEST-");

  const order = await prisma.$transaction(async (tx) => {
    // Find or create customer
    let customer = await tx.customer.findFirst({
      where: { restaurantId, phone },
      select: { id: true },
    });

    if (!customer) {
      customer = await tx.customer.create({
        data: { restaurantId, name: customerName, phone, isGuest },
        select: { id: true },
      });
    } else {
      // Update name if we have a real phone lookup match
      await tx.customer.update({
        where: { id: customer.id },
        data: { name: customerName },
      });
    }

    // Create the order
    const created = await tx.order.create({
      data: {
        restaurantId,
        customerId: customer.id,
        status: "CONFIRMED",
        type: type === "DELIVERY" ? "DELIVERY" : "PICKUP",
        subtotal: new Decimal(subtotal),
        deliveryFee: new Decimal(deliveryFee),
        discount: new Decimal(0),
        total: new Decimal(total),
        notes,
        source: "manual",
        items: {
          create: {
            name: "Pedido manual",
            price: new Decimal(subtotal),
            quantity: 1,
            total: new Decimal(subtotal),
          },
        },
      },
      select: { id: true, status: true, total: true },
    });

    // Create payment record — for manual orders, payment is considered collected
    await tx.payment.create({
      data: {
        orderId: created.id,
        method: paymentMethod,
        status: "PAID",
        amount: new Decimal(total),
        paymentMode: type === "DELIVERY" ? "PAY_ON_DELIVERY" : "PAY_ON_PICKUP",
        paidAt: new Date(),
      },
    });

    return created;
  });

  return NextResponse.json({ success: true, orderId: order.id });
}
