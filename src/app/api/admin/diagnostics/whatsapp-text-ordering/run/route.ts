/**
 * POST /api/admin/diagnostics/whatsapp-text-ordering/run
 *
 * Multi-step dry-run simulator for the WhatsApp Text Ordering engine.
 * Admin-only (ADMIN_SECRET / foocci-admin-token cookie).
 *
 * Runs ONE customer turn through the full state machine (items → options →
 * delivery → address → freight → payment → order/Pix). The delivery quote is
 * read-only and always computed; order/Pix creation is gated by the runtime
 * mode and is NEVER performed from this admin endpoint (allowSideEffects=false),
 * so it has zero side effects regardless of flags.
 *
 * Body:
 *   restaurantSlug  string
 *   messageText     string
 *   phone?          string
 *   conversationId? string
 *   customerId?     string
 *   currentSession? object   — pass the previous turn's session to continue
 *   mode?           "dry_run" | "reply_only" | "full_test"  (display only here)
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkAdminRequest } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import {
  processCustomerMessage,
  newTransientSession,
} from "@/services/whatsapp/ordering/WhatsAppTextOrderService";
import {
  isWaTextOrderingEnabled,
  getWaTextOrderingMode,
  isRestaurantAllowlisted,
  isPhoneAllowlisted,
} from "@/lib/wa-text-ordering-flag";
import type { WaPersistedSession, WaRuntimeMode } from "@/services/whatsapp/ordering/types";

const MODE_MAP: Record<string, WaRuntimeMode> = {
  dry_run:    "DRY_RUN_ONLY",
  reply_only: "ALLOWLIST_REPLY_ONLY",
  full_test:  "ALLOWLIST_FULL_TEST",
};

const bodySchema = z.object({
  restaurantSlug: z.string().min(1).max(100),
  messageText:    z.string().min(1).max(2000),
  phone:          z.string().optional(),
  conversationId: z.string().optional(),
  customerId:     z.string().optional(),
  currentSession: z.record(z.unknown()).optional(),
  mode:           z.enum(["dry_run", "reply_only", "full_test"]).default("dry_run"),
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

  const { restaurantSlug, messageText, phone, conversationId, customerId, currentSession } = parsed.data;
  const requestedMode = MODE_MAP[parsed.data.mode] ?? "DRY_RUN_ONLY";

  // Tenant isolation: slug → restaurantId
  const restaurant = await prisma.restaurant.findFirst({
    where:  { slug: restaurantSlug },
    select: { id: true, name: true, slug: true },
  });
  if (!restaurant) {
    return NextResponse.json({ error: `Restaurante não encontrado: "${restaurantSlug}"` }, { status: 404 });
  }

  const testPhone = phone ?? "+5511999990000";

  // Rehydrate dates on a passed-in session (JSON loses Date types)
  let session: WaPersistedSession | null = null;
  if (currentSession && Object.keys(currentSession).length > 0) {
    const s = currentSession as Record<string, unknown>;
    session = {
      ...(newTransientSession({ restaurantId: restaurant.id, phone: testPhone, mode: requestedMode })),
      ...(s as object),
      restaurantId:  restaurant.id, // never trust client tenant
      lastMessageAt: new Date(),
    } as WaPersistedSession;
  }

  // Admin endpoint NEVER performs real side effects, regardless of mode/flags.
  const result = await processCustomerMessage({
    restaurantId:     restaurant.id,
    restaurantSlug:   restaurant.slug,
    phone:            testPhone,
    conversationId,
    customerId,
    messageText,
    mode:             requestedMode,
    currentSession:   session,
    allowSideEffects: false,
  });

  // Live-routing status banner data
  const flagStatus = {
    enabled:             isWaTextOrderingEnabled(restaurant.id),
    mode:                getWaTextOrderingMode(),
    requestedMode,
    restaurantAllowlisted: isRestaurantAllowlisted(restaurant.id),
    phoneAllowlisted:    isPhoneAllowlisted(testPhone),
    liveRoutingActive:   false, // engine is never wired into the live webhook in this build
  };

  return NextResponse.json({
    restaurant: { id: restaurant.id, name: restaurant.name, slug: restaurant.slug },
    messageText,
    flagStatus,
    ...result,
  });
}
