/**
 * GET /api/admin/training/scenarios/[id] — scenario detail with transcript and evaluations
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!checkAdminRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const scenario = await prisma.agentTrainingScenario.findUnique({
    where:   { id: params.id },
    include: { evaluations: { orderBy: { createdAt: "desc" } } },
  });

  if (!scenario) return NextResponse.json({ error: "Cenário não encontrado" }, { status: 404 });
  return NextResponse.json(scenario);
}
