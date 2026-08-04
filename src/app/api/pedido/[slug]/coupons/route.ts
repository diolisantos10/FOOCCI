/**
 * GET /api/pedido/[slug]/coupons?customerId=...
 *
 * Public wallet endpoint for the ordering flow: the active coupons a customer has
 * earned and can redeem in THIS restaurant's cart. Read-only.
 *
 * Security (CR C1): a customer's coupon wallet is their own data, so — like the
 * profile/address endpoints — it requires a PROOF of phone possession (signed
 * waToken, via lib/pedido-identity). The customer is resolved from the proven phone,
 * never from a client-supplied customerId. No proof → empty wallet. Rate limited.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";
import { CustomerCouponService } from "@/services/crm/CustomerCouponService";
import { resolvePedidoIdentity } from "@/lib/pedido-identity";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const ip = getClientIp(req);
  const rl = rateLimit({ key: `pedido-coupons:${ip}`, limit: 30, windowMs: 60_000 });
  if (rl.limited) return rateLimitResponse(rl.retryAfter);

  try {
    const { slug } = await params;

    const restaurant = await prisma.restaurant.findUnique({ where: { slug }, select: { id: true } });
    if (!restaurant) return NextResponse.json({ error: "Restaurante não encontrado" }, { status: 404 });

    // Gate: only a caller who proved possession of the phone sees the wallet.
    const identity = await resolvePedidoIdentity(req, restaurant.id);
    if (!identity) return NextResponse.json({ coupons: [] });

    const coupons = await CustomerCouponService.listActive(restaurant.id, identity.customerId);
    return NextResponse.json({ coupons });
  } catch (err) {
    console.error("[GET /api/pedido/[slug]/coupons]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
