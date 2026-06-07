/**
 * POST /api/admin/diagnostics/whatsapp-text-ordering/run
 *
 * Dry-run simulator for the WhatsApp Text Ordering engine.
 * Admin-only (ADMIN_SECRET / foocci-admin-token cookie).
 *
 * NO side effects:
 *   - no WhatsApp message sent
 *   - no real Order created
 *   - no Pix generated
 *   - no campaign triggered
 *   - no customer record mutated
 *
 * Body:
 *   restaurantSlug  string   — resolves to restaurantId
 *   messageText     string   — the WhatsApp message to simulate
 *   phone?          string   — customer phone (informational only)
 *   currentSession? object   — optional partial session for context
 *   mode            "dry_run"
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkAdminRequest } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { analyzeTextOrder } from "@/services/whatsapp/ordering/WhatsAppTextOrderService";

const bodySchema = z.object({
  restaurantSlug: z.string().min(1).max(100),
  messageText:    z.string().min(1).max(2000),
  phone:          z.string().optional(),
  currentSession: z.record(z.unknown()).optional(),
  mode:           z.literal("dry_run").default("dry_run"),
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

  const { restaurantSlug, messageText, phone, currentSession } = parsed.data;

  // Resolve restaurant (tenant isolation: slug → restaurantId)
  const restaurant = await prisma.restaurant.findFirst({
    where:  { slug: restaurantSlug },
    select: { id: true, name: true, slug: true },
  });

  if (!restaurant) {
    return NextResponse.json(
      { error: `Restaurante não encontrado: "${restaurantSlug}"` },
      { status: 404 },
    );
  }

  const result = await analyzeTextOrder({
    restaurantId:   restaurant.id,
    phone:          phone ?? "dry_run_test",
    messageText,
    currentSession: currentSession as Parameters<typeof analyzeTextOrder>[0]["currentSession"],
    dryRun:         true,
  });

  return NextResponse.json({
    restaurant: { id: restaurant.id, name: restaurant.name, slug: restaurant.slug },
    messageText,
    ...result,
  });
}
