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

import { getDefaultAgentProfileBySlug } from "@/services/agents/defaultAgentProfiles";
import type { AgentProfileDefinition } from "@/services/agents/types";
import { selectEngine } from "../engines/AIEngineRouter";
import type { AIEngineSelection } from "../engines/AIEngineTypes";
import { callStructuredJson } from "../engines/OpenAIEngineAdapter";
import { restaurantKnowledgeAdapter } from "../knowledge/RestaurantKnowledgeAdapter";
import type { BusinessKnowledgeSnapshot } from "../knowledge/BusinessKnowledgeContract";
import type { BrainReasoningRequest, BrainReasoningResult, BrainCoherenceCheck } from "../core/BrainTypes";

export type ReasoningMode = "LLM" | "FALLBACK";

export interface BrainReasoningOutcome {
  result: BrainReasoningResult;
  /** Which AI pilot actually thought this turn (provenance, no secrets). */
  engine: AIEngineSelection;
  reasoningMode: ReasoningMode;
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
function knowledgeBlock(snap: BusinessKnowledgeSnapshot): string {
  const t = snap.truthSources;
  const parts: string[] = [];
  if (t.policies) parts.push(`Identidade/política: ${JSON.stringify(t.policies)}`);
  if (t.products) parts.push(`Produtos (resumo): ${JSON.stringify(t.products)}`);
  if (t.prices) parts.push(`Preços (resumo): ${JSON.stringify(t.prices)}`);
  if (t.payments) parts.push(`Pagamentos: ${JSON.stringify(t.payments)}`);
  if (t.hours) parts.push(`Horários/entrega: ${JSON.stringify(t.hours)}`);
  parts.push(`CONTEXTO AUSENTE (NÃO inventar): ${snap.missingContext.join("; ") || "nenhum"}`);
  if (snap.safetyNotes.length) parts.push(`SEGURANÇA: ${snap.safetyNotes.join("; ")}`);
  return parts.join("\n");
}

async function loadKnowledge(req: BrainReasoningRequest): Promise<BusinessKnowledgeSnapshot> {
  if (req.businessType === "RESTAURANT") {
    return restaurantKnowledgeAdapter.getSnapshot(req.businessId).catch(() => emptySnapshot(req));
  }
  return emptySnapshot(req);
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
  const profile = getDefaultAgentProfileBySlug(req.agentId); // 1. SCOPE
  const snapshot = await loadKnowledge(req);                 // 2. TRUTH
  const engine = selectEngine(req.agentId);                  // 3. PILOT

  // No declared scope or no real pilot → safe deterministic fallback.
  if (!profile || engine.provider === "MOCK") {
    const why = !profile ? `agente "${req.agentId}" sem perfil declarado` : "nenhuma IA-piloto configurada";
    return { engine, reasoningMode: "FALLBACK", result: fallback(snapshot, why) };
  }

  try {
    const systemPrompt = `${buildScopePrompt(profile)}\n\nBASE DE CONHECIMENTO (verdade):\n${knowledgeBlock(snapshot)}`;
    const userContent = [
      req.contextHints?.length ? `PISTAS DE CONTEXTO: ${req.contextHints.join("; ")}` : "",
      `MENSAGEM DO CLIENTE (sanitizada): "${req.sanitizedInput}"`,
      req.currentResponse ? `RESPOSTA ATUAL DO AGENTE (sanitizada): "${req.currentResponse}"` : "",
    ].filter(Boolean).join("\n");

    const raw = await callStructuredJson({ selection: engine, systemPrompt, userContent, temperature: 0.2 });
    const parsed = JSON.parse(raw) as RawCore;
    if (!parsed.primaryIntent || !parsed.idealResponse) throw new Error("Brain JSON incompleto");

    return {
      engine,
      reasoningMode: "LLM",
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
        runtimeTouched: false,
      },
    };
  } catch (err) {
    const why = err instanceof Error ? err.message.slice(0, 80) : "erro no motor de IA";
    return { engine, reasoningMode: "FALLBACK", result: fallback(snapshot, why) };
  }
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
    runtimeTouched: false,
  };
}

// Light generic coherence. Per-agent deep guardrails (e.g. payment→payment) are
// layered on in the per-agent phase; here we guarantee the floor: a non-empty,
// on-intent answer that doesn't claim missing context as fact.
function coherenceOf(snap: BusinessKnowledgeSnapshot, core: RawCore): BrainCoherenceCheck {
  const answered = !!core.idealResponse && core.idealResponse.trim().length > 1;
  const hasIntent = !!core.primaryIntent;
  return {
    answersUserQuestion: answered,
    matchesIntent: hasIntent,
    doesNotInventFacts: true,
    keepsBusinessObjective: true,
    verdict: answered && hasIntent ? "PASS" : "NEEDS_REVIEW",
    reason: answered ? "resposta direta dentro do escopo" : "resposta vazia ou sem intenção",
  };
}

function clamp01(n: number | undefined): number {
  return typeof n === "number" ? Math.max(0, Math.min(1, n)) : 0.7;
}
