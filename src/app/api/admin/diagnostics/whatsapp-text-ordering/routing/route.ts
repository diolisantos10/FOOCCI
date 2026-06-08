/**
 * POST /api/admin/diagnostics/whatsapp-text-ordering/routing
 *
 * Live-routing READINESS check. Admin-only. Pure read-only: it never sends a
 * WhatsApp message, never creates an order, and never creates a Pix. It answers
 * a single question for a real test phone + restaurant:
 *
 *   "Would this inbound message route into WhatsApp Text Ordering, and if not,
 *    exactly which guard declined it?"
 *
 * This is the tool to run when a real allowlisted test message still falls back
 * to the old WhatsApp Agent flow. It resolves the restaurant slug → ID (the
 * allowlist is keyed by ID, not slug), normalises the phone the same way the
 * live webhook does, and reports the exact decision.
 *
 * Body:
 *   restaurantSlug  string   (or restaurantId — slug is resolved to ID)
 *   phone           string   any common BR format (+5511…, 5511…, 11…)
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkAdminRequest } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import {
  getRoutingDecision,
  maskPhone,
  isWaTextOrderingEnabled,
  isRestaurantAllowlisted,
  isPhoneAllowlisted,
} from "@/lib/wa-text-ordering-flag";

const bodySchema = z.object({
  restaurantSlug: z.string().min(1).max(100),
  phone:          z.string().min(4).max(40),
});

export async function POST(req: NextRequest) {
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Entrada inválida.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { restaurantSlug, phone } = parsed.data;

  // Allowlist is keyed by restaurant ID — resolve the slug so the admin can type
  // the human-friendly slug while we compare against the real ID.
  const restaurant = await prisma.restaurant.findFirst({
    where:  { OR: [{ slug: restaurantSlug }, { id: restaurantSlug }] },
    select: { id: true, name: true, slug: true },
  });
  if (!restaurant) {
    return NextResponse.json(
      { error: `Restaurante não encontrado: "${restaurantSlug}"` },
      { status: 404 },
    );
  }

  // The live webhook receives the phone as an E.164 JID (e.g. "+5511999990000").
  // We accept any format and report what the gate sees.
  const decision = getRoutingDecision(restaurant.id, phone);

  return NextResponse.json({
    restaurant,
    input: {
      phone,
      phoneMasked: maskPhone(phone),
    },
    flags: {
      masterEnabled:         decision.masterEnabled,
      mode:                  decision.mode,
      restaurantAllowlisted: decision.restaurantAllowlisted,
      enabledForRestaurant:  decision.enabledForRestaurant,
      phoneAllowlisted:      decision.phoneAllowlisted,
    },
    // Final verdict — identical logic to the live Evolution webhook gate.
    wouldRouteToTextOrdering: decision.shouldUseTextOrdering,
    declineReason:            decision.declineReason,
    // Helpful for the operator: how to set the env vars for THIS test.
    hint: decision.shouldUseTextOrdering
      ? "Pronto — esta mensagem entraria no Pedido por Texto."
      : buildHint(restaurant.id, phone, {
          isWaTextOrderingEnabled: isWaTextOrderingEnabled(restaurant.id),
          isRestaurantAllowlisted: isRestaurantAllowlisted(restaurant.id),
          isPhoneAllowlisted:      isPhoneAllowlisted(phone),
        }),
    sideEffects: "none — this check never sends WhatsApp, creates orders, or generates Pix",
  });
}

function buildHint(
  restaurantId: string,
  phone: string,
  s: { isWaTextOrderingEnabled: boolean; isRestaurantAllowlisted: boolean; isPhoneAllowlisted: boolean },
): string {
  const parts: string[] = [];
  if (process.env.WHATSAPP_TEXT_ORDERING_ENABLED !== "true") {
    parts.push('Set WHATSAPP_TEXT_ORDERING_ENABLED="true"');
  }
  if (!s.isWaTextOrderingEnabled || !s.isRestaurantAllowlisted) {
    parts.push(`Add the restaurant ID to WHATSAPP_TEXT_ORDERING_ALLOWLIST_RESTAURANTS: "${restaurantId}"`);
  }
  if (!s.isPhoneAllowlisted) {
    parts.push(`Add this phone to WHATSAPP_TEXT_ORDERING_ALLOWLIST_PHONES (E.164): "${phone}"`);
  }
  return parts.join(" · ");
}
