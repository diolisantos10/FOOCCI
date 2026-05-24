/**
 * GET  /api/admin/manual/chapters — list all chapters (filterable by area/status)
 * POST /api/admin/manual/chapters — create a new chapter draft
 *
 * Internal only. Requires ADMIN_SECRET (header or session cookie).
 * Restaurant users must never reach this endpoint.
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

const createChapterSchema = z.object({
  slug:        z.string().min(2).max(80).regex(/^[a-z0-9-]+$/, "Slug deve ser lowercase com hífens"),
  title:       z.string().min(2).max(200),
  area:        z.enum(["GENERAL","WAITER_AGENT","CRM","WHATSAPP","UI_UX","BRANDING","INTEGRATIONS","CHECKOUT","PAYMENTS","ANALYTICS","SECURITY","BACKLOG"]).default("GENERAL"),
  description: z.string().max(500).optional(),
  content:     z.string().default(""),
  status:      z.enum(["IMPLEMENTED","PARTIAL","DECIDED","BACKLOG"]).default("BACKLOG"),
  createdBy:   z.string().max(100).optional(),
});

export async function GET(req: NextRequest) {
  const guard = guardAdmin(req);
  if (guard) return guard;

  const { searchParams } = new URL(req.url);
  const area   = searchParams.get("area")   ?? undefined;
  const status = searchParams.get("status") ?? undefined;
  const q      = searchParams.get("q")?.trim() ?? undefined;

  const chapters = await prisma.operationalManualChapter.findMany({
    where: {
      ...(area   ? { area:   area   as never } : {}),
      ...(status ? { status: status as never } : {}),
      ...(q      ? { OR: [
        { title:       { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
      ]} : {}),
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true, slug: true, title: true, area: true, description: true,
      status: true, version: true, isPublished: true, agentVisibility: true,
      createdAt: true, updatedAt: true, publishedAt: true,
      createdBy: true, updatedBy: true, approvedBy: true,
      _count: { select: { revisions: true, changeRequests: true } },
    },
  });

  return NextResponse.json({ data: chapters });
}

export async function POST(req: NextRequest) {
  const guard = guardAdmin(req);
  if (guard) return guard;

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const parsed = createChapterSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const slugTaken = await prisma.operationalManualChapter.findUnique({
    where: { slug: parsed.data.slug },
    select: { id: true },
  });
  if (slugTaken) {
    return NextResponse.json({ error: "Slug já existe. Escolha outro." }, { status: 409 });
  }

  const chapter = await prisma.operationalManualChapter.create({
    data: {
      slug:        parsed.data.slug,
      title:       parsed.data.title,
      area:        parsed.data.area,
      description: parsed.data.description,
      content:     parsed.data.content,
      status:      parsed.data.status,
      createdBy:   parsed.data.createdBy ?? "admin",
    },
  });

  return NextResponse.json({ chapter }, { status: 201 });
}
