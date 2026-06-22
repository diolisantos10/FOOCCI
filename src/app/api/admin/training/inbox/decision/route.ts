/**
 * POST /api/admin/training/inbox/decision — approve/reject one inbox item.
 *
 * Body: { id: "source:rawId", decision: "APPROVE" | "REJECT" }
 * Routes the decision to the correct underlying table. Admin-only.
 * Never applies anything to production — approval here is triage only.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { decideInbox, type ApprovalDecision } from "@/services/agent-training/approvalInbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!checkAdminRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { id?: unknown; decision?: unknown };
  const id = typeof body.id === "string" ? body.id : "";
  const decision = body.decision === "APPROVE" || body.decision === "REJECT" ? (body.decision as ApprovalDecision) : null;

  if (!id || !decision) {
    return NextResponse.json({ error: "Informe id e decision (APPROVE|REJECT)." }, { status: 400 });
  }

  try {
    await decideInbox(id, decision);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[POST training/inbox/decision]", err);
    const msg = err instanceof Error ? err.message : "Erro ao registrar a decisão.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
