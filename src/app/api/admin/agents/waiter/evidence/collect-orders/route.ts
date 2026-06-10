/**
 * POST /api/admin/agents/waiter/evidence/collect-orders — "Buscar provas em pedidos
 * e conversas": scans recent Foocci-attributed completed orders READ-ONLY and
 * creates DRAFT result evidences (SALE_CONVERSION + UPSELL), sanitized, deduped.
 * Never mutates an order/conversation, never sends anything. Admin-only.
 */

import { NextRequest, NextResponse } from "next/server";
import { guardAdmin } from "../../runtime/_guard";
import { collectResultEvidenceFromOrders } from "@/services/waiterEvidence/WaiterResultEvidenceCollector";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const guard = guardAdmin(req);
  if (guard) return guard;
  try {
    const body = (await req.json().catch(() => ({}))) as { restaurantId?: string; limit?: number; days?: number };
    const result = await collectResultEvidenceFromOrders({
      restaurantId: typeof body.restaurantId === "string" && body.restaurantId.trim() ? body.restaurantId.trim() : undefined,
      limit: typeof body.limit === "number" ? body.limit : undefined,
      days: typeof body.days === "number" ? body.days : undefined,
    });
    return NextResponse.json({ ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 200) : "erro desconhecido";
    return NextResponse.json({ ok: false, error: message, runtimeTouched: false }, { status: 200 });
  }
}
