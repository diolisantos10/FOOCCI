/**
 * Foocci Brain — core types (v1).
 *
 * THE THESIS: the AI is not the product — the BRAIN is the product. The AI is the
 * engine; the Brain is the architecture; the Brain Director is the guardian; the
 * Knowledge Base is the truth; agents are executors; training improves; quality
 * protects; evidence validates.
 *
 * This is the reusable ROOT cognitive contract every agent (Waiter, CRM,
 * WhatsApp, Analytics, future) maps into. Specialized agents may keep richer
 * local types, but they must be expressible as this contract.
 */

/**
 * OPEN vertical identity: the built-in literals keep autocomplete, but ANY
 * string is valid — a new vertical (e.g. "BEAUTY_CLINIC") registers its
 * knowledge adapter in the KnowledgeAdapterRegistry without editing the core.
 */
export type BusinessType = "RESTAURANT" | "AGENCY" | "GENERIC" | (string & {});

export type BrainSourceType = "REAL_CONVERSATION" | "SIMULATION" | "MANUAL_TEST" | "SYSTEM_EVENT";

/** One sanitized turn of the recent conversation (never raw PII). */
export interface SanitizedTurn {
  role: "CUSTOMER" | "AGENT";
  content: string;
}

export interface BrainReasoningRequest {
  businessId: string;
  businessType: BusinessType;
  agentId: string;
  agentRole: string;
  sourceType: BrainSourceType;
  /** ALWAYS sanitized — the Brain never receives raw PII. */
  sanitizedInput: string;
  /** Recent conversation window (sanitized), oldest first. Optional — single-turn works as before. */
  sanitizedHistory?: SanitizedTurn[];
  /** Memória durável do cliente (comportamental, sem PII) — ex.: favoritos, recência. */
  customerMemory?: string;
  currentResponse?: string;
  contextHints?: string[];
  /**
   * Verdade CURADA que só o chamador conhece e o adapter do negócio não tem como
   * carregar — ex.: os trechos do manual recuperados para esta pergunta, ou os
   * sinais read-only do sistema no momento do relato.
   *
   * REGRA (Lei 2): isto é VERDADE, não entrada. Só entra aqui conteúdo curado e
   * governado (manual publicado, mapa de falhas, probe do sistema). NUNCA texto
   * digitado pelo usuário — senão o usuário passaria a escrever a própria verdade
   * e o verificador de fato ficaria cego.
   */
  extraTruthSources?: Record<string, unknown>;
}

export interface BrainCoherenceCheck {
  answersUserQuestion: boolean;
  matchesIntent: boolean;
  doesNotInventFacts: boolean;
  keepsBusinessObjective: boolean;
  verdict: "PASS" | "FAIL" | "NEEDS_REVIEW";
  reason: string;
}

export interface BrainReasoningResult {
  primaryIntent: string;
  secondaryIntents: string[];
  confidence: number; // 0–1
  customerNeed: string;
  contextNeeded: string[];
  availableContextUsed: string[];
  missingContext: string[];
  directAnswerStrategy: string;
  idealResponse: string;
  trainingRule: string;
  expectedImpact: string;
  safetyNotes: string[];
  shouldEscalate: boolean;
  escalationReason?: string;
  coherenceCheck: BrainCoherenceCheck;
  /** Auditável: quando a verdade usada neste raciocínio foi montada. */
  knowledgeAsOf?: string;
  /** 0–1: completude da verdade usada (gate de promoção do free-form na Fase 3). */
  knowledgeCompleteness?: number;
  /** Hard invariant: Brain reasoning NEVER touches the live runtime. */
  runtimeTouched: false;
}

/** The mandatory cognitive flow every Brain consumer follows. */
export const BRAIN_COGNITIVE_FLOW = [
  "1. Entender a intenção real (guardrails + semântica)",
  "2. Buscar contexto verdadeiro na Knowledge Base (nunca inventar)",
  "3. Raciocinar com o motor de IA roteado (ou fallback determinístico)",
  "4. Validar coerência antes de qualquer saída",
  "5. Registrar como proposta — humano aprova; runtime real só muda via versão de teste + Quality Gate",
] as const;
