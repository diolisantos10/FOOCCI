/**
 * POST /api/admin/manual/chapters/[id]/publish
 *
 * Publishes the chapter's current content:
 *   1. Increments semantic version (0.1 → 0.2 → ... → 1.0).
 *   2. Creates an immutable OperationalManualRevision snapshot.
 *   3. Sets isPublished=true and publishedAt=now.
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

const publishSchema = z.object({
  changeSummary:  z.string().max(500).optional(),
  approvedBy:     z.string().max(100).optional(),
  sourceType:     z.enum(["CHATGPT","CLAUDE_AUDIT","CODE_AUDIT","MANUAL","DEPLOY","BUGFIX","PRODUCT_DECISION"]).default("MANUAL"),
  sourceReference:z.string().max(300).optional(),
});

function bumpVersion(current: string): string {
  const [major, minor] = current.split(".").map(Number);
  const safeMinor = (minor ?? 0) + 1;
  if (safeMinor >= 10) return `${(major ?? 0) + 1}.0`;
  return `${major ?? 0}.${safeMinor}`;
}

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

  const parsed = publishSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const chapter = await prisma.operationalManualChapter.findUnique({
    where: { id },
    select: { id: true, content: true, version: true },
  });
  if (!chapter) {
    return NextResponse.json({ error: "Chapter not found" }, { status: 404 });
  }

  const newVersion = bumpVersion(chapter.version);

  const [updated] = await prisma.$transaction([
    prisma.operationalManualChapter.update({
      where: { id },
      data: {
        version:     newVersion,
        isPublished: true,
        publishedAt: new Date(),
        status:      "IMPLEMENTED",
        approvedBy:  parsed.data.approvedBy ?? "admin",
        updatedBy:   parsed.data.approvedBy ?? "admin",
      },
    }),
    prisma.operationalManualRevision.create({
      data: {
        chapterId:      id,
        version:        newVersion,
        content:        chapter.content,
        changeSummary:  parsed.data.changeSummary,
        sourceType:     parsed.data.sourceType,
        sourceReference:parsed.data.sourceReference,
        createdBy:      parsed.data.approvedBy ?? "admin",
      },
    }),
  ]);

  return NextResponse.json({ chapter: updated, newVersion });
}
