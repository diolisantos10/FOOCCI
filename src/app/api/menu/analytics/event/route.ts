/**
 * POST /api/menu/analytics/event
 *
 * Public (no auth). Called by the customer-facing /pedido/[slug] page on first load.
 * Creates a MenuEvent row for source attribution.
 * Rate-limited implicitly by idempotency: client sends once per session via sessionStorage flag.
 */

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, badRequest, serverError } from "@/lib/api-response";

const VALID_SOURCES = new Set([
  "instagram", "whatsapp", "google", "qrcode", "crm", "manual", "direct", "other",
]);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { slug?: string; source?: string };

    if (!body.slug?.trim()) return badRequest("slug é obrigatório");

    const restaurant = await prisma.restaurant.findUnique({
      where:  { slug: body.slug.trim() },
      select: { id: true, isActive: true },
    });

    if (!restaurant || !restaurant.isActive) {
      // Silently ignore — don't reveal restaurant existence to bots
      return ok({ ok: true });
    }

    const source = body.source && VALID_SOURCES.has(body.source) ? body.source : "other";

    await prisma.menuEvent.create({
      data: { restaurantId: restaurant.id, source },
    });

    return ok({ ok: true });
  } catch (err) {
    console.error("[POST /api/menu/analytics/event]", err);
    return serverError();
  }
}
