/**
 * POST /api/pedido/[slug]/finalize
 *
 * Finalizes a customer order from the public QR / delivery menu.
 * Creates real Order + Payment records in the DB.
 *
 * pay_now   → creates Mercado Pago preference (falls back to Stone)
 *             returns { orderId, paymentUrl, providerReference, expiresAt }
 * others    → creates payment record with PAY_ON_DELIVERY / PAY_ON_PICKUP
 *             returns { orderId, confirmed: true }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createMPPaymentLink } from "@/lib/mercadopago";
import { createPaymentLink } from "@/lib/stone";
import { decrypt } from "@/lib/crypto";
import { Decimal } from "@prisma/client/runtime/library";

const cartItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  price: z.number().positive(),
  qty: z.number().int().positive(),
});

const addressSchema = z.object({
  street:       z.string().default(""),
  number:       z.string().default(""),
  neighborhood: z.string().default(""),
  complement:   z.string().default(""),
});

const bodySchema = z.object({
  cart:             z.array(cartItemSchema).min(1),
  customerName:     z.string().min(1),
  deliveryMethod:   z.enum(["delivery", "pickup"]),
  address:          addressSchema,
  paymentMode:      z.enum(["pay_now", "pay_on_delivery", "pay_on_pickup"]),
  paymentMethodSub: z.enum(["card_machine", "pix_in_person", "cash"]).nullable().optional(),
  customerPhone:    z.string().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  // Look up restaurant by slug
  const restaurant = await prisma.restaurant.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!restaurant) {
    return NextResponse.json({ error: "Restaurante não encontrado" }, { status: 404 });
  }
  const restaurantId = restaurant.id;

  const raw = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos", issues: parsed.error.issues }, { status: 400 });
  }

  const { cart, customerName, deliveryMethod, address, paymentMode, paymentMethodSub, customerPhone } = parsed.data;

  // Upsert customer
  const phone = customerPhone?.trim() || "WALK-IN";
  const customer = await prisma.customer.upsert({
    where: { phone_restaurantId: { phone, restaurantId } },
    create: { restaurantId, name: customerName, phone },
    update: { name: customerName },
    select: { id: true },
  });

  // Create address record for delivery
  let deliveryAddressId: string | null = null;
  if (deliveryMethod === "delivery") {
    const addr = await prisma.address.create({
      data: {
        customerId:   customer.id,
        street:       address.street || "—",
        number:       address.number || "—",
        neighborhood: address.neighborhood || "—",
        complement:   address.complement || null,
        city:         "",
        state:        "",
        zipCode:      "",
      },
      select: { id: true },
    });
    deliveryAddressId = addr.id;
  }

  // Compute total
  const subtotal = cart.reduce((acc, item) => acc + item.price * item.qty, 0);

  // Create order
  const order = await prisma.order.create({
    data: {
      restaurantId,
      customerId:  customer.id,
      status:      "PENDING",
      type:        deliveryMethod === "delivery" ? "DELIVERY" : "PICKUP",
      subtotal:    new Decimal(subtotal),
      deliveryFee: new Decimal(0),
      discount:    new Decimal(0),
      total:       new Decimal(subtotal),
      deliveryAddressId,
      items: {
        create: cart.map((item) => ({
          menuItemId: item.id,
          name:       item.name,
          price:      new Decimal(item.price),
          quantity:   item.qty,
          total:      new Decimal(item.price * item.qty),
        })),
      },
    },
    select: { id: true },
  });

  // ── pay_now: generate online payment link ──────────────────────
  if (paymentMode === "pay_now") {
    // Try Mercado Pago first
    const mpCfg = await prisma.integrationConfig.findUnique({
      where: { restaurantId_provider: { restaurantId, provider: "mercadopago" } },
      select: { configBlob: true, isActive: true },
    });
    const mpToken = mpCfg?.isActive
      ? (() => {
          try { return (JSON.parse(decrypt(mpCfg.configBlob)) as { accessToken: string }).accessToken; }
          catch { return null; }
        })()
      : null;

    let providerReference: string;
    let paymentUrl: string;
    let expiresAtStr: string;
    let providerName: string;

    if (mpToken) {
      let mpResult;
      try {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
        mpResult = await createMPPaymentLink(mpToken, {
          orderId:          order.id,
          amount:           subtotal,
          description:      `Pedido – ${restaurantId}`,
          expiresInMinutes: 30,
          notificationUrl:  appUrl ? `${appUrl}/api/payments/mercadopago/webhook` : undefined,
        });
      } catch (err) {
        await prisma.order.delete({ where: { id: order.id } });
        const msg = err instanceof Error ? err.message : "MP error";
        return NextResponse.json({ error: msg }, { status: 502 });
      }
      providerReference = mpResult.providerReference;
      paymentUrl        = mpResult.paymentUrl;
      expiresAtStr      = mpResult.expiresAt;
      providerName      = "mercadopago";
    } else {
      // Fall back to Stone
      let stoneResult;
      try {
        stoneResult = await createPaymentLink({
          orderId:          order.id,
          amount:           subtotal,
          description:      `Pedido – ${restaurantId}`,
          expiresInMinutes: 30,
        });
      } catch (err) {
        await prisma.order.delete({ where: { id: order.id } });
        const msg = err instanceof Error ? err.message : "Stone error";
        return NextResponse.json({ error: msg }, { status: 502 });
      }
      providerReference = stoneResult.providerReference;
      paymentUrl        = stoneResult.paymentUrl;
      expiresAtStr      = stoneResult.expiresAt;
      providerName      = "stone";
    }

    await prisma.payment.create({
      data: {
        orderId:           order.id,
        method:            "ONLINE",
        status:            "LINK_SENT",
        amount:            new Decimal(subtotal),
        paymentMode:       "PAY_NOW",
        providerName,
        providerReference,
        paymentUrl,
        expiresAt:         new Date(expiresAtStr),
      },
    });
    await prisma.order.update({
      where: { id: order.id },
      data:  { status: "AWAITING_PAYMENT" },
    });

    return NextResponse.json({ orderId: order.id, paymentUrl, providerReference, expiresAt: expiresAtStr });
  }

  // ── pay_on_delivery / pay_on_pickup ────────────────────────────
  const isDelivery = paymentMode === "pay_on_delivery";
  const methodMap: Record<string, "CASH" | "CARD_MACHINE" | "PIX_IN_PERSON"> = {
    cash:           "CASH",
    card_machine:   "CARD_MACHINE",
    pix_in_person:  "PIX_IN_PERSON",
  };
  const dbMethod = paymentMethodSub ? (methodMap[paymentMethodSub] ?? "CASH") : "CASH";

  await prisma.payment.create({
    data: {
      orderId:     order.id,
      method:      dbMethod,
      status:      isDelivery ? "PAY_ON_DELIVERY" : "PAY_ON_PICKUP",
      amount:      new Decimal(subtotal),
      paymentMode: isDelivery ? "PAY_ON_DELIVERY" : "PAY_ON_PICKUP",
    },
  });
  await prisma.order.update({
    where: { id: order.id },
    data:  { status: "CONFIRMED" },
  });

  // Update customer stats
  await prisma.customer.update({
    where: { id: customer.id },
    data: {
      totalOrders: { increment: 1 },
      totalSpend:  { increment: new Decimal(subtotal) },
      lastOrderAt: new Date(),
    },
  });

  return NextResponse.json({ orderId: order.id, confirmed: true });
}
