/**
 * PATCH /api/admin/agents/waiter/simulation/opportunities/[id]
 * Body: { status: "APPROVED" | "REJECTED" | "BACKLOGGED" | "PENDING_REVIEW", reviewedBy? }
 *
 * The human decision step — the Lab never changes runtime; an operator marks each
 * opportunity. Auth: admin only.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { updateOpportunityStatus } from "@/services/simulation/SimulationStore";
import type { OpportunityStatus } from "@/services/simulation/types";

const VALID: OpportunityStatus[] = ["PENDING_REVIEW", "APPROVED", "REJECTED", "BACKLOGGED"];

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!process.env.ADMIN_SECRET) {
    return NextResponse.json({ ok: false, error: "Endpoint disabled — ADMIN_SECRET not configured." }, { status: 403 });
  }
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const status = body.status as OpportunityStatus;
  if (!VALID.includes(status)) {
    return NextResponse.json({ ok: false, error: `status inválido. Use: ${VALID.join(", ")}.` }, { status: 400 });
  }

  try {
    const opportunity = await updateOpportunityStatus(
      params.id,
      status,
      typeof body.reviewedBy === "string" ? body.reviewedBy : null,
    );
    return NextResponse.json({ ok: true, opportunity });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha ao atualizar a oportunidade.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
