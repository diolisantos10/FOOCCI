/**
 * waiterIntelligenceBacklog — READ-ONLY behavioral audit of the current Waiter,
 * its Test Center coverage, evaluation criteria and a prioritized correction
 * backlog (P0/P1/P2). Consumed by the Waiter Room (/admin/agents/waiter).
 *
 * Strings + metadata only. Nothing here imports or changes runtime behavior. It
 * documents what the Waiter does today and what to validate before any real use.
 */

// ── Test Center coverage (the 20 critical scenarios for tomorrow) ───────────────

export type CoverageStatus = "AUTOMATED" | "PARTIAL" | "MANUAL" | "GAP";

export const COVERAGE_LABELS: Record<CoverageStatus, string> = {
  AUTOMATED: "Automatizado",
  PARTIAL: "Parcial",
  MANUAL: "Manual",
  GAP: "Sem cobertura",
};

export interface TestCoverageItem {
  id: string;
  label: string;
  status: CoverageStatus;
  /** Existing Test Center group that covers it, when applicable. */
  group?: string;
  note: string;
}

/** Maps the 20 critical scenarios → real Test Center coverage today. */
export const WAITER_TEST_COVERAGE: readonly TestCoverageItem[] = [
  { id: "objective_order", label: "Pedido objetivo", status: "PARTIAL", group: "checkout_guidance", note: "Conduz ao checkout; validar fala direta manualmente." },
  { id: "indecisive", label: "Cliente indeciso", status: "AUTOMATED", group: "recommendation", note: "Recomendação com cards reais." },
  { id: "high_hunger", label: "Fome alta", status: "MANUAL", note: "Sem grupo dedicado; validar manualmente (porção maior)." },
  { id: "budget", label: "Orçamento limitado", status: "AUTOMATED", group: "budget_intent", note: "Sugere bom custo-benefício." },
  { id: "light", label: "Algo leve", status: "AUTOMATED", group: "light_intent", note: "Prioriza opções leves." },
  { id: "shareable", label: "Grande / compartilhável", status: "AUTOMATED", group: "group_size", note: "includes_shareable (combo/porção)." },
  { id: "real_suggestion", label: "Sugestão de produto real", status: "AUTOMATED", group: "recommendation", note: "has_real_cards." },
  { id: "no_hallucination", label: "Sugestão sem alucinação", status: "AUTOMATED", group: "no_hallucination", note: "Todo card existe no catálogo." },
  { id: "nonexistent", label: "Produto inexistente", status: "AUTOMATED", group: "no_hallucination", note: "no_forbidden_denial + no_hallucination." },
  { id: "restriction", label: "Restrição alimentar", status: "PARTIAL", group: "restrictions", note: "Best-effort; validar manualmente." },
  { id: "restriction_specifics", label: "No seafood / pork / vegetariano / alergia", status: "PARTIAL", group: "restrictions", note: "Depende do catálogo; validar manualmente." },
  { id: "upsell_drink", label: "Upsell de bebida após o item", status: "AUTOMATED", group: "upsell_open", note: "Oferta contextual + respects_refusal." },
  { id: "upsell_dessert", label: "Upsell de sobremesa", status: "PARTIAL", group: "upsell_open", note: "Cobertura menor; reforçar cenário." },
  { id: "refusal", label: "Recusa de upsell sem insistir", status: "AUTOMATED", group: "consultative_close", note: "respects_refusal." },
  { id: "close", label: "Fechamento com próximo passo", status: "AUTOMATED", group: "consultative_close", note: "has_cta_or_next_step." },
  { id: "combo", label: "Cliente pedindo combo", status: "AUTOMATED", group: "group_size", note: "includes_shareable." },
  { id: "best_seller", label: "Cliente pedindo 'o mais vendido'", status: "PARTIAL", group: "recommendation", note: "Usa best-sellers reais; validar fala." },
  { id: "surprise_me", label: "Cliente pedindo 'me surpreende'", status: "PARTIAL", group: "recommendation", note: "Recomenda; validar força da sugestão." },
  { id: "price", label: "Cliente pedindo preço", status: "GAP", note: "Sem check automatizado de preço; validar manualmente." },
  { id: "abandon", label: "Cliente abandonando / saindo do fluxo", status: "GAP", note: "Sem cenário automatizado; validar manualmente." },
];

// ── quality criteria the evaluator measures (vs. manual) ────────────────────────

export interface EvalCriterion {
  label: string;
  automated: boolean;
  check?: string; // existing evaluator check type, when automated
  note?: string;
}

