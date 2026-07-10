/**
 * GET /api/pedido/[slug]/coupons?customerId=...
 *
 * Public wallet endpoint for the ordering flow: the active coupons a customer has
 * earned and can redeem in THIS restaurant's cart. Read-only.
 *
 * Security: scoped to the slug's restaurant AND the customer must belong to it —
 * no cross-restaurant/customer leakage. Rate limited.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";
import { CustomerCouponService } from "@/services/crm/CustomerCouponService";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const ip = getClientIp(req);
  const rl = rateLimit({ key: `pedido-coupons:${ip}`, limit: 30, windowMs: 60_000 });
  if (rl.limited) return rateLimitResponse(rl.retryAfter);

  try {
    const { slug }   = await params;
    const customerId = req.nextUrl.searchParams.get("customerId")?.trim() ?? "";
    if (!customerId) return NextResponse.json({ coupons: [] });

    const restaurant = await prisma.restaurant.findUnique({ where: { slug }, select: { id: true } });
    if (!restaurant) return NextResponse.json({ error: "Restaurante não encontrado" }, { status: 404 });

    // The customer must belong to this restaurant.
    const customer = await prisma.customer.findFirst({
      where:  { id: customerId, restaurantId: restaurant.id },
      select: { id: true },
    });
    if (!customer) return NextResponse.json({ coupons: [] });

    const coupons = await CustomerCouponService.listActive(restaurant.id, customer.id);
    return NextResponse.json({ coupons });
  } catch (err) {
    console.error("[GET /api/pedido/[slug]/coupons]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
