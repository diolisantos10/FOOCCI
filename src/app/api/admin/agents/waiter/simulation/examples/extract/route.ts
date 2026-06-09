/**
 * POST /api/admin/agents/waiter/simulation/examples/extract
 * Body: { restaurantId?: string, limit?: number, days?: number }
 *
 * Extracts sanitized, classified examples from REAL conversations (read-only),
 * each created as PENDING_REVIEW. Admin-triggered only (the human gate). Never
 * messages a customer, never mutates a conversation, never stores raw PII.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { extractExamples } from "@/services/simulation/examples/SimulationExampleExtractor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!process.env.ADMIN_SECRET) {
    return NextResponse.json({ ok: false, error: "Endpoint disabled — ADMIN_SECRET not configured." }, { status: 403 });
  }
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    // empty body → defaults
  }

  try {
    const result = await extractExamples({
      restaurantId: typeof body.restaurantId === "string" ? body.restaurantId : undefined,
      limit: typeof body.limit === "number" ? body.limit : undefined,
      days: typeof body.days === "number" ? body.days : undefined,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha ao extrair exemplos.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