export const WAITER_EVAL_CRITERIA: readonly EvalCriterion[] = [
  { label: "Usa produto real", automated: true, check: "has_real_cards" },
  { label: "Não inventa produto", automated: true, check: "no_hallucination" },
  { label: "Não responde negação proibida", automated: true, check: "no_forbidden_denial" },
  { label: "Conduz para próximo passo", automated: true, check: "has_cta_or_next_step" },
  { label: "Respeita recusa de upsell", automated: true, check: "respects_refusal" },
  { label: "Usa cards/UI quando aplicável", automated: true, check: "cards_not_empty" },
  { label: "Não despeja o cardápio inteiro", automated: true, check: "no_long_menu_dump", note: "Teto atual = 6 cards (constituição sugere ~3)." },
  { label: "Sugere até 3 opções", automated: false, note: "Hoje o teto automatizado é 6; alinhar para 3 (backlog P1)." },
  { label: "Faz no máximo 1 pergunta de diagnóstico", automated: false, note: "Validar manualmente; sem métrica automatizada." },
  { label: "Não inventa preço", automated: false, note: "Sem check de preço; validar manualmente." },
  { label: "Mantém mensagem curta", automated: false, note: "Sem métrica de comprimento automatizada." },
  { label: "Sugere bebida/sobremesa no momento certo", automated: false, note: "Parcial em upsell_open; validar manualmente." },
  { label: "Respeita restrição alimentar", automated: false, note: "Best-effort; depende do catálogo." },
  { label: "Não vira entrevista longa / não ignora intenção", automated: false, note: "Validar manualmente." },
];

// ── prioritized correction backlog ──────────────────────────────────────────────

export type BacklogPriority = "P0" | "P1" | "P2";
export type BacklogRisk = "LOW" | "MEDIUM" | "HIGH";

export interface BacklogItem {
  id: string;
  title: string;
  problem: string;
  impact: string;
  where: string;
  risk: BacklogRisk;
  nextStep: string;
  phase: string;
  priority: BacklogPriority;
}

export const WAITER_INTELLIGENCE_BACKLOG: readonly BacklogItem[] = [
  // ── P0 — antes de uso real ──
  {
    id: "p0-hallucination",
    title: "Garantia anti-alucinação de produto",
    problem: "O agente nunca deve citar/sugerir item que não está no catálogo.",
    impact: "Quebra de confiança e pedido inválido.",
    where: "WaiterBrainV2.decide + no_hallucination",
    risk: "LOW",
    nextStep: "Rodar Test Center + cenários manuais 8/9 com restaurante fechado.",
    phase: "Fase 2 — Test Center",
    priority: "P0",
  },
  {
    id: "p0-restriction",
    title: "Sugestão incompatível com restrição",
    problem: "Restrições (sem frutos do mar/porco/vegetariano/alergia) são best-effort.",
    impact: "Risco de sugerir item incompatível com a restrição do cliente.",
    where: "restrictions (best-effort) + catálogo",
    risk: "MEDIUM",
    nextStep: "Validar manualmente amanhã; mapear regras de restrição por categoria.",
    phase: "Fase 2 — Test Center",
    priority: "P0",
  },
  {
    id: "p0-price",
    title: "Preço sempre oficial",
    problem: "Não há check automatizado garantindo preço exibido = preço oficial.",
    impact: "Erro de preço gera atrito/erro comercial.",
    where: "PromptBuilderService (catálogo injetado) — sem teste de preço",
    risk: "MEDIUM",
    nextStep: "Validar manualmente; avaliar check de preço no evaluator (futuro).",
    phase: "Fase 2 — Test Center",
    priority: "P0",
  },
  {
    id: "p0-flow",
    title: "Sempre conduzir para o pedido",
    problem: "Em algumas falas o agente pode ficar genérico e não conduzir ao próximo passo.",
    impact: "Perda de conversão e fluxo travado.",
    where: "WaiterBrainV2 + has_cta_or_next_step",
    risk: "LOW",
    nextStep: "Validar fechamento manualmente; reforçar cenários de close.",
    phase: "Fase 2 — Test Center",
    priority: "P0",
  },
  {
    id: "p0-unit-tests",
    title: "Unit tests do WaiterBrainV2 com falhas pré-existentes",
    problem: "A suíte WaiterBrainV2.sales-core/sales-specialist tem casos falhando (drift entre teste e comportamento atual).",
    impact: "Sinal de regressão/drift; precisa ser entendido antes de uso real.",
    where: "src/services/ai/tests/WaiterBrainV2.sales-core.test.ts + sales-specialist.test.ts",
    risk: "MEDIUM",
    nextStep: "Triagem: decidir caso a caso se o teste está desatualizado ou se há regressão real (sem reescrever o motor).",
    phase: "Fase 2 — Test Center",
    priority: "P0",
  },
  // ── P1 — melhora comercial ──
  {
    id: "p1-three-cards",
    title: "Alinhar teto de sugestões (3 vs 6)",
    problem: "O evaluator aceita até 6 cards; a constituição sugere ~3 por vez.",
    impact: "Excesso de opções pode reduzir decisão.",
    where: "waiterEvaluator.MAX_CARDS_PER_RESPONSE",
    risk: "LOW",
    nextStep: "Decidir teto-alvo e alinhar evaluator + comportamento (com teste).",
    phase: "Fase 2/3",
    priority: "P1",
  },
  {
    id: "p1-probing",
    title: "Sondagem melhor (≤1 pergunta)",
    problem: "Não há métrica automatizada para 'no máximo 1 pergunta antes de sugerir'.",
    impact: "Pedido rápido pode virar entrevista longa.",
    where: "WaiterBrainV2 + (sem check)",
    risk: "LOW",
    nextStep: "Adicionar critério/checagem de nº de perguntas.",
    phase: "Fase 2/3",
    priority: "P1",
  },
  {
    id: "p1-dessert-upsell",
    title: "Upsell de sobremesa mais contextual",
    problem: "Cobertura de sobremesa é menor que a de bebida.",
    impact: "Oportunidade comercial perdida.",
    where: "upsell_open / UpsellEngine",
    risk: "LOW",
    nextStep: "Reforçar cenários e momento da oferta de sobremesa.",
    phase: "Fase 2/3",
    priority: "P1",
  },
  {
    id: "p1-stronger-reco",
    title: "Recomendações mais fortes ('mais vendido', 'me surpreende')",
    problem: "Em pedidos abertos a sugestão pode ficar genérica.",
    impact: "Menos ticket médio e menos 'uau'.",
    where: "WaiterBrainV2 ranking + best-sellers",
    risk: "MEDIUM",
    nextStep: "Validar falas; reforçar storytelling/ancoragem (sem mudar preços).",
    phase: "Fase 3",
    priority: "P1",
  },
  {
    id: "p1-short-msg",
    title: "Mensagem curta medível",
    problem: "Não há métrica automatizada de comprimento da mensagem.",
    impact: "Mensagens longas reduzem clareza.",
    where: "evaluator (sem check de tamanho)",
    risk: "LOW",
    nextStep: "Avaliar check de comprimento máximo no evaluator.",
    phase: "Fase 2/3",
    priority: "P1",
  },
  // ── P2 — evolução ──
  {
    id: "p2-library-runtime",
    title: "Library influenciando o runtime",
    problem: "Técnicas da Library não afetam o prompt (por segurança).",
    impact: "Formação técnica ainda não vira comportamento.",
    where: "Agent Library ↔ WaiterBrainV2",
    risk: "HIGH",
    nextStep: "Só com flag, testes e versionamento (fase futura).",
    phase: "Fase 5",
    priority: "P2",
  },
  {
    id: "p2-personalization",
    title: "Personalização por cliente",
    problem: "Pouca adaptação ao histórico/perfil do cliente.",
    impact: "Recomendação menos relevante.",
    where: "WaiterBrainV2 + perfil do cliente",
    risk: "MEDIUM",
    nextStep: "Desenhar após telemetria.",
    phase: "Fase 4/5",
    priority: "P2",
  },
  {
    id: "p2-telemetry",
    title: "Telemetria de conversão + score real",
    problem: "KPIs e score de testes não têm fonte de dados real na Room.",
    impact: "Decisão sem métrica.",
    where: "Waiter Room (KPIs) + Test Center (score)",
    risk: "LOW",
    nextStep: "Conectar telemetria read-only; exibir score na Room.",
    phase: "Fase 3/4",
    priority: "P2",
  },
  {
    id: "p2-learning",
    title: "Aprendizado por experiência",
    problem: "Sem laço de aprendizado a partir de pedidos reais.",
    impact: "Evolução manual.",
    where: "futuro",
    risk: "HIGH",
    nextStep: "Só após governança/versionamento maduros.",
    phase: "Fase 5+",
    priority: "P2",
  },
];

