/**
 * GET /api/pedido/[slug]/whatsapp-session?token=<waToken>
 *
 * Client-side fallback for WhatsApp identity handoff.
 * Called by PedidoClient when the server could not resolve the waToken
 * (e.g. the token was missing, expired, or the signing secret changed).
 *
 * Response (ok):     { ok: true,  phone, name?, customerId? }
 * Response (not ok): { ok: false }
 *
 * Rate limit: 20 req / 60 s per IP.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";
import { verifyWaToken } from "@/lib/wa-token";
import { phoneCandidates } from "@/lib/phone";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const ip = getClientIp(req);
  const rl = rateLimit({ key: `pedido-wa-session:${ip}`, limit: 20, windowMs: 60_000 });
  if (rl.limited) return rateLimitResponse(rl.retryAfter);

  try {
    const { slug } = await params;
    const token    = req.nextUrl.searchParams.get("token") ?? "";

    const payload = token ? verifyWaToken(token) : null;
    if (!payload?.phone) {
      return NextResponse.json({ ok: false });
    }

    const restaurant = await prisma.restaurant.findUnique({
      where:  { slug },
      select: { id: true },
    });
    if (!restaurant) {
      return NextResponse.json({ ok: false });
    }

    const candidates = phoneCandidates(payload.phone);
    const customer = candidates.length > 0
      ? await prisma.customer.findFirst({
          where: { restaurantId: restaurant.id, phone: { in: candidates } },
          select: { id: true, name: true, phone: true },
        })
      : null;

    if (customer) {
      const firstName = customer.name.trim().split(/\s+/)[0] ?? null;
      return NextResponse.json({
        ok:         true,
        phone:      customer.phone,
        name:       firstName,
        customerId: customer.id,
      });
    }

    // Phone known but customer not yet in DB — still skip the phone prompt
    const firstName = payload.name?.trim().split(/\s+/)[0] ?? null;
    return NextResponse.json({
      ok:    true,
      phone: payload.phone,
      name:  firstName ?? undefined,
    });
  } catch (err) {
    console.error("[GET /api/pedido/[slug]/whatsapp-session]", err);
    return NextResponse.json({ ok: false });
  }
}
