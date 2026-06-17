/**
 * POST /api/cron/whatsapp/text-order-open-restaurant-wide
 *
 * CI-executable wrapper for the GOVERNED open-to-final-customers (owner-
 * authorized): CI holds CRON_SECRET but not ADMIN_SECRET, so this exposes the
 * exact same `openRestaurantWide` service — every gate and the exact confirm
 * string + acknowledgments remain mandatory; nothing is bypassed. Config-only:
 * never sends a WhatsApp, never creates an order, never generates a Pix.
 *
 * Body: { restaurantSlug?|restaurantId?, confirm, acknowledgeRealCustomers,
 *         acknowledgeRealOrders, acknowledgeRealPix }
 * Auth: Authorization: Bearer {CRON_SECRET}. POST only.
 */

import { NextRequest, NextResponse } from "next/server";
import { openRestaurantWide } from "@/services/whatsapp/ordering/productionGovernance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function checkCronAuth(req: NextRequest): { ok: true } | { ok: false; status: 401 | 503; error: string } {
  const secret = process.env.CRON_SECRET;
  if (!secret) return { ok: false, status: 503, error: "CRON_SECRET is not configured" };
  if ((req.headers.get("authorization") ?? "") !== `Bearer ${secret}`) return { ok: false, status: 401, error: "Unauthorized" };
  return { ok: true };
}

export async function POST(req: NextRequest) {
  const auth = checkCronAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ success: false, error: auth.error, runtimeTouched: false }, { status: auth.status });
  }
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
