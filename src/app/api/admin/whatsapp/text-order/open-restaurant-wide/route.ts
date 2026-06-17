/**
 * POST /api/admin/whatsapp/text-order/open-restaurant-wide
 *
 * Opens the WhatsApp Text Order to FINAL CUSTOMERS: scope → RESTAURANT_WIDE
 * (mode stays ALLOWLIST_FULL_TEST — real order/Pix ONLY after final
 * confirmation). Hard-gated: exact confirm string + explicit acknowledgments +
 * every promotion gate PASS (p0=0). Config-only — sends nothing, creates no
 * order/Pix (runtimeTouched=false). Admin-only (ADMIN_SECRET / cookie).
 *
 * Body: {
 *   restaurantSlug?|restaurantId?,
 *   confirm: "OPEN_WHATSAPP_TEXT_ORDER_RESTAURANT_WIDE",
 *   acknowledgeRealCustomers: true, acknowledgeRealOrders: true, acknowledgeRealPix: true
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { openRestaurantWide } from "@/services/whatsapp/ordering/productionGovernance";

export async function POST(req: NextRequest) {
  if (!checkAdminRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as {
    restaurantSlug?: string; restaurantId?: string; confirm?: string;
    acknowledgeRealCustomers?: boolean; acknowledgeRealOrders?: boolean; acknowledgeRealPix?: boolean;
  };
  const result = await openRestaurantWide({
    restaurantSlug: typeof body.restaurantSlug === "string" ? body.restaurantSlug : undefined,
    restaurantId: typeof body.restaurantId === "string" ? body.restaurantId : undefined,
    confirm: typeof body.confirm === "string" ? body.confirm : "",
    acknowledgeRealCustomers: body.acknowledgeRealCustomers === true,
    acknowledgeRealOrders: body.acknowledgeRealOrders === true,
    acknowledgeRealPix: body.acknowledgeRealPix === true,
  });
  return NextResponse.json(result, { status: result.success ? 200 : 422 });
}
