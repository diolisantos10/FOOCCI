/**
 * GET /api/admin/whatsapp/live-monitor?restaurantSlug=sushi-cazza&period=24h
 *
 * Read-only business health snapshot of the WhatsApp sales channel: conversations,
 * orders generated, revenue, conversation→order rate, handoffs, abandonos, errors
 * by category (+ top 5), and pending learnings. NEVER sends WhatsApp, NEVER
 * creates an order/Pix, NO PII. Admin-only.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { getWhatsAppLiveMonitor } from "@/services/whatsapp/learning/liveMonitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Parses "24h" / "3h" / "48" → hours (default 24, clamped 1..168). */
function parsePeriodHours(raw: string | null): number {
  if (!raw) return 24;
  const m = /^(\d+)\s*h?$/i.exec(raw.trim());
  const n = m?.[1] ? parseInt(m[1], 10) : 24;
  return Number.isFinite(n) ? Math.min(Math.max(n, 1), 168) : 24;
}

export async function GET(req: NextRequest) {
  if (!checkAdminRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const slug = req.nextUrl.searchParams.get("restaurantSlug") ?? undefined;
  const id = req.nextUrl.searchParams.get("restaurantId") ?? undefined;
  const periodHours = parsePeriodHours(req.nextUrl.searchParams.get("period"));
  const result = await getWhatsAppLiveMonitor({ restaurantSlug: slug, restaurantId: id, periodHours });
  return NextResponse.json(result, { status: result.ok ? 200 : 404 });
}
