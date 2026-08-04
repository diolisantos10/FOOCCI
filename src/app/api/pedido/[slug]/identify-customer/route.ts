/**
 * POST /api/pedido/[slug]/identify-customer
 *
 * Phone-first customer identification for the public ordering flow.
 * Delegates to the same CRM lookup used by /api/qr/[slug]/identify.
 *
 * Body: { phone: string; name?: string }
 *
 * Response (found):     { found: true,  name }
 * Response (not found): { found: false, normalizedPhone }
 * Response (created):   { found: false, name, normalizedPhone }
 *
 * SECURITY (CR C1): this endpoint intentionally returns NEITHER the customerId NOR
 * any history/spend. Given only a phone + slug it must not become a lookup that
 * unlocks a stranger's identity. The customerId used to be a bearer credential for
 * the PII endpoints (profile/address) — it no longer is; those now require a signed
 * proof of phone possession (see lib/pedido-identity + the waToken handoff). The
 * order flow does not need the customerId here: /finalize resolves the customer from
 * the phone. Scoped to restaurantId from slug. Rate limit: 20 req / 60 s per IP.
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
      // Greeting only. NO customerId / history / spend — see the security note above.
      return NextResponse.json({
        found: true,
        name:  firstName ?? undefined,
      });
    }

    const normalizedPhone = toE164(rawPhone);

    // New customer — create in CRM if name was provided. We still create the record
    // (so the CRM captures the lead) but do NOT return its id: the client does not
    // need it (the order resolves the customer by phone at /finalize).
    if (rawName.length >= 2) {
      await prisma.customer.create({
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
        normalizedPhone,
      });
    }

    return NextResponse.json({ found: false, normalizedPhone });
  } catch (err) {
    console.error("[POST /api/pedido/[slug]/identify-customer]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
