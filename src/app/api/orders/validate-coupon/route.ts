/**
 * POST /api/orders/validate-coupon
 *
 * Operator-only coupon validation for the ManualOrderModal.
 * Restricted to OWNER and MANAGER roles via getTenantContext().
 *
 * Mirrors /api/pedido/[slug]/validate-coupon but:
 *   - Uses tenant auth (JWT) — no public slug in URL.
 *   - Allows WHATSAPP-channel coupons: manual orders frequently originate
 *     from WhatsApp, so operators must be able to apply those codes.
 *   - Channel check uses order type (DELIVERY / PICKUP) instead of a
 *     client-supplied deliveryMethod string.
 *
 * The UI calls this for immediate feedback. POST /api/orders/manual
 * independently re-validates before creating the order — client discount
 * amounts are never trusted.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getTenantContext } from "@/lib/tenant";

const bodySchema = z.object({
  couponCode:  z.string().min(1).max(50),
  subtotal:    z.number().positive(),
  deliveryFee: z.number().nonnegative().default(0),
  type:        z.enum(["DELIVERY", "PICKUP"]),
});

function computeDiscount(
  promoType:     string,
  discountValue: number,
  subtotal:      number,
  deliveryFee:   number,
): number {
  switch (promoType) {
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

export async function POST(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return NextResponse.json({ valid: false, error: "Não autorizado" }, { status: 401 });

  if (!["OWNER", "MANAGER"].includes(ctx.role)) {
    return NextResponse.json({ valid: false, error: "Sem permissão" }, { status: 403 });
  }

  const raw    = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ valid: false, error: "Dados inválidos" }, { status: 400 });
  }

  const { couponCode, subtotal, deliveryFee, type } = parsed.data;
  const { restaurantId } = ctx;

  const promo = await prisma.promotion.findFirst({
    where: {
      restaurantId,
      status:     "ACTIVE",
      couponCode: { equals: couponCode.trim(), mode: "insensitive" },
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

  // Channel: DELIVERY / QR_MENU restrictions honoured.
  // WHATSAPP channel allowed — manual orders commonly originate from WhatsApp.
  const isDelivery = type === "DELIVERY";
  if (promo.channel === "DELIVERY" && !isDelivery) {
    return NextResponse.json({ valid: false, error: "Cupom válido apenas para pedidos com entrega" });
  }
  if (promo.channel === "QR_MENU" && isDelivery) {
    return NextResponse.json({ valid: false, error: "Cupom válido apenas para retirada no balcão" });
  }

  if (promo.minOrderValue !== null && subtotal < Number(promo.minOrderValue)) {
    const min = Number(promo.minOrderValue).toFixed(2).replace(".", ",");
    return NextResponse.json({ valid: false, error: `Pedido mínimo de R$ ${min} para este cupom` });
  }

  if (promo.maxUses !== null && promo.maxUses > 0 && promo.usedCount >= promo.maxUses) {
    return NextResponse.json({ valid: false, error: "Cupom esgotado" });
  }

  const discountAmount = Math.max(
    0,
    Math.round(
      computeDiscount(promo.type, Number(promo.discountValue), subtotal, deliveryFee) * 100,
    ) / 100,
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
