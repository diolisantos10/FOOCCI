/**
 * BrainReasoner — the generic, agent-agnostic reasoning core of the Foocci Brain.
 *
 * THE SINGLE GATEWAY (Regra de Ouro, Lei 1): every agent reasons by calling this
 * ONE function. It runs the BRAIN_COGNITIVE_FLOW end to end, for ANY agent:
 *   1. SCOPE   — load the agent's declared profile (never a hardcoded identity);
 *   2. TRUTH   — load the business Knowledge snapshot (never invents);
 *   3. PILOT   — route the thinking to the connected AI engine (router);
 *   4. COHERENCE — validate before the result is used.
 *
 * The Brain is the engine; the AI is the pilot. Today the only plugged pilot is
 * OPENAI; Claude/Gemini plug in later via a governed BrainChangeRequest, with NO
 * change here. Read-only: never sends, never mutates runtime (runtimeTouched:false).
 *
 * This is additive — it does not touch any live agent path. Wiring agents to it
 * (WhatsApp first) is the next phase.
 */

import { getAgentProfile } from "@/services/agents/AgentProfileService";
import type { AgentProfileDefinition } from "@/services/agents/types";
import { selectEngineRouted } from "../engines/AIEngineRouter";
import type { AIEngineSelection } from "../engines/AIEngineTypes";
import { callStructuredJson } from "../engines/OpenAIEngineAdapter";
import { resolveKnowledgeAdapter } from "../knowledge/KnowledgeAdapterRegistry";
import type { BusinessKnowledgeSnapshot } from "../knowledge/BusinessKnowledgeContract";
import { listApprovedLearningsForBrain } from "../training/BrainTrainingContract";
import { verifyAgainstSnapshot } from "./SnapshotCoherenceVerifier";
import type { BrainReasoningRequest, BrainReasoningResult, BrainCoherenceCheck } from "../core/BrainTypes";

export type ReasoningMode = "LLM" | "FALLBACK";

export interface BrainReasoningOutcome {
  result: BrainReasoningResult;
  /** Which AI pilot actually thought this turn (provenance, no secrets). */
  engine: AIEngineSelection;
  reasoningMode: ReasoningMode;
  /** A verdade usada neste turno — permite críticos externos (LLM-judge) sem re-consulta. */
  snapshot: Pick<BusinessKnowledgeSnapshot, "truthSources" | "missingContext">;
}

// ── Scope → system prompt ───────────────────────────────────────────────────────
// The identity comes from the agent's PROFILE, not from a constant. This is what
// makes a single Brain operate every agent (Waiter, CRM, WhatsApp, …).
function buildScopePrompt(profile: AgentProfileDefinition): string {
  return [
    `Você é o "${profile.name}"${profile.title ? ` — ${profile.title}` : ""}, um agente de IA do Foocci.`,
    profile.mission ? `MISSÃO: ${profile.mission}` : "",
    profile.responsibilities.length ? `RESPONSABILIDADES: ${profile.responsibilities.join("; ")}` : "",
    profile.allowedActions.length ? `PODE FAZER: ${profile.allowedActions.join("; ")}` : "",
    profile.forbiddenActions.length ? `NÃO PODE FAZER (limite rígido, inviolável): ${profile.forbiddenActions.join("; ")}` : "",
    profile.businessRules.length ? `REGRAS DE NEGÓCIO: ${profile.businessRules.slice(0, 12).join("; ")}` : "",
    profile.knowledgeAreas.length ? `SEU DOMÍNIO: ${profile.knowledgeAreas.join("; ")}` : "",
    "",
    "COMO RACIOCINAR (obrigatório):",
    "1. Entenda a intenção REAL do cliente (não trate toda mensagem como pedido/busca).",
    "2. Use SOMENTE a Base de Conhecimento abaixo como verdade — se faltar dado, diga que precisa confirmar; NUNCA invente preço, produto, regra, pagamento ou promoção.",
    "3. Responda DIRETAMENTE à mensagem, dentro do seu escopo; não mude de assunto.",
    "4. Se a pergunta sair do seu escopo ou faltar contexto crítico, escale (shouldEscalate=true).",
    "",
    "Responda SOMENTE em JSON com as chaves: primaryIntent (string curta em MAIÚSCULAS), " +
      "secondaryIntents (array), confidence (0..1), customerNeed, directAnswerStrategy, " +
      "idealResponse (a resposta real que iria ao cliente), trainingRule, expectedImpact, " +
      "safetyNotes (array), shouldEscalate (boolean), escalationReason.",
  ].filter(Boolean).join("\n");
}

// ── Knowledge → truth block ─────────────────────────────────────────────────────
// Serializes EVERY truthSources key — anything an adapter loads reaches the LLM.
const TRUTH_LABELS: Record<string, string> = {
  policies: "Identidade/política",
  products: "Produtos",
  prices: "Preços",
  payments: "Pagamentos",
  hours: "Horários/atendimento",
  customers: "Clientes (agregado)",
  orders: "Pedidos (agregado)",
  materials: "Materiais",
  conversations: "Conversas (agregado)",
  evidence: "Evidências",
};

