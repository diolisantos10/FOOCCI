/**
 * GET /api/admin/training/proposals — list improvement proposals
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  if (!checkAdminRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status    = searchParams.get("status")    ?? undefined;
  const agentType = searchParams.get("agentType") ?? undefined;
  const page      = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));

  const where: Record<string, unknown> = {};
  if (status)    where.status    = status;
  if (agentType) where.agentType = agentType;

  const [proposals, total] = await Promise.all([
    prisma.agentImprovementProposal.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip:    (page - 1) * 20,
      take:    20,
    }),
    prisma.agentImprovementProposal.count({ where }),
  ]);

  return NextResponse.json({ proposals, total, page });
}
