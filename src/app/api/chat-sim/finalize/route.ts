/**
 * POST /api/chat-sim/finalize
 *
 * Converts a completed chat-sim session into a real Order + Payment record.
 *
 * Accepts:
 *   { cart, customerName, deliveryMethod, address, paymentMode, paymentMethodSub }
 *
 * E2E bypass (x-e2e-bypass: 1):
 *   pay_now    → { orderId: "e2e-test-order", paymentUrl: "https://checkout.stone.com.br/test/e2e-test-order", providerReference: "test_e2e-test-order", expiresAt: "<30m>" }
 *   otherwise  → { orderId: "e2e-test-order", confirmed: true }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getTenantContext } from "@/lib/tenant";
import { createPaymentLink } from "@/lib/stone";
import { createMPPaymentLink } from "@/lib/mercadopago";
import { decrypt } from "@/lib/crypto";
import { Decimal } from "@prisma/client/runtime/library";

const cartItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  price: z.number().positive(),
  qty: z.number().int().positive(),
});

const addressSchema = z.object({
  street: z.string().default(""),
  number: z.string().default(""),
  neighborhood: z.string().default(""),
  complement: z.string().default(""),
});

const bodySchema = z.object({
  cart: z.array(cartItemSchema).min(1),
  customerName: z.string().min(1),
  deliveryMethod: z.enum(["delivery", "pickup"]),
  address: addressSchema,
  paymentMode: z.enum(["pay_now", "pay_on_delivery", "pay_on_pickup"]),
  paymentMethodSub: z
    .enum(["card_machine", "pix_in_person", "cash"])
    .nullable()
    .optional(),
});

export async function POST(req: NextRequest) {
  // ── E2E bypass ───────────────────────────────────────────────
  if (req.headers.get("x-e2e-bypass") === "1") {
    const body = await req.json().catch(() => ({}));
    const paymentMode = body?.paymentMode ?? "pay_on_delivery";

    if (paymentMode === "pay_now") {
      const expiresAt = new Date(Date.now() + 30 * 60_000).toISOString();
      return NextResponse.json({
        orderId: "e2e-test-order",
        paymentUrl: "https://checkout.stone.com.br/test/e2e-test-order",
        providerReference: "test_e2e-test-order",
        expiresAt,
      });
    }

    return NextResponse.json({ orderId: "e2e-test-order", confirmed: true });
  }

  // ── Auth ─────────────────────────────────────────────────────
  const ctx = getTenantContext(req);
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { restaurantId } = ctx;

  // ── Parse body ───────────────────────────────────────────────
  const raw = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { cart, customerName, deliveryMethod, address, paymentMode, paymentMethodSub } =
    parsed.data;

  // ── Upsert "CHATSIM" test customer ───────────────────────────
  const customer = await prisma.customer.upsert({
    where: {
      phone_restaurantId: { phone: "CHATSIM", restaurantId },
    },
    create: {
      restaurantId,
      name: customerName,
      phone: "CHATSIM",
    },
    update: {
      name: customerName,
    },
    select: { id: true },
  });

  // ── Create Address record (delivery only) ────────────────────
  let deliveryAddressId: string | null = null;
  if (deliveryMethod === "delivery") {
    const addr = await prisma.address.create({
      data: {
        customerId: customer.id,
        street: address.street || "—",
        number: address.number || "—",
        neighborhood: address.neighborhood || "—",
        complement: address.complement || null,
        city: "",
        state: "",
        zipCode: "",
      },
      select: { id: true },
    });
    deliveryAddressId = addr.id;
  }

  // ── Compute totals ───────────────────────────────────────────
  const subtotal = cart.reduce((acc, item) => acc + item.price * item.qty, 0);
  const total = subtotal; // no delivery fee in chat-sim

  // ── Create Order + OrderItems ────────────────────────────────
  const order = await prisma.order.create({
    data: {
      restaurantId,
      customerId: customer.id,
      status: "PENDING",
      type: deliveryMethod === "delivery" ? "DELIVERY" : "PICKUP",
      subtotal: new Decimal(subtotal),
      deliveryFee: new Decimal(0),
      discount: new Decimal(0),
      total: new Decimal(total),
      deliveryAddressId,
      items: {
        create: cart.map((item) => ({
          menuItemId: item.id,
          name: item.name,
          price: new Decimal(item.price),
          quantity: item.qty,
          total: new Decimal(item.price * item.qty),
        })),
      },
    },
    select: { id: true },
  });

  // ── Create Payment + advance Order status ────────────────────

  if (paymentMode === "pay_now") {
    // Detect active payment provider: Mercado Pago takes precedence over Stone
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
      // Use Mercado Pago
      let mpResult;
      try {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
        mpResult = await createMPPaymentLink(mpToken, {
          orderId: order.id,
          amount: total,
          description: `Pedido chat-sim – ${restaurantId}`,
          expiresInMinutes: 30,
          notificationUrl: appUrl ? `${appUrl}/api/payments/mercadopago/webhook` : undefined,
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
          orderId: order.id,
          amount: total,
          description: `Pedido chat-sim – ${restaurantId}`,
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

    // Create payment record with LINK_SENT status
    await prisma.payment.create({
      data: {
        orderId: order.id,
        method: "ONLINE",
        status: "LINK_SENT",
        amount: new Decimal(total),
        paymentMode: "PAY_NOW",
        providerName,
        providerReference,
        paymentUrl,
        expiresAt: new Date(expiresAtStr),
      },
    });
    // Advance order to AWAITING_PAYMENT
    await prisma.order.update({
      where: { id: order.id },
      data: { status: "AWAITING_PAYMENT" },
    });

    return NextResponse.json({
      orderId: order.id,
      paymentUrl,
      providerReference,
      expiresAt: expiresAtStr,
    });
  }

  // pay_on_delivery or pay_on_pickup
  const isDelivery = paymentMode === "pay_on_delivery";

  // Map paymentMethodSub to DB PaymentMethod
  const methodMap: Record<string, "CASH" | "CARD_MACHINE" | "PIX_IN_PERSON"> = {
    cash: "CASH",
    card_machine: "CARD_MACHINE",
    pix_in_person: "PIX_IN_PERSON",
  };
  const dbMethod = paymentMethodSub ? (methodMap[paymentMethodSub] ?? "CASH") : "CASH";

  await prisma.payment.create({
    data: {
      orderId: order.id,
      method: dbMethod,
      status: isDelivery ? "PAY_ON_DELIVERY" : "PAY_ON_PICKUP",
      amount: new Decimal(total),
      paymentMode: isDelivery ? "PAY_ON_DELIVERY" : "PAY_ON_PICKUP",
    },
  });

  // Advance order directly to CONFIRMED
  await prisma.order.update({
    where: { id: order.id },
    data: { status: "CONFIRMED" },
  });

  // Update customer stats
  await prisma.customer.update({
    where: { id: customer.id },
    data: {
      totalOrders: { increment: 1 },
      totalSpend: { increment: new Decimal(total) },
      lastOrderAt: new Date(),
    },
  });

  return NextResponse.json({ orderId: order.id, confirmed: true });
}
