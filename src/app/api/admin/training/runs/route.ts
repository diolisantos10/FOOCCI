/**
 * GET  /api/admin/training/runs — list training runs (paginated)
 * POST /api/admin/training/runs — trigger a training run manually
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { generateBatch } from "@/services/agent-training/AgentTrainingScenarioGenerator";
import { createRun, runBatch, finalizeRun } from "@/services/agent-training/AgentTrainingRunnerService";

export async function GET(req: NextRequest) {
  if (!checkAdminRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const page      = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const perPage   = 20;
  const agentType = searchParams.get("agentType") ?? undefined;

  const where = agentType ? { agentType } : {};

  const [runs, total] = await Promise.all([
    prisma.agentTrainingRun.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip:    (page - 1) * perPage,
      take:    perPage,
    }),
    prisma.agentTrainingRun.count({ where }),
  ]);

  return NextResponse.json({ runs, total, page, perPage });
}

export async function POST(req: NextRequest) {
  if (!checkAdminRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const agentType    = (body.agentType    ?? "WHATSAPP_ORDERING") as string;
  const mode         = (body.mode         ?? "QUICK")             as string;
  const count        = Math.min(parseInt(body.count ?? "10", 10), 30);

  const restaurant = await prisma.restaurant.findFirst({
    where:  body.restaurantSlug ? { slug: body.restaurantSlug } : undefined,
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  });
  if (!restaurant) {
    return NextResponse.json({ error: "Restaurante não encontrado" }, { status: 404 });
  }

  const run = await createRun({
    agentType: agentType as Parameters<typeof createRun>[0]["agentType"],
    source:    "AI_SIMULATION",
    mode:      mode as Parameters<typeof createRun>[0]["mode"],
    restaurantId: restaurant.id,
  });

  // Run asynchronously (don't block the response)
  void (async () => {
    try {
      const templates = generateBatch(count);
      const scenarios = templates.map((t) => ({
        title:           t.title,
        persona:         t.customerPersona,
        goal:            t.goal,
        messages:        t.messageSequence,
        source:          "AI_SIMULATION" as const,
        expectedOutcome: t.expectedOutcome,
      }));
      await runBatch({ runId: run.id, restaurantId: restaurant.id, scenarios });
      await finalizeRun(run.id);
    } catch (err) {
      console.error("[admin/training/runs POST] async run failed:", err);
      await prisma.agentTrainingRun.update({
        where: { id: run.id },
        data:  { status: "FAILED", completedAt: new Date() },
      });
    }
  })();

  return NextResponse.json({ ok: true, runId: run.id, status: "RUNNING" }, { status: 202 });
}
