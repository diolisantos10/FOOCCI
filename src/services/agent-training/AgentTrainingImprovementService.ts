/**
 * AgentTrainingImprovementService
 *
 * Reads failed/warn scenarios from a training run and generates improvement
 * proposals using GPT-4o. Proposals are stored with status PENDING_APPROVAL.
 *
 * CRITICAL: proposals are NEVER applied automatically to production.
 * Human approval is always required.
 */

import { openai } from "@/lib/openai";
import { prisma } from "@/lib/prisma";
import type { AgentType, ProposalChangeType, TranscriptTurn } from "./types";

const TRAINER_MODEL = "gpt-4o";

const TRAINER_SYSTEM_PROMPT = `Você é um engenheiro de IA especializado em melhorar agentes de atendimento WhatsApp para restaurantes brasileiros.
Você recebe transcrições de conversas com problemas e propõe melhorias concretas.
Responda APENAS em JSON válido.

Formato esperado:
{
  "title": "Cancelar item pendente quando cliente diz 'não quero mais'",
  "problemSummary": "O cliente disse 'não quero mais' enquanto havia um item pendente de ambiguidade, mas o bot continuou fazendo a pergunta de desambiguação.",
  "rootCause": "O handler de ambiguidade não verifica frases de cancelamento de item antes de fazer a próxima pergunta.",
  "proposedChangeType": "STATE_MACHINE_RULE",
  "proposedPatchText": "Adicionar verificação de CANCEL_ITEM_RE no início de handleAmbiguityAnswer: se o cliente diz não quero/não quero mais/tira, cancelar o item pendente e retomar o fluxo.",
  "riskLevel": "LOW",
  "expectedImpact": "Elimina travamento de clientes no loop de ambiguidade quando desistem do item.",
  "beforeScore": 45,
  "afterScoreEstimate": 85
}

proposedChangeType pode ser: PROMPT_PATCH, ROUTING_RULE, STATE_MACHINE_RULE, COPY_CHANGE, MENU_MATCHING_RULE, HANDOFF_RULE, CONFIG_CHANGE
riskLevel pode ser: LOW, MEDIUM, HIGH

IMPORTANTE: Nunca proponha mudanças que:
- Enviem mensagens WhatsApp reais
- Criem pedidos reais
- Gerem Pix real
- Alterem lógica de pagamento/Mercado Pago
- Quebrem o agente WhatsApp antigo
- Quebrem handoff humano`;

// ── Group failures by type ────────────────────────────────────────────────────

interface FailureGroup {
  type:      string;
  count:     number;
  scenarios: Array<{ id: string; title: string; failureSummary: string | null; transcript: TranscriptTurn[] }>;
}

export async function analyzeFailures(runId: string): Promise<FailureGroup[]> {
  const failed = await prisma.agentTrainingScenario.findMany({
    where:  { runId, status: { in: ["FAIL", "WARN"] } },
    select: { id: true, title: true, goal: true, failureSummary: true, transcriptJson: true },
  });

  const byGoal = new Map<string, typeof failed>();
  for (const s of failed) {
    const key = s.goal ?? "UNKNOWN";
    if (!byGoal.has(key)) byGoal.set(key, []);
    byGoal.get(key)!.push(s);
  }

  return Array.from(byGoal.entries()).map(([type, scenarios]) => ({
    type,
    count: scenarios.length,
    scenarios: scenarios.map((s) => ({
      id:            s.id,
      title:         s.title,
      failureSummary: s.failureSummary,
      transcript:    s.transcriptJson as unknown as TranscriptTurn[],
    })),
  }));
}

// ── Generate one proposal from a group of failing scenarios ──────────────────

function extractJsonFromLlmResponse(raw: string): string {
  // Strip ```json ... ``` or ``` ... ``` markdown fences
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced?.[1]) return fenced[1].trim();
  // Fall back to first {...} block in case of any other decoration
  const brace = raw.match(/\{[\s\S]*\}/);
  if (brace?.[0]) return brace[0];
  return raw;
}

