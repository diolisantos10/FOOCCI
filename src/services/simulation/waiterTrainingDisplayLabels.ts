/**
 * waiterTrainingDisplayLabels — presentation-only translation layer for the
 * "Centro de Treinamento do Waiter".
 *
 * The technical engine (Simulation, Quality, Library, Runtime Merge) keeps its
 * codes (P2, MISSED_SALE, HUNGRY_BIG, CRON, runtimeTouched…). This module ONLY
 * translates those codes into the language a restaurant owner/operator speaks:
 * marketing, sales and operation. It changes NO behavior and touches NO runtime —
 * it is pure string mapping consumed by the admin UI.
 */

import type { SimulationOpportunity } from "./types";

// ── Severidade ──────────────────────────────────────────────────────────────
export const SEVERITY_LABELS: Record<string, string> = {
  P0: "Crítico",
  P1: "Importante",
  P2: "Melhoria",
  INFO: "Informação",
};
export const severityLabel = (s: string): string => SEVERITY_LABELS[s] ?? "Melhoria";

// ── Tipo de melhoria/oportunidade ───────────────────────────────────────────
export const OPPORTUNITY_TYPE_LABELS: Record<string, string> = {
  MISSED_SALE: "Oportunidade de venda",
  POLICY_GAP: "Regra de atendimento",
  UX_FRICTION: "Atrito na conversa",
  BUG: "Erro",
  PROMPT_GAP: "Ajuste de orientação",
  LIBRARY_OPPORTUNITY: "Pode virar treinamento",
  TRAINING_OPPORTUNITY: "Pode virar treinamento",
  SAFETY_RISK: "Risco de segurança",
};
export const opportunityTypeLabel = (t: string): string => OPPORTUNITY_TYPE_LABELS[t] ?? "Melhoria de atendimento";

// ── Cenários (tipo de cliente/situação) ─────────────────────────────────────
// Inclui as chaves REAIS dos templates do Waiter + apelidos pedidos no produto,
// para que a tradução cubra ambos os vocabulários.
export const SCENARIO_TYPE_LABELS: Record<string, string> = {
  // chaves reais dos templates
  HUNGRY_BIG: "Cliente com muita fome",
  PAYMENT_QUESTION: "Cliente perguntou sobre pagamento",
  DIETARY_RESTRICTION: "Cliente com restrição alimentar",
  BUDGET_CUSTOMER: "Cliente preocupado com preço",
  GROUP_CUSTOMER: "Pedido para grupo",
  INDECISIVE_CUSTOMER: "Cliente indeciso",
  MAIN_THEN_DESSERT: "Sugestão de sobremesa",
  REFUSING_DRINK: "Sugestão de bebida",
  LIGHT_HEALTHY: "Cliente quer algo leve/saudável",
  NON_EXISTENT_PRODUCT: "Cliente pediu item que não existe",
  RECOMMENDATION_REQUEST: "Cliente pediu recomendação",
  WANTS_CHECKOUT: "Cliente quer finalizar o pedido",
  // apelidos de produto (aliases)
  VEGAN_RESTRICTION: "Cliente com restrição alimentar",
  BUDGET_CONCERN: "Cliente preocupado com preço",
  GROUP_ORDER: "Pedido para grupo",
  DESSERT_UPSELL: "Sugestão de sobremesa",
  DRINK_UPSELL: "Sugestão de bebida",
  // situações vindas da coleta de casos reais
  COMPLAINT: "Cliente reclamou",
  PRAISE: "Cliente elogiou",
  ABANDONMENT: "Cliente desistiu",
  DELIVERY_QUESTION: "Cliente perguntou sobre entrega",
  ORDER_BY_TEXT: "Cliente tentou pedir por texto",
  UPSELL_ACCEPTED: "Cliente aceitou sugestão extra",
  UPSELL_REFUSED: "Cliente recusou sugestão extra",
  CONVERSION: "Cliente fechou o pedido",
};
export const scenarioTypeLabel = (t: string): string => SCENARIO_TYPE_LABELS[t] ?? "Situação de atendimento";

// ── Origem da sugestão ──────────────────────────────────────────────────────
export const ORIGIN_LABELS: Record<string, string> = {
  CRON: "Simulação automática",
  MANUAL: "Simulação manual",
  DIAGNOSTIC: "Diagnóstico interno",
  EXAMPLE: "Conversa real sanitizada",
  REAL_CONVERSATION: "Conversa real sanitizada",
  LIBRARY: "Material da Biblioteca",
  SALES_PROOF: "Prova de resultado",
};

// ── Provas de Resultado — tipos de evidência ────────────────────────────────
export const EVIDENCE_TYPE_LABELS: Record<string, string> = {
  SALE_CONVERSION: "Venda conduzida",
  UPSELL: "Venda extra (upsell)",
  RECOVERY: "Cliente recuperado",
  FRICTION_REDUCTION: "Atrito resolvido",
  QUALITATIVE_PROOF: "Elogio / prova qualitativa",
  BEFORE_AFTER: "Antes e depois",
};
export const evidenceTypeLabel = (t: string): string => EVIDENCE_TYPE_LABELS[t] ?? "Evidência";

export const EVIDENCE_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Aguardando sua revisão",
  APPROVED: "Prova aprovada",
  REJECTED: "Descartada",
  BACKLOG: "Guardada para depois",
};
export const evidenceStatusLabel = (s: string): string => EVIDENCE_STATUS_LABELS[s] ?? s;
export const originLabel = (mode?: string | null): string =>
  (mode && ORIGIN_LABELS[mode]) || "Detectado pelo Simulador";

