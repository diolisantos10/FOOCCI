/**
 * GET /api/whatsapp/learning/health?period=24h
 *
 * Read-only "Saúde do WhatsApp" snapshot for the current restaurant: conversations,
 * orders, revenue, conversion, handoffs, abandonos, errors, pending learnings.
 * No PII, never sends/charges. Dashboard (tenant-scoped) auth.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, unauthorized, serverError } from "@/lib/api-response";
import { getWhatsAppLiveMonitor } from "@/services/whatsapp/learning/liveMonitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parsePeriodHours(raw: string | null): number {
  if (!raw) return 24;
  const m = /^(\d+)\s*h?$/i.exec(raw.trim());
  const n = m?.[1] ? parseInt(m[1], 10) : 24;
  return Number.isFinite(n) ? Math.min(Math.max(n, 1), 168) : 24;
}

export async function GET(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();
    const periodHours = parsePeriodHours(req.nextUrl.searchParams.get("period"));
    const snapshot = await getWhatsAppLiveMonitor({ restaurantId: ctx.restaurantId, periodHours });
    return ok({ snapshot });
  } catch (err) {
    return serverError(err instanceof Error ? err.message : "erro ao montar saúde do WhatsApp");
  }
}
