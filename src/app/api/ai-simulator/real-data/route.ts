/**
 * GET /api/ai-simulator/real-data
 *
 * Analyzes real customer conversations for the authenticated restaurant.
 * Returns a RealConversationReport with anonymized data — no PII exposed.
 *
 * Query params:
 *   limit  — max conversations to analyze (default 50, max 200)
 */

import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { unauthorized } from "@/lib/api-response";
import { RealConversationService } from "@/services/ai/RealConversationService";

export async function GET(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();

  const { restaurantId } = ctx;

  const rawLimit = Number(req.nextUrl.searchParams.get("limit") ?? "50");
  const limit = Number.isFinite(rawLimit) && rawLimit > 0
    ? Math.min(200, Math.max(10, Math.floor(rawLimit)))
    : 50;

  try {
    const report = await RealConversationService.analyze(restaurantId, limit);
    return NextResponse.json(report);
  } catch (err) {
    console.error("[GET /api/ai-simulator/real-data]", err);
    return NextResponse.json({ error: "Falha ao analisar conversas reais" }, { status: 500 });
  }
}