// ── Ações do operador (decisão) ─────────────────────────────────────────────
export type TrainingDecision = "APPROVED" | "REJECTED" | "BACKLOGGED";
export const TRAINING_ACTION_LABELS: Record<string, string> = {
  APPROVED: "Aprovar treinamento",
  REJECTED: "Rejeitar",
  BACKLOGGED: "Guardar para depois",
  // sinônimos em inglês (caso a UI passe o verbo)
  Approve: "Aprovar treinamento",
  Reject: "Rejeitar",
  Backlog: "Guardar para depois",
};
export const trainingActionLabel = (a: string): string => TRAINING_ACTION_LABELS[a] ?? a;

export const TRAINING_ACTION_MICROCOPY: Record<TrainingDecision, string> = {
  APPROVED: "Quero que o Waiter aprenda isso.",
  REJECTED: "Isso não é útil ou não faz sentido.",
  BACKLOGGED: "Boa ideia, mas não agora.",
};

// ── Casos reais (exemplos) — status ─────────────────────────────────────────
export const EXAMPLE_STATUS_LABELS: Record<string, string> = {
  APPROVED: "Usado como exemplo",
  PENDING_REVIEW: "Aguardando sua revisão",
  PENDING: "Aguardando sua revisão",
  REJECTED: "Não usar",
  BACKLOGGED: "Revisar depois",
};
export const exampleStatusLabel = (s: string): string => EXAMPLE_STATUS_LABELS[s] ?? s;

// ── Biblioteca — status legível para o operador ─────────────────────────────
// Esconde EXTRACTED/ACTIVE/PROCESSING_CHUNKS etc. atrás de 4 estados simples.
export const LIBRARY_PROCESSING_STATUS: Record<string, string> = {
  READY: "Pronta para treino",
  EXTRACTED: "Pronta para treino",
  PENDING: "Processando",
  EXTRACTING: "Processando",
  EXTRACTING_TEXT: "Processando",
  CHUNKING: "Processando",
  PROCESSING_CHUNKS: "Processando",
  CONSOLIDATING: "Processando",
  FAILED: "Precisa revisar",
  PARTIAL: "Precisa revisar",
};
export const libraryProcessingStatusLabel = (s: string): string => LIBRARY_PROCESSING_STATUS[s] ?? "Processando";

export const LIBRARY_TECHNIQUE_STATUS: Record<string, string> = {
  ACTIVE: "Pronta para treino",
  EXTRACTED: "Precisa revisar",
  IN_REVIEW: "Precisa revisar",
  ARCHIVED: "Desativada",
  REJECTED: "Desativada",
};
export const libraryTechniqueStatusLabel = (s: string): string => LIBRARY_TECHNIQUE_STATUS[s] ?? s;

// ── Texto fixo: o que acontece ao aprovar ───────────────────────────────────
export const APPROVAL_DISCLAIMER =
  "Aprovar não muda o atendimento real imediatamente. A melhoria fica registrada " +
  "como treinamento e só poderá entrar no Waiter em uma versão de teste aprovada no Quality Gate.";

export const SAFE_RUNTIME_NOTE = "Seguro: não muda o atendimento real sozinho.";

// ── Card de "Sugestão de treinamento" (linguagem humana) ────────────────────
export interface TrainingSuggestionView {
  /** Título humano da sugestão. */
  title: string;
  /** O que aconteceu / problema encontrado. */
  problem: string;
  /** O que o cliente disse (exemplo), quando houver. */
  customerExample: string | null;
  /** Solução de treinamento sugerida. */
  solution: string;
  /** Impacto esperado em venda/atendimento. */
  expectedImpact: string;
  /** Origem legível (Simulação automática / manual / conversa real…). */
  origin: string;
  /** Linha técnica pequena/colapsada (códigos crus). */
  technicalDetail: string;
}

/**
 * Traduz uma oportunidade do simulador (códigos técnicos) num card que responde:
 * o que aprender, por quê, de onde veio, que problema resolve e qual o impacto.
 */
export function buildTrainingSuggestion(opp: {
  type: string;
  severity: string;
  title: string;
  summary: string;
  recommendation: string;
  expectedImpact?: string | null;
  scenario?: { scenarioType?: string; initialMessage?: string } | null;
  run?: { mode?: string } | null;
}): TrainingSuggestionView {
  const scenarioType = opp.scenario?.scenarioType;
  const technicalBits = [scenarioType, opp.type, opp.severity].filter(Boolean) as string[];
  return {
    title: opp.title,
    problem: opp.summary,
    customerExample: opp.scenario?.initialMessage ?? null,
    solution: opp.recommendation,
    expectedImpact:
      opp.expectedImpact?.trim() ||
      "Melhorar a experiência e aumentar a chance de conversão neste tipo de cliente.",
    origin: opp.run?.mode ? originLabel(opp.run.mode) : "Detectado pelo Simulador",
    technicalDetail: technicalBits
      .map((b, i) => (i === technicalBits.length - 1 ? severityLabel(b) : b))
      .join(" · "),
  };
}

/** Conveniência para tipagem forte do builder a partir do tipo do domínio. */
export type OpportunityForView = Pick<
  SimulationOpportunity,
  "type" | "severity" | "title" | "summary" | "recommendation" | "expectedImpact"
>;
