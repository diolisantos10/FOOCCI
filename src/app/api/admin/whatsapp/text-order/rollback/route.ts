/**
 * POST /api/admin/whatsapp/text-order/rollback
 *
 * 30-second kill switch: paused=true + DRY_RUN_ONLY + PHONE_ALLOWLIST. Keeps
 * allowlist/config/history; the normal receptionist keeps answering. Blocks
 * FULL_TEST and RESTAURANT_WIDE. Requires the exact confirm string.
 * Admin-only (ADMIN_SECRET / cookie). Config-only — runtimeTouched=false.
 *
 * Body: { restaurantSlug?|restaurantId?, confirm: "ROLLBACK_WHATSAPP_TEXT_ORDER" }
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { rollbackTextOrder } from "@/services/whatsapp/ordering/productionGovernance";

export async function POST(req: NextRequest) {
  if (!checkAdminRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { restaurantSlug?: string; restaurantId?: string; confirm?: string };
  const result = await rollbackTextOrder({
    restaurantSlug: typeof body.restaurantSlug === "string" ? body.restaurantSlug : undefined,
    restaurantId: typeof body.restaurantId === "string" ? body.restaurantId : undefined,
    confirm: typeof body.confirm === "string" ? body.confirm : "",
  });
  return NextResponse.json(result, { status: result.success ? 200 : 422 });
}
