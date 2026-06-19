/**
 * GET /api/whatsapp/learning/conversations?window=24
 *
 * Read-only feed of recent WhatsApp conversations with business outcome + masked
 * summary, for the "Conversas de hoje" tab. No PII. Dashboard (tenant-scoped) auth.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, unauthorized, serverError } from "@/lib/api-response";
import { listConversationReviews } from "@/services/whatsapp/learning/conversationFeed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();
    const windowRaw = req.nextUrl.searchParams.get("window");
    const windowHours = windowRaw ? parseInt(windowRaw, 10) : 24;
    const conversations = await listConversationReviews({
      restaurantId: ctx.restaurantId,
      windowHours: Number.isFinite(windowHours) ? windowHours : 24,
    });
    return ok({ conversations });
  } catch (err) {
    return serverError(err instanceof Error ? err.message : "erro ao listar conversas");
  }
}
