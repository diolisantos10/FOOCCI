/**
 * POST /api/pedido/[slug]/identify-customer
 *
 * Phone-first customer identification for the public ordering flow.
 * Delegates to the same CRM lookup used by /api/qr/[slug]/identify.
 *
 * Body: { phone: string; name?: string }
 *
 * Response (found):     { found: true,  name, customerId }
 * Response (not found): { found: false, normalizedPhone }
 * Response (created):   { found: false, name, customerId }
 *
 * Security: scoped to restaurantId from slug — no cross-restaurant leakage.
 * Rate limit: 20 req / 60 s per IP.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";
import { phoneCandidates, toE164, customerFirstName, CUSTOMER_LOOKUP_ORDER } from "@/lib/phone";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const ip = getClientIp(req);
  const rl = rateLimit({ key: `pedido-identify:${ip}`, limit: 20, windowMs: 60_000 });
  if (rl.limited) return rateLimitResponse(rl.retryAfter);

  try {
    const { slug } = await params;
    const body     = await req.json().catch(() => ({}));
    const rawPhone = String(body.phone ?? "").trim();
    const rawName  = String(body.name  ?? "").trim();

    const candidates = phoneCandidates(rawPhone);
    if (candidates.length === 0) {
      return NextResponse.json({ error: "Telefone inválido" }, { status: 400 });
    }

    const restaurant = await prisma.restaurant.findUnique({
      where:  { slug },
      select: { id: true },
    });
    if (!restaurant) {
      return NextResponse.json({ error: "Restaurante não encontrado" }, { status: 404 });
    }

    const existing = await prisma.customer.findFirst({
      where: {
        restaurantId: restaurant.id,
        phone:        { in: candidates },
        isActive:     true,
      },
      orderBy: CUSTOMER_LOOKUP_ORDER, // duplicata sem histórico nunca vence o cadastro rico
      select: {
        id:          true,
        name:        true,
        totalOrders: true,
        totalSpend:  true,
        lastOrderAt: true,
      },
    });

    if (existing) {
      let firstName = customerFirstName(existing.name);
      // Cadastro com nome-fantasma e o cliente informou o nome real → corrige.
      if (!firstName && rawName.length >= 2) {
        await prisma.customer
          .update({ where: { id: existing.id }, data: { name: rawName } })
          .catch(() => { /* best-effort */ });
        firstName = rawName.split(/\s+/)[0]!;
      }
      return NextResponse.json({
        found:         true,
        name:          firstName ?? undefined,
        customerId:    existing.id,
        orderCount:    existing.totalOrders ?? 0,
        totalSpent:    existing.totalSpend ? Number(existing.totalSpend) : 0,
        lastOrderDate: existing.lastOrderAt?.toISOString() ?? null,
      });
    }

    const normalizedPhone = toE164(rawPhone);

    // New customer — create in CRM if name was provided
    if (rawName.length >= 2) {
      const created = await prisma.customer.create({
        data: {
          restaurantId: restaurant.id,
          name:         rawName,
          phone:        normalizedPhone,
          isActive:     true,
        },
        select: { id: true },
      }).catch(() => null);

      const firstName = rawName.trim().split(/\s+/)[0]!;
      return NextResponse.json({
        found:          false,
        name:           firstName,
        customerId:     created?.id ?? undefined,
        normalizedPhone,
      });
    }

    return NextResponse.json({ found: false, normalizedPhone });
  } catch (err) {
    console.error("[POST /api/pedido/[slug]/identify-customer]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