// ── tomorrow's ordered test plan ────────────────────────────────────────────────

export const WAITER_TOMORROW_PLAN: readonly string[] = [
  "Abrir /admin/agents/waiter",
  "Conferir aba Dashboard",
  "Conferir aba Runtime & Testes",
  "Rodar o Waiter Test Center",
  "Testar cliente objetivo",
  "Testar cliente indeciso",
  "Testar cliente pedindo sugestão",
  "Testar cliente pedindo 'mais vendido'",
  "Testar restrição alimentar",
  "Testar upsell de bebida",
  "Testar upsell de sobremesa",
  "Testar produto inexistente",
  "Testar fechamento do pedido",
  "Se algo falhar, registrar no backlog P0/P1",
];

// ── helpers (pure) ──────────────────────────────────────────────────────────────

export function backlogByPriority(priority: BacklogPriority): BacklogItem[] {
  return WAITER_INTELLIGENCE_BACKLOG.filter((b) => b.priority === priority);
}

export interface CoverageSummary {
  total: number;
  automated: number;
  partial: number;
  manual: number;
  gap: number;
}

export function coverageSummary(): CoverageSummary {
  return {
    total: WAITER_TEST_COVERAGE.length,
    automated: WAITER_TEST_COVERAGE.filter((c) => c.status === "AUTOMATED").length,
    partial: WAITER_TEST_COVERAGE.filter((c) => c.status === "PARTIAL").length,
    manual: WAITER_TEST_COVERAGE.filter((c) => c.status === "MANUAL").length,
    gap: WAITER_TEST_COVERAGE.filter((c) => c.status === "GAP").length,
  };
}

export interface BacklogSummary {
  p0: number;
  p1: number;
  p2: number;
  total: number;
}

export function backlogSummary(): BacklogSummary {
  return {
    p0: backlogByPriority("P0").length,
    p1: backlogByPriority("P1").length,
    p2: backlogByPriority("P2").length,
    total: WAITER_INTELLIGENCE_BACKLOG.length,
  };
}
