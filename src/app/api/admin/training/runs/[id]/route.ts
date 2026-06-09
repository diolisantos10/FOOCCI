/**
 * GET /api/admin/training/runs/[id] — run details with scenario list
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!checkAdminRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const run = await prisma.agentTrainingRun.findUnique({
    where: { id: params.id },
    include: {
      scenarios: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true, title: true, status: true, score: true,
          customerPersona: true, goal: true, source: true, failureSummary: true, createdAt: true,
        },
      },
    },
  });

  if (!run) return NextResponse.json({ error: "Run não encontrado" }, { status: 404 });
  return NextResponse.json(run);
}
