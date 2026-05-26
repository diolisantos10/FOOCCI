/**
 * POST /api/orders/manual
 *
 * Creates a manual order (phone order, WhatsApp, walk-in, etc.) on behalf of a customer.
 * Restricted to OWNER and MANAGER roles.
 *
 * If `items` is provided: uses DB-authoritative prices, validates product ownership.
 * If `items` is omitted: falls back to the legacy single-item creation using `total`.
 *
 * Order is always created as CONFIRMED (staff accepted it verbally).
 * Payment status depends on `paymentStatus` field.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { getTenantContext } from "@/lib/tenant";
import { Decimal } from "@prisma/client/runtime/library";

const itemSchema = z.object({
  menuItemId: z.string().min(1),
  quantity:   z.number().int().positive(),
  note:       z.string().optional(),
});

const bodySchema = z.object({
  customerName:  z.string().min(1),
  customerPhone: z.string().optional(),
  notes:         z.string().optional(), // overall order note
  deliveryFee:   z.number().min(0).default(0),
  type:          z.enum(["DELIVERY", "PICKUP"]),
  paymentMethod: z.enum(["CASH", "PIX", "CREDIT_CARD", "DEBIT_CARD", "CARD_MACHINE"]),
  paymentStatus: z.enum(["PAID", "PAY_ON_DELIVERY"]).default("PAID"),
  source:        z.enum(["manual", "whatsapp_manual"]).default("manual"),
  // Real product items (preferred)
  items: z.array(itemSchema).optional(),
  // Legacy: free-text total (used when items not provided)
  total: z.number().positive().optional(),
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

  const {
    customerName, customerPhone, notes, deliveryFee, type,
    paymentMethod, paymentStatus, source, items, total,
  } = parsed.data;
  const { restaurantId } = ctx;

  // ── Validate and resolve items from DB ────────────────────────────────────────
  type ResolvedItem = { menuItemId: string; name: string; price: number; quantity: number; note?: string };
  let resolvedItems: ResolvedItem[] = [];
  let subtotal = 0;

  if (items && items.length > 0) {
    const menuItems = await prisma.menuItem.findMany({
      where: {
        id:       { in: items.map((i) => i.menuItemId) },
        isActive: true,
        category: { restaurantId },
      },
      select: { id: true, name: true, price: true },
    });

    if (menuItems.length !== items.length) {
      const foundIds = new Set(menuItems.map((m) => m.id));
      const missing  = items.find((i) => !foundIds.has(i.menuItemId));
      return NextResponse.json(
        { error: `Produto não encontrado ou inativo: ${missing?.menuItemId ?? ""}` },
        { status: 400 }
      );
    }

    const priceMap = new Map(menuItems.map((m) => [m.id, m]));
    resolvedItems = items.map((i) => {
      const m = priceMap.get(i.menuItemId)!;
      return { menuItemId: m.id, name: m.name, price: Number(m.price), quantity: i.quantity, note: i.note };
    });
    subtotal = resolvedItems.reduce((s, i) => s + i.price * i.quantity, 0);
  } else if (total != null) {
    // Legacy: single dummy item
    subtotal = Math.max(0, total - deliveryFee);
    resolvedItems = [];
  } else {
    return NextResponse.json({ error: "Informe os itens do pedido ou o valor total." }, { status: 400 });
  }

  const orderTotal = subtotal + deliveryFee;
  const phone      = customerPhone?.trim() || `GUEST-${randomUUID()}`;
  const isGuest    = phone.startsWith("GUEST-");

  const order = await prisma.$transaction(async (tx) => {
    // Find or create customer
    let customer = await tx.customer.findFirst({
      where:  { restaurantId, phone },
      select: { id: true },
    });

    if (!customer) {
      customer = await tx.customer.create({
        data:   { restaurantId, name: customerName, phone, isGuest },
        select: { id: true },
      });
    } else {
      await tx.customer.update({
        where: { id: customer.id },
        data:  { name: customerName },
      });
    }

    const created = await tx.order.create({
      data: {
        restaurantId,
        customerId: customer.id,
        status:     "CONFIRMED",
        type:       type === "DELIVERY" ? "DELIVERY" : "PICKUP",
        subtotal:   new Decimal(subtotal),
        deliveryFee: new Decimal(deliveryFee),
        discount:   new Decimal(0),
        total:      new Decimal(orderTotal),
        notes:      notes || null,
        source,
        items: resolvedItems.length > 0
          ? {
              create: resolvedItems.map((i) => ({
                menuItemId: i.menuItemId,
                name:       i.name,
                price:      new Decimal(i.price),
                quantity:   i.quantity,
                total:      new Decimal(i.price * i.quantity),
                notes:      i.note || null,
              })),
            }
          : {
              // Legacy single-line item
              create: {
                name:     notes?.trim() || "Pedido manual",
                price:    new Decimal(subtotal),
                quantity: 1,
                total:    new Decimal(subtotal),
              },
            },
      },
      select: { id: true, status: true, total: true },
    });

    // Payment record
    await tx.payment.create({
      data: {
        orderId:     created.id,
        method:      paymentMethod,
        status:      paymentStatus === "PAID" ? "PAID" : "PAY_ON_DELIVERY",
        amount:      new Decimal(orderTotal),
        paymentMode: type === "DELIVERY"
          ? (paymentStatus === "PAID" ? "PAY_NOW" : "PAY_ON_DELIVERY")
          : (paymentStatus === "PAID" ? "PAY_NOW" : "PAY_ON_PICKUP"),
        paidAt: paymentStatus === "PAID" ? new Date() : null,
      },
    });

    return created;
  });

  return NextResponse.json({ success: true, orderId: order.id });
}
