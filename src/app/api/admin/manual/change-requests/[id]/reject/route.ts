/**
 * POST /api/admin/manual/change-requests/[id]/reject
 *
 * Rejects a PENDING change request. The proposed content is discarded;
 * no chapter is modified.
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

const rejectSchema = z.object({
  reviewedBy: z.string().max(100).optional(),
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

  const parsed = rejectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const changeRequest = await prisma.operationalManualChangeRequest.findUnique({
    where: { id },
    select: { id: true, status: true },
  });

  if (!changeRequest) {
    return NextResponse.json({ error: "Change request not found" }, { status: 404 });
  }
  if (changeRequest.status !== "PENDING") {
    return NextResponse.json({ error: `Change request is already ${changeRequest.status}.` }, { status: 409 });
  }

  const updated = await prisma.operationalManualChangeRequest.update({
    where: { id },
    data: {
      status:     "REJECTED",
      reviewedAt: new Date(),
      reviewedBy: parsed.data.reviewedBy ?? "admin",
    },
  });

  return NextResponse.json({ request: updated });
}
