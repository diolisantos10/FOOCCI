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

// ── Arena scenario catalogue ─────────────────────────────────────────────────

interface ArenaScenarioDef {
  key:         string;
  title:       string;
  persona:     string;
  description: string;
  riskTags:    string[];
  /** goal key to look up from SCENARIO_TEMPLATES */
  goal:        string;
}

export const ARENA_SCENARIOS: ArenaScenarioDef[] = [
  {
    key:         "priceBeforeOrder",
    title:       "Pergunta preço antes de pedir",
    persona:     "cliente que pergunta preço",
    description: "Pergunta o preço do yakisoba antes de fazer o pedido",
    riskTags:    ["price_lookup", "order_completion"],
    goal:        "ASK_MENU_THEN_ORDER",
  },
  {
    key:         "directOrder",
    title:       "Pedido direto",
    persona:     "cliente direto",
    description: "Pede yakisoba diretamente sem perguntas",
    riskTags:    ["order_completion"],
    goal:        "COMPLETE_ORDER",
  },
  {
    key:         "addItemMidFlow",
    title:       "Adicionar item no meio do pedido",
    persona:     "cliente que muda pedido",
    description: "Adiciona um item extra durante a coleta de endereço",
    riskTags:    ["interrupt", "mid_flow_add"],
    goal:        "ADD_ITEM_MID_FLOW",
  },
  {
    key:         "cancelPendingItem",
    title:       "Cancelar item pendente",
    persona:     "cliente indeciso",
    description: "Cancela item antes de resolver ambiguidade",
    riskTags:    ["cancel_item", "ambiguity"],
    goal:        "REMOVE_PENDING_ITEM",
  },
  {
    key:         "requestAgent",
    title:       "Pedir atendente humano",
    persona:     "cliente bravo",
    description: "Solicita atendente humano durante a conversa",
    riskTags:    ["handoff"],
    goal:        "ASK_ATTENDANT",
  },
  {
    key:         "cocaAmbiguity",
    title:       "Ambiguidade Coca-Cola",
    persona:     "cliente confuso",
    description: "Pede 'uma coca' sem especificar tamanho — força resolução de ambiguidade",
    riskTags:    ["ambiguity", "order_completion"],
    goal:        "ORDER_AMBIGUOUS",
  },
];

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
