/**
 * GET   /api/admin/manual/chapters/[id] — fetch a single chapter with revisions
 * PATCH /api/admin/manual/chapters/[id] — update chapter draft content
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

const patchChapterSchema = z.object({
  title:          z.string().min(2).max(200).optional(),
  area:           z.enum(["GENERAL","WAITER_AGENT","CRM","WHATSAPP","UI_UX","BRANDING","INTEGRATIONS","CHECKOUT","PAYMENTS","ANALYTICS","SECURITY","BACKLOG"]).optional(),
  description:    z.string().max(500).nullish(),
  content:        z.string().optional(),
  status:         z.enum(["IMPLEMENTED","PARTIAL","DECIDED","BACKLOG"]).optional(),
  agentVisibility:z.boolean().optional(),
  updatedBy:      z.string().max(100).optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = guardAdmin(req);
  if (guard) return guard;

  const { id } = await params;

  const chapter = await prisma.operationalManualChapter.findUnique({
    where: { id },
    include: {
      revisions:      { orderBy: { createdAt: "desc" }, take: 20 },
      changeRequests: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });

  if (!chapter) {
    return NextResponse.json({ error: "Chapter not found" }, { status: 404 });
  }

  return NextResponse.json({ chapter });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = guardAdmin(req);
  if (guard) return guard;

  const { id } = await params;

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const parsed = patchChapterSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const exists = await prisma.operationalManualChapter.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!exists) {
    return NextResponse.json({ error: "Chapter not found" }, { status: 404 });
  }

  const d = parsed.data;
  const updated = await prisma.operationalManualChapter.update({
    where: { id },
    data: {
      ...(d.title           !== undefined && { title:           d.title }),
      ...(d.area            !== undefined && { area:            d.area }),
      ...(d.description     !== undefined && { description:     d.description }),
      ...(d.content         !== undefined && { content:         d.content }),
      ...(d.status          !== undefined && { status:          d.status }),
      ...(d.agentVisibility !== undefined && { agentVisibility: d.agentVisibility }),
      updatedBy: d.updatedBy ?? "admin",
    },
  });

  return NextResponse.json({ chapter: updated });
}
