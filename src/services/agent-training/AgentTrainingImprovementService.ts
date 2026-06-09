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

  let raw: string;
  try {
    const response = await openai.chat.completions.create({
      model:       TRAINER_MODEL,
      messages:    [
        { role: "system", content: TRAINER_SYSTEM_PROMPT },
        { role: "user",   content: userMessage },
      ],
      temperature: 0.2,
      max_tokens:  800,
    });
    raw = response.choices[0]?.message?.content ?? "{}";
  } catch (err) {
    console.error("[AgentTrainingImprovement] OpenAI error:", err);
    throw new Error(`Improvement OpenAI call failed: ${err instanceof Error ? err.message : String(err)}`);
  }

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
    parsed = JSON.parse(raw);
  } catch {
    console.error("[AgentTrainingImprovement] Failed to parse LLM response:", raw);
    throw new Error(`Improvement failed to parse GPT-4o response: ${raw.slice(0, 120)}`);
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

export async function processRunForProposals(opts: {
  runId:         string;
  agentType:     AgentType;
  restaurantId?: string;
  autoCreate?:   boolean; // defaults to true
}): Promise<void> {
  const config = await prisma.agentTrainingConfig.findUnique({
    where: { agentType: opts.agentType },
  });
  const shouldCreate = opts.autoCreate ?? config?.autoCreateProposals ?? true;
  if (!shouldCreate) return;

  const groups = await analyzeFailures(opts.runId);

  for (const group of groups) {
    if (group.count === 0) continue;
    await generateProposal({
      runId:       opts.runId,
      agentType:   opts.agentType,
      restaurantId: opts.restaurantId,
      scenarios:   group.scenarios,
    });
    // Rate limiting
    await new Promise((r) => setTimeout(r, 500));
  }
}
