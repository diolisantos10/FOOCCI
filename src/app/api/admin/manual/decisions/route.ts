/**
 * GET  /api/admin/manual/decisions — list decision log entries
 * POST /api/admin/manual/decisions — create a new decision log entry
 *
 * The decision log is a permanent, append-only record of product and
 * operational decisions. It is independent of chapters and never deleted.
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

const createDecisionSchema = z.object({
  title:          z.string().min(3).max(200),
  description:    z.string().min(3),
  area:           z.enum(["GENERAL","WAITER_AGENT","CRM","WHATSAPP","UI_UX","BRANDING","INTEGRATIONS","CHECKOUT","PAYMENTS","ANALYTICS","SECURITY","BACKLOG"]).default("GENERAL"),
  status:         z.enum(["IMPLEMENTED","PARTIAL","DECIDED","BACKLOG"]).default("DECIDED"),
  sourceType:     z.enum(["CHATGPT","CLAUDE_AUDIT","CODE_AUDIT","MANUAL","DEPLOY","BUGFIX","PRODUCT_DECISION"]).default("PRODUCT_DECISION"),
  sourceReference:z.string().max(300).optional(),
  createdBy:      z.string().max(100).optional(),
});

export async function GET(req: NextRequest) {
  const guard = guardAdmin(req);
  if (guard) return guard;

  const { searchParams } = new URL(req.url);
  const area   = searchParams.get("area")   ?? undefined;
  const status = searchParams.get("status") ?? undefined;
  const q      = searchParams.get("q")?.trim() ?? undefined;

  const decisions = await prisma.operationalManualDecisionLog.findMany({
    where: {
      ...(area   ? { area:   area   as never } : {}),
      ...(status ? { status: status as never } : {}),
      ...(q      ? { OR: [
        { title:       { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
      ]} : {}),
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ data: decisions });
}

export async function POST(req: NextRequest) {
  const guard = guardAdmin(req);
  if (guard) return guard;

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const parsed = createDecisionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const decision = await prisma.operationalManualDecisionLog.create({
    data: {
      title:          parsed.data.title,
      description:    parsed.data.description,
      area:           parsed.data.area,
      status:         parsed.data.status,
      sourceType:     parsed.data.sourceType,
      sourceReference:parsed.data.sourceReference,
      createdBy:      parsed.data.createdBy ?? "admin",
    },
  });

  return NextResponse.json({ decision }, { status: 201 });
}
