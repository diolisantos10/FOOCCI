/**
 * POST /api/admin/whatsapp/text-order/promote-full-test
 *
 * Governed promotion REPLY_ONLY → ALLOWLIST_FULL_TEST (allowlist-bound).
 * Requires the exact confirm string and ALL gates (PHONE_ALLOWLIST, allowlist>0,
 * config risk not HIGH, flow diagnostic PASS, cockpit PASS). Config-only change:
 * never sends a WhatsApp, never creates an order, never generates a Pix, never
 * widens the scope. Admin-only (ADMIN_SECRET / cookie).
 *
 * Body: { restaurantSlug?|restaurantId?, confirm: "PROMOTE_WHATSAPP_TEXT_ORDER_FULL_TEST" }
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { promoteToFullTest } from "@/services/whatsapp/ordering/productionGovernance";

export async function POST(req: NextRequest) {
  if (!checkAdminRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { restaurantSlug?: string; restaurantId?: string; confirm?: string };
  const result = await promoteToFullTest({
    restaurantSlug: typeof body.restaurantSlug === "string" ? body.restaurantSlug : undefined,
    restaurantId: typeof body.restaurantId === "string" ? body.restaurantId : undefined,
    confirm: typeof body.confirm === "string" ? body.confirm : "",
  });
  return NextResponse.json(result, { status: result.success ? 200 : 422 });
}
