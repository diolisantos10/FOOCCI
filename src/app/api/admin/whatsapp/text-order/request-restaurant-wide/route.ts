/**
 * POST /api/admin/whatsapp/text-order/request-restaurant-wide
 *
 * Governance ONLY — never opens production. Runs the gates and creates a Brain
 * Director Change Request (PENDING_APPROVAL, runtimeImpact=PRODUCTION ⇒ CRITICAL
 * + quality gate) with the cockpit report and the rollback plan attached. The
 * scope stays untouched; opening wide remains a separate human decision
 * ([RW_APPROVED] + deliberate scope change) after the CR is approved.
 *
 * Body: { restaurantSlug?|restaurantId?, confirm: "REQUEST_WHATSAPP_TEXT_ORDER_RESTAURANT_WIDE" }
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { requestRestaurantWide } from "@/services/whatsapp/ordering/productionGovernance";

export async function POST(req: NextRequest) {
  if (!checkAdminRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { restaurantSlug?: string; restaurantId?: string; confirm?: string };
  const result = await requestRestaurantWide({
    restaurantSlug: typeof body.restaurantSlug === "string" ? body.restaurantSlug : undefined,
    restaurantId: typeof body.restaurantId === "string" ? body.restaurantId : undefined,
    confirm: typeof body.confirm === "string" ? body.confirm : "",
  });
  return NextResponse.json(result, { status: result.success ? 200 : 422 });
}
