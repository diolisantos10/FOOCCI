/**
 * POST /api/admin/diagnostics/whatsapp-text-ordering/scenarios/run
 *
 * Runs a suite of predefined multi-turn WhatsApp ordering conversations through
 * the state machine in DRY_RUN_ONLY, preserving session state between messages,
 * and returns a pass/warn/fail report. Admin-only.
 *
 * The menu is loaded ONCE (tenant-scoped, read-only) and reused for every
 * scenario turn. NEVER sends WhatsApp, creates an order, or generates a real Pix
 * (the runner forces allowSideEffects=false on every turn).
 *
 * Body:
 *   restaurantSlug  string
 *   suite           "quick" | "full" | "edge" | "payment" | "all"
 *   phone?          string
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkAdminRequest } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { loadMenuForRestaurant } from "@/services/whatsapp/ordering/WhatsAppTextOrderService";
import { runScenarioSuite } from "@/services/whatsapp/ordering/WhatsAppOrderingScenarioRunner";

const bodySchema = z.object({
  restaurantSlug: z.string().min(1).max(100),
  suite:          z.enum(["quick", "full", "edge", "payment", "all"]).default("quick"),
  phone:          z.string().optional(),
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

  const { restaurantSlug, suite, phone } = parsed.data;

  const restaurant = await prisma.restaurant.findFirst({
    where:  { slug: restaurantSlug },
    select: { id: true, name: true, slug: true },
  });
  if (!restaurant) {
    return NextResponse.json({ error: `Restaurante não encontrado: "${restaurantSlug}"` }, { status: 404 });
  }

  // Load the menu once (read-only) and reuse for every scenario turn.
  const menu = await loadMenuForRestaurant(restaurant.id);

  const report = await runScenarioSuite(suite, {
    restaurantId:   restaurant.id,
    restaurantSlug: restaurant.slug,
    restaurantName: restaurant.name,
    phone:          phone ?? "+5511999990000",
    menu,
  });

  return NextResponse.json({ ...report, menuItemCount: menu.length });
}
