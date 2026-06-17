/**
 * GET /api/admin/whatsapp/text-order/live-status?restaurantSlug=sushi-cazza
 *
 * Read-only go-live monitor: last-hour aggregates of REAL ordering sessions
 * (conversations entered, orders/Pix created, handoffs, errors) + a few safe
 * error summaries. NO PII (no phone/name/address/items/message content) — only
 * counts, internal ids and status-derived reasons. Admin-only.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { getWhatsAppLiveStatus } from "@/services/whatsapp/ordering/liveStatus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!checkAdminRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const slug = req.nextUrl.searchParams.get("restaurantSlug") ?? undefined;
  const id = req.nextUrl.searchParams.get("restaurantId") ?? undefined;
  const result = await getWhatsAppLiveStatus({ restaurantSlug: slug, restaurantId: id });
  return NextResponse.json(result, { status: result.ok ? 200 : 404 });
}
