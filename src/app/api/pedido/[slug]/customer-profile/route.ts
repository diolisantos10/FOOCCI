/**
 * GET /api/pedido/[slug]/customer-profile?customerId=...
 *
 * Public "área do cliente" endpoint for the ordering flow: the basic profile the
 * identified customer sees — name, phone, email, saved addresses (default first)
 * and tier. Read-only. Coupons come from the separate /coupons endpoint.
 *
 * Security: scoped to the slug's restaurant AND the customer must belong to it —
 * no cross-restaurant/customer leakage. Rate limited.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const ip = getClientIp(req);
  const rl = rateLimit({ key: `pedido-profile:${ip}`, limit: 30, windowMs: 60_000 });
  if (rl.limited) return rateLimitResponse(rl.retryAfter);

  try {
    const { slug }   = await params;
    const customerId = req.nextUrl.searchParams.get("customerId")?.trim() ?? "";
    if (!customerId) return NextResponse.json({ profile: null });

    const restaurant = await prisma.restaurant.findUnique({ where: { slug }, select: { id: true } });
    if (!restaurant) return NextResponse.json({ error: "Restaurante não encontrado" }, { status: 404 });

    // The customer must belong to this restaurant (no cross-tenant leakage).
    const customer = await prisma.customer.findFirst({
      where:  { id: customerId, restaurantId: restaurant.id, isActive: true },
      select: { id: true, name: true, phone: true, email: true, tier: true },
    });
    if (!customer) return NextResponse.json({ profile: null });

    const addresses = await prisma.address.findMany({
      where:   { customerId: customer.id },
      orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
      select: {
        id: true, label: true, street: true, number: true, complement: true,
        neighborhood: true, city: true, state: true, zipCode: true, isDefault: true,
      },
    });

    const fullName = customer.name?.trim() ?? "";
    const parts    = fullName.split(/\s+/).filter(Boolean);
    const firstName = parts[0] ?? "";
    const lastName  = parts.length > 1 ? parts.slice(1).join(" ") : "";

    return NextResponse.json({
      profile: {
        name:      fullName,
        firstName,
        lastName,
        phone:     customer.phone ?? null,
        email:     customer.email ?? null,
        tier:      customer.tier ?? null,
        addresses,
      },
    });
  } catch (err) {
    console.error("[GET /api/pedido/[slug]/customer-profile]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
