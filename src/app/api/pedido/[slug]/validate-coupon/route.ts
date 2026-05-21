/**
 * POST /api/pedido/[slug]/validate-coupon
 *
 * Public endpoint — validates a coupon code for the online ordering flow.
 * Called by the /pedido/[slug] UI before the customer submits the order.
 * The finalize route independently re-validates before applying the discount.
 *
 * Checks:
 *   - Promotion exists, is ACTIVE, and has a matching couponCode
 *   - Channel is compatible with deliveryMethod
 *   - startsAt / endsAt validity window
 *   - daysOfWeek (if configured)
 *   - minOrderValue ≤ subtotal
 *   - maxUses not exhausted
 *   - oneTimePerUser (only if customerId provided)
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({
  couponCode:     z.string().min(1).max(50),
  subtotal:       z.number().positive(),
  deliveryFee:    z.number().nonnegative().optional(),
  deliveryMethod: z.enum(["delivery", "pickup"]),
  customerId:     z.string().optional(),
});

function computeDiscount(
  type: string,
  discountValue: number,
  subtotal: number,
  deliveryFee: number,
): number {
  switch (type) {
    case "PERCENTAGE":
      return Math.min((subtotal * discountValue) / 100, subtotal);
    case "FIXED":
    case "COUPON":
      return Math.min(discountValue, subtotal + deliveryFee);
    case "FREE_DELIVERY":
      return deliveryFee;
    default:
      return 0;
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  const restaurant = await prisma.restaurant.findUnique({
    where:  { slug },
    select: { id: true },
  });
  if (!restaurant) {
    return NextResponse.json({ error: "Restaurante não encontrado" }, { status: 404 });
  }

  const raw    = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ valid: false, error: "Dados inválidos" }, { status: 400 });
  }

  const { couponCode, subtotal, deliveryFee = 0, deliveryMethod, customerId } = parsed.data;

  const promo = await prisma.promotion.findFirst({
    where: {
      restaurantId: restaurant.id,
      status:       "ACTIVE",
      couponCode:   { equals: couponCode.trim(), mode: "insensitive" },
    },
  });

  if (!promo) {
    return NextResponse.json({ valid: false, error: "Cupom inválido ou expirado" });
  }

  const now = new Date();

  if (promo.startsAt && promo.startsAt > now) {
    return NextResponse.json({ valid: false, error: "Cupom ainda não é válido" });
  }
  if (promo.endsAt && promo.endsAt < now) {
    return NextResponse.json({ valid: false, error: "Cupom expirado" });
  }

  if (promo.daysOfWeek.length > 0 && !promo.daysOfWeek.includes(now.getDay())) {
    return NextResponse.json({ valid: false, error: "Cupom não válido hoje" });
  }

  const channel = promo.channel;
  if (channel === "WHATSAPP") {
    return NextResponse.json({ valid: false, error: "Cupom inválido para este canal" });
  }
  if (channel === "DELIVERY" && deliveryMethod !== "delivery") {
    return NextResponse.json({ valid: false, error: "Cupom válido apenas para pedidos com entrega" });
  }
  if (channel === "QR_MENU" && deliveryMethod !== "pickup") {
    return NextResponse.json({ valid: false, error: "Cupom válido apenas para retirada no balcão" });
  }

  if (promo.minOrderValue !== null && subtotal < Number(promo.minOrderValue)) {
    const minFormatted = Number(promo.minOrderValue).toFixed(2).replace(".", ",");
    return NextResponse.json({
      valid: false,
      error: `Pedido mínimo de R$ ${minFormatted} para este cupom`,
    });
  }

  if (promo.maxUses !== null && promo.maxUses > 0 && promo.usedCount >= promo.maxUses) {
    return NextResponse.json({ valid: false, error: "Cupom esgotado" });
  }

  if (promo.oneTimePerUser && customerId) {
    const alreadyUsed = await prisma.order.findFirst({
      where: {
        customerId,
        promotionId: promo.id,
        status:      { notIn: ["AWAITING_PAYMENT", "CANCELLED"] },
      },
      select: { id: true },
    });
    if (alreadyUsed) {
      return NextResponse.json({ valid: false, error: "Cupom já utilizado por este cliente" });
    }
  }

  const discountAmount = Math.max(
    0,
    Math.round(computeDiscount(promo.type, Number(promo.discountValue), subtotal, deliveryFee) * 100) / 100,
  );

  return NextResponse.json({
    valid:         true,
    promotionId:   promo.id,
    couponCode:    promo.couponCode ?? couponCode.trim(),
    discountType:  promo.type,
    discountValue: Number(promo.discountValue),
    discountAmount,
    name:          promo.name,
  });
}
