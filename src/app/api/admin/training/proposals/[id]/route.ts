/**
 * GET   /api/admin/training/proposals/[id] — proposal detail
 * PATCH /api/admin/training/proposals/[id] — update status (approve/reject/needs_revision)
 *
 * CRITICAL: APPLIED_TO_PRODUCTION status requires explicit confirmation.
 * Status APPLIED_TO_PRODUCTION is blocked in v1 from this endpoint.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import type { ProposalStatus } from "@/services/agent-training/types";

const ALLOWED_STATUS_TRANSITIONS: ProposalStatus[] = [
  "APPROVED",
  "REJECTED",
  "NEEDS_REVISION",
  "APPLIED_TO_SANDBOX",
  // APPLIED_TO_PRODUCTION intentionally excluded from v1
];

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!checkAdminRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const proposal = await prisma.agentImprovementProposal.findUnique({
    where:   { id: params.id },
    include: { brainVersions: { orderBy: { createdAt: "desc" } } },
  });
  if (!proposal) return NextResponse.json({ error: "Proposta não encontrada" }, { status: 404 });
  return NextResponse.json(proposal);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!checkAdminRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body: { status?: string; reviewerNotes?: string } = await req.json().catch(() => ({}));
  const newStatus = body.status as ProposalStatus | undefined;

  if (!newStatus || !ALLOWED_STATUS_TRANSITIONS.includes(newStatus)) {
    return NextResponse.json(
      { error: `Status inválido. Permitidos: ${ALLOWED_STATUS_TRANSITIONS.join(", ")}` },
      { status: 400 },
    );
  }

  const proposal = await prisma.agentImprovementProposal.update({
    where: { id: params.id },
    data:  {
      status:        newStatus,
      reviewerNotes: body.reviewerNotes ?? undefined,
      approvedBy:    newStatus === "APPROVED" || newStatus === "APPLIED_TO_SANDBOX" ? "admin" : undefined,
      approvedAt:    newStatus === "APPROVED" || newStatus === "APPLIED_TO_SANDBOX" ? new Date() : undefined,
    },
  });

  return NextResponse.json(proposal);
}
