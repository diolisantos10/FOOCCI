/**
 * POST /api/admin/agents/waiter/evidence/collect — run the WaiterEvidenceCollector
 * once: scans recent REAL conversations READ-ONLY and creates DRAFT evidences
 * (sanitized excerpt, human review required). Never mutates anything else.
 * Admin-only.
 */

import { NextRequest, NextResponse } from "next/server";
import { guardAdmin } from "../../runtime/_guard";
import { collectEvidence } from "@/services/waiterEvidence/WaiterEvidenceCollector";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const guard = guardAdmin(req);
  if (guard) return guard;
  try {
    const body = (await req.json().catch(() => ({}))) as { restaurantId?: string; limit?: number; days?: number };
    const result = await collectEvidence({
      restaurantId: typeof body.restaurantId === "string" && body.restaurantId.trim() ? body.restaurantId.trim() : undefined,
      limit: typeof body.limit === "number" ? body.limit : undefined,
      days: typeof body.days === "number" ? body.days : undefined,
    });
    return NextResponse.json({ ...result, ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 200) : "erro desconhecido";
    return NextResponse.json({ ok: false, error: message, runtimeTouched: false }, { status: 200 });
  }
}
