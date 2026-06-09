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

const ALLOWED_STATUS_TRANSITIONS: Array<ProposalStatus | "RESOLVED_MANUALLY"> = [
  "APPROVED",
  "REJECTED",
  "NEEDS_REVISION",
  "APPLIED_TO_SANDBOX",
  "RESOLVED_MANUALLY",
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

  const now = new Date();
  const isApproval = newStatus === "APPROVED" || newStatus === "APPLIED_TO_SANDBOX";
  // Cast to string since RESOLVED_MANUALLY may not be in the ProposalStatus enum but is a valid Prisma string
  const safeStatus = newStatus as string;

  const proposal = await prisma.agentImprovementProposal.update({
    where: { id: params.id },
    data:  {
      status:        safeStatus,
      reviewerNotes: body.reviewerNotes ?? undefined,
      approvedBy:    isApproval ? "admin" : undefined,
      approvedAt:    isApproval ? now : undefined,
    },
    include: { brainVersions: { orderBy: { createdAt: "desc" }, take: 1 } },
  });

  // When approving for sandbox: create a candidate brain version linked to this proposal.
  // Does NOT apply to production — status is SANDBOX until explicit production promotion.
  let sandboxVersion = null;
  if (newStatus === "APPLIED_TO_SANDBOX" && proposal.brainVersions.length === 0) {
    const shortId = params.id.slice(0, 8);
    sandboxVersion = await prisma.agentBrainVersion.create({
      data: {
        agentType:        proposal.agentType,
        restaurantId:     proposal.restaurantId ?? undefined,
        versionLabel:     `sandbox-${shortId}-${now.toISOString().slice(0, 10)}`,
        status:           "SANDBOX",
        promptText:       proposal.proposedPatchText ?? undefined,
        configJson:       proposal.proposedConfigJson ?? undefined,
        sourceProposalId: proposal.id,
      },
    });
  }

  return NextResponse.json({ ...proposal, sandboxVersion });
}