export async function generateProposal(opts: {
  runId:       string;
  agentType:   AgentType;
  restaurantId?: string;
  scenarios:   Array<{ id: string; title: string; failureSummary: string | null; transcript: TranscriptTurn[] }>;
}): Promise<void> {
  const { runId, agentType, restaurantId, scenarios } = opts;
  if (scenarios.length === 0) return;

  // Build evidence: up to 2 transcripts
  const evidenceTranscripts = scenarios.slice(0, 2).map((s) => {
    const lines = (s.transcript ?? [])
      .map((t) => `${t.role === "customer" ? "Cliente" : "Bot"}: ${t.content}`)
      .join("\n");
    return `--- ${s.title} ---\n${lines}`;
  }).join("\n\n");

  const userMessage = [
    `Analise os seguintes cenários com falha do agente ${agentType} e proponha UMA melhoria:`,
    "",
    evidenceTranscripts,
    "",
    scenarios[0]?.failureSummary
      ? `Resumo da falha: ${scenarios[0].failureSummary}`
      : "",
  ].filter(Boolean).join("\n");

  let parsed: {
    title?:              string;
    problemSummary?:     string;
    rootCause?:          string;
    proposedChangeType?: ProposalChangeType;
    proposedPatchText?:  string;
    riskLevel?:          string;
    expectedImpact?:     string;
    beforeScore?:        number;
    afterScoreEstimate?: number;
  };

  try {
    const response = await openai.chat.completions.create({
      model:           TRAINER_MODEL,
      messages:        [
        { role: "system", content: TRAINER_SYSTEM_PROMPT },
        { role: "user",   content: userMessage },
      ],
      temperature:     0.2,
      max_tokens:      800,
      response_format: { type: "json_object" },
    });
    const raw = response.choices[0]?.message?.content ?? "{}";
    parsed = JSON.parse(extractJsonFromLlmResponse(raw));
  } catch (err) {
    // Deterministic fallback: always create a PENDING_APPROVAL proposal so the
    // failure is visible in the queue rather than silently lost.
    console.warn("[AgentTrainingImprovement] GPT parse failed — using fallback proposal:", err);
    const hint = scenarios[0]?.failureSummary ?? scenarios.map((s) => s.title).join("; ");
    parsed = {
      title:              `Falha recorrente: ${hint.slice(0, 80)}`,
      problemSummary:     `Proposta gerada automaticamente (análise GPT-4o indisponível). Cenários: ${scenarios.map((s) => s.title).join(", ").slice(0, 200)}.`,
      rootCause:          scenarios[0]?.failureSummary ?? undefined,
      proposedChangeType: "STATE_MACHINE_RULE" as ProposalChangeType,
      riskLevel:          "MEDIUM",
      expectedImpact:     "Requer análise humana para determinar impacto.",
    };
  }

  await prisma.agentImprovementProposal.create({
    data: {
      agentType,
      restaurantId:       restaurantId ?? null,
      sourceRunId:        runId,
      sourceScenarioIds:  scenarios.map((s) => s.id),
      title:              parsed.title              ?? "Melhoria sem título",
      problemSummary:     parsed.problemSummary     ?? "Problema não descrito",
      rootCause:          parsed.rootCause          ?? null,
      proposedChangeType: parsed.proposedChangeType ?? "STATE_MACHINE_RULE",
      proposedPatchText:  parsed.proposedPatchText  ?? null,
      riskLevel:          parsed.riskLevel          ?? "MEDIUM",
      expectedImpact:     parsed.expectedImpact     ?? null,
      beforeScore:        parsed.beforeScore        ?? null,
      afterScoreEstimate: parsed.afterScoreEstimate ?? null,
      status:             "PENDING_APPROVAL",       // never applied automatically
    },
  });
}

// ── Analyze a run and generate proposals for all failure groups ───────────────

export interface ProposalGenerationSummary {
  groupsFound:      number;
  proposalsCreated: number;
  skipped:          Array<{ category: string; reason: string }>;
}

const DEDUP_WINDOW_MS    = 48 * 3_600_000; // category covered for 48h after proposal created
const MAX_OPEN_PROPOSALS = 15;

