/**
 * POST /api/admin/manual/change-requests/[id]/approve
 *
 * Approves a PENDING change request and optionally applies the proposed
 * content to its linked chapter (if chapterId is set).
 *
 * Internal only. Requires ADMIN_SECRET.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { checkAdminRequest } from "@/lib/admin-auth";

function guardAdmin(req: NextRequest): NextResponse | null {
  if (!process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Admin access not configured." }, { status: 403 });
  }
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

const approveSchema = z.object({
  applyToChapter: z.boolean().default(false), // when true, copies proposedContent into the chapter
  reviewedBy:     z.string().max(100).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = guardAdmin(req);
  if (guard) return guard;

  const { id } = await params;

  let body: unknown;
  try { body = await req.json().catch(() => ({})); }
  catch { body = {}; }

  const parsed = approveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const changeRequest = await prisma.operationalManualChangeRequest.findUnique({
    where: { id },
    select: { id: true, status: true, chapterId: true, proposedContent: true, title: true },
  });

  if (!changeRequest) {
    return NextResponse.json({ error: "Change request not found" }, { status: 404 });
  }
  if (changeRequest.status !== "PENDING") {
    return NextResponse.json({ error: `Change request is already ${changeRequest.status}.` }, { status: 409 });
  }

  const reviewer = parsed.data.reviewedBy ?? "admin";

  // Use interactive transaction so we can conditionally add the chapter update.
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.operationalManualChangeRequest.update({
      where: { id },
      data: {
        status:     "APPROVED",
        reviewedAt: new Date(),
        reviewedBy: reviewer,
      },
    });

    // Optionally apply the proposed content to the linked chapter
    if (parsed.data.applyToChapter && changeRequest.chapterId) {
      await tx.operationalManualChapter.update({
        where: { id: changeRequest.chapterId },
        data: {
          content:    changeRequest.proposedContent,
          updatedBy:  reviewer,
          approvedBy: reviewer,
        },
      });
    }

    return result;
  });

  return NextResponse.json({ request: updated });
}
