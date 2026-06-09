/**
 * POST /api/admin/training/arena/run
 *
 * Runs a single preset arena scenario through the real Text Ordering engine
 * in dry-run mode and returns the full transcript for WhatsApp-like playback.
 *
 * Safety: allowSideEffects=false — no real WhatsApp, no real order, no Pix.
 * Auth:   admin-protected (checkAdminRequest)
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import {
  createRun,
  runScenario,
  finalizeRun,
  failRun,
} from "@/services/agent-training/AgentTrainingRunnerService";
import { getAvailableTemplates } from "@/services/agent-training/AgentTrainingScenarioGenerator";
import { ARENA_SCENARIOS } from "@/services/agent-training/arenaScenarios";

// ── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { scenarioKey?: string; restaurantId?: string } = {};
  try { body = await req.json() as typeof body; } catch { /* empty body ok */ }

  const { scenarioKey, restaurantId: reqRestaurantId } = body;

  const scenarioDef = ARENA_SCENARIOS.find((s) => s.key === scenarioKey);
  if (!scenarioDef) {
    return NextResponse.json(
      { ok: false, error: `scenarioKey inválido: ${scenarioKey ?? "(vazio)"}. Válidos: ${ARENA_SCENARIOS.map((s) => s.key).join(", ")}` },
      { status: 400 },
    );
  }

  // ── Pick restaurant ─────────────────────────────────────────────────────────
  const restaurant = reqRestaurantId
    ? await prisma.restaurant.findUnique({
        where:  { id: reqRestaurantId },
        select: { id: true, name: true },
      })
    : await prisma.restaurant.findFirst({
        select:  { id: true, name: true },
        orderBy: { createdAt: "asc" },
      });

  if (!restaurant) {
    return NextResponse.json({ ok: false, error: "Nenhum restaurante encontrado" }, { status: 404 });
  }

  // ── Pick matching template ──────────────────────────────────────────────────
  const templates  = getAvailableTemplates();
  const template   = templates.find((t) => t.goal === scenarioDef.goal)
    ?? templates.find((t) => t.goal === "COMPLETE_ORDER")
    ?? templates[0];

  if (!template) {
    return NextResponse.json({ ok: false, error: "Template não encontrado para este cenário" }, { status: 500 });
  }

  // ── Create run & execute scenario ───────────────────────────────────────────
  const run = await createRun({
    agentType:    "WHATSAPP_ORDERING",
    source:       "AI_SIMULATION",
    mode:         "QUICK",
    restaurantId: restaurant.id,
  });

  let result;
  try {
    result = await runScenario({
      runId:           run.id,
      restaurantId:    restaurant.id,
      title:           scenarioDef.title,
      persona:         scenarioDef.persona,
      goal:            scenarioDef.goal,
      messages:        template.messageSequence,
      source:          "AI_SIMULATION",
      expectedOutcome: template.expectedOutcome,
    });
    await finalizeRun(run.id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await failRun(run.id, msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }

  // ── Fetch saved scenario id ─────────────────────────────────────────────────
  const savedScenario = await prisma.agentTrainingScenario.findFirst({
    where:   { runId: run.id },
    orderBy: { createdAt: "desc" },
    select:  { id: true },
  });

  return NextResponse.json({
    ok:                   true,
    scenarioId:           savedScenario?.id ?? null,
    runId:                run.id,
    transcript:           result.transcript,
    status:               result.status,
    score:                result.score,
    sideEffectsPerformed: result.sideEffectsPerformed,
    persona:              scenarioDef.persona,
    scenarioTitle:        scenarioDef.title,
  });
}
