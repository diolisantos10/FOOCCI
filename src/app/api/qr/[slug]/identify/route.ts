/**
 * POST /api/qr/[slug]/identify
 *
 * Public endpoint — no authentication required.
 * Looks up a customer by phone. If name is provided and the customer
 * is new, creates them in the CRM so the data flows automatically.
 *
 * Body: { phone: string; name?: string }
 *
 * Response:
 *   { found: true,  name: string, customerId: string }  — existing customer
 *   { found: false, name: string, customerId: string }  — new customer created
 *   { found: false }                                     — unknown (no name provided)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";
import { phoneCandidates, toE164 } from "@/lib/phone";

export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const ip = getClientIp(req);
  const rl = rateLimit({ key: `qr-identify:${ip}`, limit: 20, windowMs: 60_000 });
  if (rl.limited) return rateLimitResponse(rl.retryAfter) as NextResponse;

  try {
    const body = await req.json().catch(() => ({}));
    const rawPhone = String(body.phone ?? "").trim();
    const rawName  = String(body.name  ?? "").trim();

    const candidates = phoneCandidates(rawPhone);
    if (candidates.length === 0) {
      return NextResponse.json({ error: "Telefone inválido" }, { status: 400 });
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: { slug: params.slug },
      select: { id: true },
    });

    if (!restaurant) {
      return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
    }

    // Try to find existing customer
    const existing = await prisma.customer.findFirst({
      where: {
        restaurantId: restaurant.id,
        phone: { in: candidates },
        isActive: true,
      },
      select: { id: true, name: true },
    });

    if (existing) {
      const firstName = existing.name.trim().split(/\s+/)[0]!;
      return NextResponse.json({ found: true, name: firstName, customerId: existing.id });
    }

    // New customer — create in CRM if name was provided
    if (rawName.length >= 2) {
      const e164 = toE164(rawPhone);
      const created = await prisma.customer.create({
        data: {
          restaurantId: restaurant.id,
          name: rawName,
          phone: e164,
          isActive: true,
        },
        select: { id: true },
      }).catch(() => null);

      const firstName = rawName.trim().split(/\s+/)[0]!;
      return NextResponse.json({
        found: false,
        name: firstName,
        customerId: created?.id ?? undefined,
      });
    }

    return NextResponse.json({ found: false });
  } catch (err) {
    console.error("[POST /api/qr/[slug]/identify]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
