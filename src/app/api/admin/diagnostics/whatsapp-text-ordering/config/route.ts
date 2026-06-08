/**
 * GET / PATCH /api/admin/diagnostics/whatsapp-text-ordering/config
 *
 * Founder-facing activation config for WhatsApp Text Ordering, per restaurant.
 * Admin-only (ADMIN_SECRET / foocci-admin-token cookie).
 *
 * GET  ?restaurantSlug=sushi-cazza  → current persisted config (or safe defaults)
 * PATCH { restaurantSlug|restaurantId, enabled?, mode?, scope?, allowlistedPhones?, paused?, notes? }
 *
 * Pure config I/O — NEVER sends a WhatsApp message, creates an order, generates a
 * Pix, or triggers a campaign. The global env kill switch always overrides this.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkAdminRequest } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import {
  getRestaurantConfig,
  upsertRestaurantConfig,
} from "@/services/whatsapp/ordering/WhatsAppTextOrderingConfigService";
import {
  isGlobalKillSwitchEngaged,
  isGlobalPauseEngaged,
} from "@/lib/wa-text-ordering-flag";

async function resolveRestaurant(slugOrId: string) {
  return prisma.restaurant.findFirst({
    where:  { OR: [{ slug: slugOrId }, { id: slugOrId }] },
    select: { id: true, name: true, slug: true },
  });
}

const DEFAULT_CONFIG = {
  enabled:           false,
  mode:              "DRY_RUN_ONLY" as const,
  scope:             "PHONE_ALLOWLIST" as const,
  allowlistedPhones: [] as string[],
  paused:            false,
  notes:             null as string | null,
};

export async function GET(req: NextRequest) {
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const slugOrId = req.nextUrl.searchParams.get("restaurantSlug")
    ?? req.nextUrl.searchParams.get("restaurantId");
  if (!slugOrId) {
    return NextResponse.json({ error: "restaurantSlug é obrigatório." }, { status: 400 });
  }

  const restaurant = await resolveRestaurant(slugOrId);
  if (!restaurant) {
    return NextResponse.json({ error: `Restaurante não encontrado: "${slugOrId}"` }, { status: 404 });
  }

  const config = await getRestaurantConfig(restaurant.id);

  return NextResponse.json({
    restaurant,
    configPresent: config !== null,
    config: config ?? { restaurantId: restaurant.id, ...DEFAULT_CONFIG, updatedAt: null },
    global: {
      killSwitch: isGlobalKillSwitchEngaged(),
      paused:     isGlobalPauseEngaged(),
    },
  });
}

const patchSchema = z.object({
  restaurantSlug:    z.string().min(1).max(100).optional(),
  restaurantId:      z.string().min(1).max(100).optional(),
  enabled:           z.boolean().optional(),
  mode:              z.enum(["DRY_RUN_ONLY", "ALLOWLIST_REPLY_ONLY", "ALLOWLIST_FULL_TEST"]).optional(),
  scope:             z.enum(["PHONE_ALLOWLIST", "RESTAURANT_WIDE"]).optional(),
  allowlistedPhones: z.array(z.string().min(3).max(40)).max(200).optional(),
  paused:            z.boolean().optional(),
  notes:             z.string().max(2000).nullable().optional(),
}).refine(d => d.restaurantSlug || d.restaurantId, {
  message: "restaurantSlug ou restaurantId é obrigatório.",
});

export async function PATCH(req: NextRequest) {
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Entrada inválida.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const slugOrId = parsed.data.restaurantSlug ?? parsed.data.restaurantId!;
  const restaurant = await resolveRestaurant(slugOrId);
  if (!restaurant) {
    return NextResponse.json({ error: `Restaurante não encontrado: "${slugOrId}"` }, { status: 404 });
  }

  const config = await upsertRestaurantConfig(restaurant.id, {
    enabled:           parsed.data.enabled,
    mode:              parsed.data.mode,
    scope:             parsed.data.scope,
    allowlistedPhones: parsed.data.allowlistedPhones,
    paused:            parsed.data.paused,
    notes:             parsed.data.notes,
  });

  return NextResponse.json({
    restaurant,
    configPresent: true,
    config,
    global: {
      killSwitch: isGlobalKillSwitchEngaged(),
      paused:     isGlobalPauseEngaged(),
    },
    sideEffects: "none — config only; no WhatsApp send, order, Pix, or campaign",
  });
}
