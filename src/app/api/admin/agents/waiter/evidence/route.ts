/**
 * GET  /api/admin/agents/waiter/evidence — list evidence + stats (filters: type, status, restaurantId)
 * POST /api/admin/agents/waiter/evidence — create MANUAL evidence (excerpt sanitized before persisting)
 *
 * "Provas de Resultado" do Waiter. Admin-only. Read-only on orders/conversations;
 * never sends anything, never touches the runtime.
 */

import { NextRequest, NextResponse } from "next/server";
import { guardAdmin } from "../runtime/_guard";
import {
  createEvidence,
  listEvidence,
  evidenceStats,
  type EvidenceType,
  type EvidenceStatus,
  type EvidenceSourceType,
} from "@/services/waiterEvidence/WaiterEvidenceService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TYPES: EvidenceType[] = ["SALE_CONVERSION", "UPSELL", "RECOVERY", "FRICTION_REDUCTION", "QUALITATIVE_PROOF", "BEFORE_AFTER"];
const STATUSES: EvidenceStatus[] = ["DRAFT", "APPROVED", "REJECTED", "BACKLOG"];
const SOURCES: EvidenceSourceType[] = ["ORDER", "CONVERSATION", "SIMULATION", "MANUAL_NOTE", "ANALYTICS"];

export async function GET(req: NextRequest) {
  const guard = guardAdmin(req);
  if (guard) return guard;
  try {
    const sp = req.nextUrl.searchParams;
    const evidenceType = sp.get("evidenceType");
    const status = sp.get("status");
    const restaurantId = sp.get("restaurantId") ?? undefined;
    const [items, stats] = await Promise.all([
      listEvidence({
        restaurantId,
        evidenceType: evidenceType && TYPES.includes(evidenceType as EvidenceType) ? (evidenceType as EvidenceType) : undefined,
        status: status && STATUSES.includes(status as EvidenceStatus) ? (status as EvidenceStatus) : undefined,
        limit: Number(sp.get("limit") ?? 50) || 50,
      }),
      evidenceStats(restaurantId),
    ]);
    return NextResponse.json({ ok: true, items, stats });
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 200) : "erro desconhecido";
    return NextResponse.json({ ok: false, error: message }, { status: 200 });
  }
}

export async function POST(req: NextRequest) {
  const guard = guardAdmin(req);
  if (guard) return guard;
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const restaurantId = typeof body.restaurantId === "string" ? body.restaurantId.trim() : "";
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const summary = typeof body.summary === "string" ? body.summary.trim() : "";
    const evidenceType = typeof body.evidenceType === "string" ? body.evidenceType : "";
    if (!restaurantId || !title || !summary || !TYPES.includes(evidenceType as EvidenceType)) {
      return NextResponse.json({ ok: false, error: "restaurantId, title, summary e evidenceType válidos são obrigatórios." }, { status: 400 });
    }
    const sourceType = typeof body.sourceType === "string" && SOURCES.includes(body.sourceType as EvidenceSourceType)
      ? (body.sourceType as EvidenceSourceType)
      : "MANUAL_NOTE";
    const evidence = await createEvidence({
      restaurantId,
      sourceType,
      sourceId: typeof body.sourceId === "string" ? body.sourceId : null,
      title,
      summary,
      evidenceType: evidenceType as EvidenceType,
      valueBefore: typeof body.valueBefore === "number" ? body.valueBefore : null,
      valueAfter: typeof body.valueAfter === "number" ? body.valueAfter : null,
      orderValue: typeof body.orderValue === "number" ? body.orderValue : null,
      customerSegment: typeof body.customerSegment === "string" ? body.customerSegment : null,
      excerpt: typeof body.excerpt === "string" ? body.excerpt : null,
      proofScore: typeof body.proofScore === "number" ? body.proofScore : null,
      isPublicCandidate: body.isPublicCandidate === true,
    });
    return NextResponse.json({ ok: true, evidence });
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 200) : "erro desconhecido";
    return NextResponse.json({ ok: false, error: message }, { status: 200 });
  }
}