function knowledgeBlock(snap: BusinessKnowledgeSnapshot): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(snap.truthSources)) {
    if (value === undefined || value === null) continue;
    parts.push(`${TRUTH_LABELS[key] ?? key}: ${JSON.stringify(value)}`);
  }
  parts.push(`CONTEXTO AUSENTE (NÃO inventar): ${snap.missingContext.join("; ") || "nenhum"}`);
  if (snap.safetyNotes.length) parts.push(`SEGURANÇA: ${snap.safetyNotes.join("; ")}`);
  return parts.join("\n");
}

// The Brain core knows no vertical: the adapter comes from the registry. The
// sanitized message goes along as queryHint so the adapter can pull the
// knowledge RELEVANT to this exact question (retrieval), not just the top-N.
async function loadKnowledge(req: BrainReasoningRequest): Promise<BusinessKnowledgeSnapshot> {
  const adapter = resolveKnowledgeAdapter(req.businessType);
  if (!adapter) return emptySnapshot(req);
  return adapter
    .getSnapshot(req.businessId, { agentId: req.agentId, queryHint: req.sanitizedInput })
    .catch(() => emptySnapshot(req));
}

// ── Approved learnings → the human-approved pool finally feeds reasoning ───────
const MAX_LEARNINGS = 10;
const MAX_LEARNING_CHARS = 220;

async function approvedLearningsBlock(agentId: string): Promise<string> {
  try {
    const learnings = await listApprovedLearningsForBrain(agentId, MAX_LEARNINGS);
    if (!learnings.length) return "";
    const lines = learnings.map(
      (l) => `- ${l.title}: ${l.trainingRule}`.slice(0, MAX_LEARNING_CHARS),
    );
    return `\n\nAPRENDIZADOS APROVADOS (regras extraídas de casos reais, aprovadas por humano):\n${lines.join("\n")}`;
  } catch {
    return ""; // best-effort: learnings never block reasoning
  }
}

function emptySnapshot(req: BrainReasoningRequest): BusinessKnowledgeSnapshot {
  return {
    businessId: req.businessId,
    businessType: req.businessType,
    truthSources: {},
    missingContext: ["base de conhecimento não disponível"],
    safetyNotes: ["Sem snapshot — não afirmar nada específico do negócio."],
  };
}

interface RawCore {
  primaryIntent?: string;
  secondaryIntents?: string[];
  confidence?: number;
  customerNeed?: string;
  directAnswerStrategy?: string;
  idealResponse?: string;
  trainingRule?: string;
  expectedImpact?: string;
  safetyNotes?: string[];
  shouldEscalate?: boolean;
  escalationReason?: string;
}

/**
 * The single reasoning gateway. ANY agent → BrainReasoningResult.
 * Never throws: on a missing scope or unconfigured pilot it returns a safe,
 * deterministic fallback that escalates and invents nothing.
 */
export async function reasonAsAgent(req: BrainReasoningRequest): Promise<BrainReasoningOutcome> {
  // 1. SCOPE — DB-first (AGENT_PROFILE_DB_ENABLED) com o registry de código como
  // piso que nunca lança: um negócio pode declarar/ajustar agentes sem deploy.
  const profile = await getAgentProfile(req.agentId);
  const snapshot = await loadKnowledge(req);                             // 2. TRUTH
  const engine = await selectEngineRouted(req.agentId, { businessId: req.businessId }); // 3. PILOT

  // No declared scope or no real pilot → safe deterministic fallback.
  if (!profile || engine.provider === "MOCK") {
    const why = !profile ? `agente "${req.agentId}" sem perfil declarado` : "nenhuma IA-piloto configurada";
    return { engine, reasoningMode: "FALLBACK", snapshot: pickTruth(snapshot), result: fallback(snapshot, why) };
  }

  try {
    const learningsBlock = await approvedLearningsBlock(req.agentId);
    const systemPrompt =
      `${buildScopePrompt(profile)}\n\nBASE DE CONHECIMENTO (verdade):\n${knowledgeBlock(snapshot)}${learningsBlock}`;
    const historyBlock = req.sanitizedHistory?.length
      ? `HISTÓRICO RECENTE (sanitizado, do mais antigo ao mais novo):\n${req.sanitizedHistory
          .map((t) => `${t.role === "CUSTOMER" ? "Cliente" : "Agente"}: ${t.content}`)
          .join("\n")}`
      : "";
    const userContent = [
      req.contextHints?.length ? `PISTAS DE CONTEXTO: ${req.contextHints.join("; ")}` : "",
      req.customerMemory ? `MEMÓRIA DO CLIENTE (comportamental, sem dados pessoais): ${req.customerMemory}` : "",
      historyBlock,
      `MENSAGEM DO CLIENTE (sanitizada): "${req.sanitizedInput}"`,
      req.currentResponse ? `RESPOSTA ATUAL DO AGENTE (sanitizada): "${req.currentResponse}"` : "",
    ].filter(Boolean).join("\n");

    const raw = await callStructuredJson({ selection: engine, systemPrompt, userContent, temperature: 0.2 });
    const parsed = JSON.parse(raw) as RawCore;
    if (!parsed.primaryIntent || !parsed.idealResponse) throw new Error("Brain JSON incompleto");

    return {
      engine,
      reasoningMode: "LLM",
      snapshot: pickTruth(snapshot),
      result: {
        primaryIntent: parsed.primaryIntent,
        secondaryIntents: Array.isArray(parsed.secondaryIntents) ? parsed.secondaryIntents : [],
        confidence: clamp01(parsed.confidence),
        customerNeed: parsed.customerNeed ?? "",
        contextNeeded: [],
        availableContextUsed: Object.keys(snapshot.truthSources),
        missingContext: snapshot.missingContext,
        directAnswerStrategy: parsed.directAnswerStrategy ?? "",
        idealResponse: parsed.idealResponse,
        trainingRule: parsed.trainingRule ?? "",
        expectedImpact: parsed.expectedImpact ?? "",
        safetyNotes: Array.isArray(parsed.safetyNotes) ? parsed.safetyNotes : [],
        shouldEscalate: parsed.shouldEscalate === true,
        escalationReason: parsed.escalationReason,
        coherenceCheck: coherenceOf(snapshot, parsed),
        knowledgeAsOf: snapshot.snapshotAsOf,
        knowledgeCompleteness: snapshot.completenessScore,
        runtimeTouched: false,
      },
    };
  } catch (err) {
    const why = err instanceof Error ? err.message.slice(0, 80) : "erro no motor de IA";
    return { engine, reasoningMode: "FALLBACK", snapshot: pickTruth(snapshot), result: fallback(snapshot, why) };
  }
}

