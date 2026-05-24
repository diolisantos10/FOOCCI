/**
 * GET  /api/admin/manual/change-requests — list change requests (filterable by status)
 * POST /api/admin/manual/change-requests — create a pending change request
 *
 * Change requests are proposed edits awaiting admin approval.
 * Nothing becomes live chapter content without an APPROVED change request.
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

const createChangeRequestSchema = z.object({
  chapterId:       z.string().cuid().optional().nullable(),
  title:           z.string().min(3).max(200),
  proposedContent: z.string().min(1),
  proposedDiff:    z.string().optional(),
  reason:          z.string().min(3).max(1000),
  impactAreas:     z.string().max(300).optional(),
  sourceType:      z.enum(["CHATGPT","CLAUDE_AUDIT","CODE_AUDIT","MANUAL","DEPLOY","BUGFIX","PRODUCT_DECISION"]).default("MANUAL"),
  sourceReference: z.string().max(300).optional(),
  createdBy:       z.string().max(100).optional(),
});

export async function GET(req: NextRequest) {
  const guard = guardAdmin(req);
  if (guard) return guard;

  const { searchParams } = new URL(req.url);
  const status    = searchParams.get("status")    ?? undefined;
  const chapterId = searchParams.get("chapterId") ?? undefined;

  const requests = await prisma.operationalManualChangeRequest.findMany({
    where: {
      ...(status    ? { status:    status    as never } : {}),
      ...(chapterId ? { chapterId: chapterId } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      chapter: { select: { id: true, slug: true, title: true } },
    },
  });

  return NextResponse.json({ data: requests });
}

export async function POST(req: NextRequest) {
  const guard = guardAdmin(req);
  if (guard) return guard;

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const parsed = createChangeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  // If chapterId is provided, verify the chapter exists
  if (parsed.data.chapterId) {
    const chapter = await prisma.operationalManualChapter.findUnique({
      where: { id: parsed.data.chapterId },
      select: { id: true },
    });
    if (!chapter) {
      return NextResponse.json({ error: "Chapter not found" }, { status: 404 });
    }
  }

  const request = await prisma.operationalManualChangeRequest.create({
    data: {
      chapterId:       parsed.data.chapterId ?? null,
      title:           parsed.data.title,
      proposedContent: parsed.data.proposedContent,
      proposedDiff:    parsed.data.proposedDiff,
      reason:          parsed.data.reason,
      impactAreas:     parsed.data.impactAreas,
      sourceType:      parsed.data.sourceType,
      sourceReference: parsed.data.sourceReference,
      createdBy:       parsed.data.createdBy ?? "admin",
    },
    include: {
      chapter: { select: { id: true, slug: true, title: true } },
    },
  });

  return NextResponse.json({ request }, { status: 201 });
}