/**
 * Returns the set of failure categories (scenario goals) already covered by a
 * recent open proposal. Used to deduplicate per-category, never globally —
 * a new failure category always gets at least one proposal.
 */
export async function getCoveredFailureCategories(agentType: AgentType): Promise<Set<string>> {
  const recent = await prisma.agentImprovementProposal.findMany({
    where: {
      agentType,
      status:    { in: ["PENDING_APPROVAL", "APPROVED", "NEEDS_REVISION", "APPLIED_TO_SANDBOX"] },
      createdAt: { gte: new Date(Date.now() - DEDUP_WINDOW_MS) },
    },
    select: { sourceScenarioIds: true },
  });

  const ids = recent.flatMap((p) => (p.sourceScenarioIds as string[] | null) ?? []);
  if (ids.length === 0) return new Set();

  const scenarios = await prisma.agentTrainingScenario.findMany({
    where:  { id: { in: ids } },
    select: { goal: true },
  });
  return new Set(scenarios.map((s) => s.goal ?? "UNKNOWN"));
}

export async function processRunForProposals(opts: {
  runId:         string;
  agentType:     AgentType;
  restaurantId?: string;
  autoCreate?:   boolean; // defaults to true
}): Promise<ProposalGenerationSummary> {
  const summary: ProposalGenerationSummary = { groupsFound: 0, proposalsCreated: 0, skipped: [] };

  const config = await prisma.agentTrainingConfig.findUnique({
    where: { agentType: opts.agentType },
  });
  const shouldCreate = opts.autoCreate ?? config?.autoCreateProposals ?? true;
  if (!shouldCreate) {
    summary.skipped.push({ category: "*", reason: "autoCreateProposals desativado na configuração" });
    return summary;
  }

  const pendingCount = await prisma.agentImprovementProposal.count({
    where: { agentType: opts.agentType, status: "PENDING_APPROVAL" },
  });
  if (pendingCount >= MAX_OPEN_PROPOSALS) {
    summary.skipped.push({ category: "*", reason: `Fila cheia: ${pendingCount} propostas pendentes (máx ${MAX_OPEN_PROPOSALS})` });
    console.info("[AgentTrainingImprovement] maxOpenProposals reached, skipping", { pendingCount });
    return summary;
  }

  const [groups, covered] = await Promise.all([
    analyzeFailures(opts.runId),
    getCoveredFailureCategories(opts.agentType),
  ]);
  summary.groupsFound = groups.length;

  for (const group of groups) {
    if (group.count === 0) continue;
    if (covered.has(group.type)) {
      summary.skipped.push({ category: group.type, reason: "Categoria já coberta por proposta recente" });
      continue;
    }
    try {
      await generateProposal({
        runId:        opts.runId,
        agentType:    opts.agentType,
        restaurantId: opts.restaurantId,
        scenarios:    group.scenarios,
      });
      summary.proposalsCreated++;
      covered.add(group.type); // avoid duplicate within the same run
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      summary.skipped.push({ category: group.type, reason: `Erro na geração: ${msg.slice(0, 120)}` });
      console.error("[AgentTrainingImprovement] generateProposal failed:", { category: group.type, err });
    }
    // Rate limiting
    await new Promise((r) => setTimeout(r, 500));
  }

  return summary;
}

// ── Backfill: process accumulated WARN/FAIL that never got proposals ──────────

export interface BackfillSummary {
  scenariosScanned:   number;
  evaluationsCreated: number;
  proposalsCreated:   number;
  proposalsSkipped:   Array<{ category: string; reason: string }>;
}

/**
 * Scans recent WARN/FAIL scenarios that are not yet covered by any proposal,
 * evaluates the ones missing an evaluation (capped), groups them by failure
 * category, and creates one grouped proposal per uncovered category.
 *
 * SAFETY: read-only against runtime — creates only evaluations and
 * PENDING_APPROVAL proposals. Never mutates production.
 */