function pickTruth(snap: BusinessKnowledgeSnapshot): Pick<BusinessKnowledgeSnapshot, "truthSources" | "missingContext"> {
  return { truthSources: snap.truthSources, missingContext: snap.missingContext };
}

function fallback(snap: BusinessKnowledgeSnapshot, reason: string): BrainReasoningResult {
  return {
    primaryIntent: "UNKNOWN",
    secondaryIntents: [],
    confidence: 0.3,
    customerNeed: "",
    contextNeeded: [],
    availableContextUsed: Object.keys(snap.truthSources),
    missingContext: snap.missingContext,
    directAnswerStrategy: "Escalar com segurança — não inventar.",
    idealResponse: "Deixa eu confirmar isso pra você e já te respondo. 😊",
    trainingRule: "",
    expectedImpact: "",
    safetyNotes: [`fallback determinístico: ${reason}`],
    shouldEscalate: true,
    escalationReason: reason,
    coherenceCheck: {
      answersUserQuestion: false,
      matchesIntent: false,
      doesNotInventFacts: true,
      keepsBusinessObjective: true,
      verdict: "NEEDS_REVIEW",
      reason,
    },
    knowledgeAsOf: snap.snapshotAsOf,
    knowledgeCompleteness: snap.completenessScore,
    runtimeTouched: false,
  };
}

// Coherence floor: a non-empty, on-intent answer whose CLAIMS are verified
// against the knowledge snapshot (invented prices / service denials → review).
// Per-agent deep guardrails and the LLM critic layer on top in later phases.
function coherenceOf(snap: BusinessKnowledgeSnapshot, core: RawCore): BrainCoherenceCheck {
  const answered = !!core.idealResponse && core.idealResponse.trim().length > 1;
  const hasIntent = !!core.primaryIntent;
  const claims = verifyAgainstSnapshot(core.idealResponse ?? "", snap);

  // Piso DURO: preço inventado NUNCA passa (risco real de alucinação). Uma negação
  // ("não temos X") sem preço inventado NÃO trava aqui — ela sobe para o juiz LLM,
  // que sabe distinguir negação HONESTA (X não está na base → ok) de negação
  // ERRADA (base mostra X → reprova). O verificador determinístico não consegue
  // fazer essa distinção; o juiz consegue. Assim paramos de barrar "não temos
  // veganos" (honesto) sem reabrir o incidente rodízio (o juiz pega a negação errada).
  const pass = answered && hasIntent && claims.doesNotInventFacts;
  const reasons: string[] = [];
  if (!answered) reasons.push("resposta vazia ou sem intenção");
  if (!claims.doesNotInventFacts) reasons.push(claims.reason);

  return {
    answersUserQuestion: answered,
    matchesIntent: hasIntent,
    doesNotInventFacts: claims.doesNotInventFacts,
    keepsBusinessObjective: true,
    verdict: pass ? "PASS" : "NEEDS_REVIEW",
    reason: pass
      ? (claims.serviceDenials.length ? "resposta direta; negação será arbitrada pelo juiz LLM" : "resposta direta, claims compatíveis com a base")
      : reasons.join("; "),
  };
}

function clamp01(n: number | undefined): number {
  return typeof n === "number" ? Math.max(0, Math.min(1, n)) : 0.7;
}
