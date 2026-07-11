/**
 * POST /api/admin/brain/inbox/decision — approve/reject ONE item of the
 * Unified Approval Inbox (Caixa Única, 7 sources).
 *
 * Body: { source, id, decision: "APPROVE" | "REJECT", reviewedBy }
 * Routes the decision to the correct source-of-truth (Brain change requests,
 * training suggestions, improvement proposals, simulation lab, knowledge base).
 * reviewedBy must identify a real HUMAN — generic identities are refused (400).
 * Approving NEVER applies anything to production. Admin-only.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import {
  decideInboxItem,
  isInboxSource,
  type InboxDecision,
} from "@/services/brain/training/UnifiedInboxDecision";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function guardAdmin(req: NextRequest): NextResponse | null {
  if (!process.env.ADMIN_SECRET) {
    return NextResponse.json({ ok: false, error: "Endpoint disabled — ADMIN_SECRET not configured." }, { status: 403 });
  }
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export async function POST(req: NextRequest) {
  const guard = guardAdmin(req);
  if (guard) return guard;

  const body = (await req.json().catch(() => ({}))) as {
    source?: unknown;
    id?: unknown;
    decision?: unknown;
    reviewedBy?: unknown;
  };

  const id = typeof body.id === "string" ? body.id : "";
  const decision =
    body.decision === "APPROVE" || body.decision === "REJECT" ? (body.decision as InboxDecision) : null;

  if (!isInboxSource(body.source) || !id || !decision) {
    return NextResponse.json(
      { ok: false, error: "Informe source, id e decision (APPROVE|REJECT)." },
      { status: 400 },
    );
  }

  try {
    const result = await decideInboxItem({
      source: body.source,
      id,
      decision,
      reviewedBy: typeof body.reviewedBy === "string" ? body.reviewedBy : "",
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error("[POST brain/inbox/decision]", err);
    const message = err instanceof Error ? err.message.slice(0, 300) : "Erro ao registrar a decisão.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
