/**
 * PATCH /api/admin/agents/waiter/evidence/[id] — human review of a result
 * evidence: APPROVED | REJECTED | BACKLOG. Approval is what allows an evidence
 * marked isPublicCandidate to be used commercially. Admin-only.
 */

import { NextRequest, NextResponse } from "next/server";
import { guardAdmin } from "../../runtime/_guard";
import { reviewEvidence, type EvidenceStatus } from "@/services/waiterEvidence/WaiterEvidenceService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES: EvidenceStatus[] = ["APPROVED", "REJECTED", "BACKLOG", "DRAFT"];

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = guardAdmin(req);
  if (guard) return guard;
  try {
    const id = params.id;
    const body = (await req.json().catch(() => ({}))) as { status?: string; reviewedBy?: string };
    if (!body.status || !STATUSES.includes(body.status as EvidenceStatus)) {
      return NextResponse.json({ ok: false, error: "status deve ser APPROVED, REJECTED, BACKLOG ou DRAFT." }, { status: 400 });
    }
    const evidence = await reviewEvidence(id, body.status as EvidenceStatus, body.reviewedBy ?? null);
    return NextResponse.json({ ok: true, evidence });
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 200) : "erro desconhecido";
    return NextResponse.json({ ok: false, error: message }, { status: 200 });
  }
}