export async function backfillProposals(opts: {
  agentType:       AgentType;
  sinceHours?:     number; // default 168 (7 days)
  maxEvaluations?: number; // default 15 per call to bound OpenAI cost
}): Promise<BackfillSummary> {
  const sinceHours     = opts.sinceHours     ?? 168;
  const maxEvaluations = opts.maxEvaluations ?? 15;
  const summary: BackfillSummary = {
    scenariosScanned: 0, evaluationsCreated: 0, proposalsCreated: 0, proposalsSkipped: [],
  };

  const since = new Date(Date.now() - sinceHours * 3_600_000);

  const scenarios = await prisma.agentTrainingScenario.findMany({
    where: {
      status:    { in: ["WARN", "FAIL"] },
      createdAt: { gte: since },
    },
    select: {
      id: true, runId: true, restaurantId: true, goal: true, title: true,
      failureSummary: true, transcriptJson: true, expectedOutcomeJson: true,
      evaluations: { select: { id: true }, take: 1 },
    },
    orderBy: { createdAt: "desc" },
    take:    200,
  });
  summary.scenariosScanned = scenarios.length;
  if (scenarios.length === 0) return summary;

  // 1. Evaluate scenarios missing evaluations (capped)
  const { evaluateScenario } = await import("./AgentTrainingEvaluatorService");
  let evaluated = 0;
  for (const s of scenarios) {
    if (s.evaluations.length > 0) continue;
    if (evaluated >= maxEvaluations) break;
    try {
      await evaluateScenario({
        scenarioId:      s.id,
        transcript:      s.transcriptJson as unknown as TranscriptTurn[],
        expectedOutcome: s.expectedOutcomeJson as unknown as Record<string, unknown> | undefined,
      });
      summary.evaluationsCreated++;
      evaluated++;
      await new Promise((r) => setTimeout(r, 300));
    } catch (err) {
      console.error("[AgentTrainingImprovement] backfill evaluation failed:", { scenarioId: s.id, err });
    }
  }

  // 2. Group remaining WARN/FAIL by category (re-read: evaluation may have flipped some to PASS)
  const stillFailing = await prisma.agentTrainingScenario.findMany({
    where: {
      id:     { in: scenarios.map((s) => s.id) },
      status: { in: ["WARN", "FAIL"] },
    },
    select: {
      id: true, runId: true, restaurantId: true, goal: true, title: true,
      failureSummary: true, transcriptJson: true,
    },
  });

  const byCategory = new Map<string, typeof stillFailing>();
  for (const s of stillFailing) {
    const key = s.goal ?? "UNKNOWN";
    if (!byCategory.has(key)) byCategory.set(key, []);
    byCategory.get(key)!.push(s);
  }

  // 3. Create grouped proposals per uncovered category
  const covered = await getCoveredFailureCategories(opts.agentType);

  const pendingCount = await prisma.agentImprovementProposal.count({
    where: { agentType: opts.agentType, status: "PENDING_APPROVAL" },
  });
  let openSlots = Math.max(0, MAX_OPEN_PROPOSALS - pendingCount);

  for (const [category, items] of byCategory) {
    if (covered.has(category)) {
      summary.proposalsSkipped.push({ category, reason: "Categoria já coberta por proposta recente" });
      continue;
    }
    if (openSlots <= 0) {
      summary.proposalsSkipped.push({ category, reason: `Fila cheia (máx ${MAX_OPEN_PROPOSALS} pendentes)` });
      continue;
    }
    const first = items[0];
    if (!first) continue;
    try {
      await generateProposal({
        runId:        first.runId,
        agentType:    opts.agentType,
        restaurantId: first.restaurantId ?? undefined,
        scenarios:    items.map((s) => ({
          id:             s.id,
          title:          s.title,
          failureSummary: s.failureSummary,
          transcript:     s.transcriptJson as unknown as TranscriptTurn[],
        })),
      });
      summary.proposalsCreated++;
      openSlots--;
      covered.add(category);
      await new Promise((r) => setTimeout(r, 500));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      summary.proposalsSkipped.push({ category, reason: `Erro na geração: ${msg.slice(0, 120)}` });
      console.error("[AgentTrainingImprovement] backfill proposal failed:", { category, err });
    }
  }

  return summary;
}
