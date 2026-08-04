/**
 * GET /api/pedido/[slug]/customer-profile?customerId=...
 *
 * Public "área do cliente" endpoint for the ordering flow: the basic profile the
 * identified customer sees — name, phone, email, saved addresses (default first)
 * and tier. Read-only. Coupons come from the separate /coupons endpoint.
 *
 * Security (CR C1): this returns PII (e-mail, full saved addresses), so it requires
 * a PROOF of phone possession — a signed waToken, resolved by lib/pedido-identity.
 * The `customerId` is NEVER trusted from the query; the customer is resolved from the
 * proven phone within the slug's restaurant. Without a valid proof it reveals nothing
 * (`profile: null`). This closes the old leak where a customerId (itself handed out
 * from a bare phone by /identify-customer) unlocked a stranger's home address. Both
 * cross-restaurant AND cross-customer access are blocked. Rate limited.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";
import { resolvePedidoIdentity } from "@/lib/pedido-identity";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const ip = getClientIp(req);
  const rl = rateLimit({ key: `pedido-profile:${ip}`, limit: 30, windowMs: 60_000 });
  if (rl.limited) return rateLimitResponse(rl.retryAfter);

  try {
    const { slug } = await params;

    const restaurant = await prisma.restaurant.findUnique({ where: { slug }, select: { id: true } });
    if (!restaurant) return NextResponse.json({ error: "Restaurante não encontrado" }, { status: 404 });

    // Gate: only a caller who proved possession of the phone can read this profile.
    const identity = await resolvePedidoIdentity(req, restaurant.id);
    if (!identity) return NextResponse.json({ profile: null });

    const customer = await prisma.customer.findFirst({
      where:  { id: identity.customerId, restaurantId: restaurant.id, isActive: true },
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
