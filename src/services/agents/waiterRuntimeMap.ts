/**
 * waiterRuntimeMap — structured, READ-ONLY documentation of the REAL Waiter
 * runtime, consumed by the Waiter Room (/admin/agents/waiter).
 *
 * This is a documentation overlay: strings + metadata only. It NEVER imports or
 * executes runtime code, and nothing here changes the Waiter's behavior. It
 * mirrors what actually ships today so the Room can show "this is the Waiter
 * that runs now" without duplicating prompts or large code.
 *
 * Keep in sync manually with the audit (RAIO-X). No prompts, no large code here.
 */

// ── shared enums ────────────────────────────────────────────────────────────────

export type WaiterTab =
  | "Dashboard"
  | "Perfil"
  | "Operação"
  | "Brain & Skills"
  | "Library"
  | "Runtime & Testes"
  | "Runtime Merge"
  | "Governança";

export type IntelligenceType = "DETERMINISTIC" | "LLM" | "HYBRID" | "UI" | "TEST" | "CONFIG";
export type ProductionStatus = "PRODUCTION" | "ADMIN_TOOL" | "NOT_RUNTIME";
export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";
export type CurrentStatus = "ACTIVE" | "LEGACY" | "PARTIAL" | "PLANNED" | "HARDCODED";
export type MergeStatus = "MIRRORED" | "NEEDS_REVIEW" | "NOT_CONNECTED" | "FUTURE";

export interface WaiterRuntimeComponent {
  title: string;
  description: string;
  filePath: string;
  category: string;
  tab: WaiterTab;
  productionStatus: ProductionStatus;
  intelligenceType: IntelligenceType;
  sourceOfTruth: boolean;
  riskLevel: RiskLevel;
  currentStatus: CurrentStatus;
  mergeStatus: MergeStatus;
  notes?: string;
}

// ── PT-BR labels (pure — UI consumes these) ─────────────────────────────────────

export const INTELLIGENCE_LABELS: Record<IntelligenceType, string> = {
  DETERMINISTIC: "Determinístico",
  LLM: "LLM",
  HYBRID: "Misto (det. + LLM)",
  UI: "UI",
  TEST: "Teste",
  CONFIG: "Configuração",
};

export const PRODUCTION_LABELS: Record<ProductionStatus, string> = {
  PRODUCTION: "Em produção",
  ADMIN_TOOL: "Ferramenta admin",
  NOT_RUNTIME: "Fora do runtime",
};

export const RISK_LABELS: Record<RiskLevel, string> = {
  LOW: "Baixo",
  MEDIUM: "Médio",
  HIGH: "Alto",
};

export const CURRENT_STATUS_LABELS: Record<CurrentStatus, string> = {
  ACTIVE: "Ativo",
  LEGACY: "Legado",
  PARTIAL: "Parcial",
  PLANNED: "Planejado",
  HARDCODED: "Hardcoded",
};

export const MERGE_STATUS_LABELS: Record<MergeStatus, string> = {
  MIRRORED: "Espelhado",
  NEEDS_REVIEW: "Revisar",
  NOT_CONNECTED: "Não conectado",
  FUTURE: "Futuro",
};

// ── headline components of the real Waiter ──────────────────────────────────────

export const WAITER_RUNTIME_COMPONENTS: readonly WaiterRuntimeComponent[] = [
  {
    title: "WaiterAgentProfile",
    description:
      "Constituição do agente: identidade, missão, responsabilidades, skills, princípios de venda, regras de cardápio e exemplos. buildWaiterProfileDirective() compila num bloco compacto de prompt.",
    filePath: "src/services/ai/waiter/WaiterAgentProfile.ts",
    category: "Constituição",
    tab: "Perfil",
    productionStatus: "PRODUCTION",
    intelligenceType: "CONFIG",
    sourceOfTruth: true,
    riskLevel: "HIGH",
    currentStatus: "HARDCODED",
    mergeStatus: "MIRRORED",
    notes: "Fonte da verdade da identidade. Hoje definida em código; futura edição via DB versionado.",
  },
  {
    title: "WaiterBrainV2",
    description:
      "Motor event-driven do web /pedido. Reage a eventos da UI (ON_ENTRY, ON_ITEM_ADDED, ON_CART_UPDATED…) e retorna { message, cards }. Produtos sempre via cards.",
    filePath: "src/services/ai/WaiterBrainV2.ts",
    category: "Motor (web)",
    tab: "Brain & Skills",
    productionStatus: "PRODUCTION",
    intelligenceType: "DETERMINISTIC",
    sourceOfTruth: true,
    riskLevel: "HIGH",
    currentStatus: "ACTIVE",
    mergeStatus: "MIRRORED",
  },
  {
    title: "WaiterBrain (v1)",
    description:
      "Camada de decisão por intenção do caminho WhatsApp (AIOrderService.processTurn). Funções puras que produzem um directive injetado no prompt.",
    filePath: "src/services/ai/WaiterBrain.ts",
    category: "Motor (WhatsApp)",
    tab: "Brain & Skills",
    productionStatus: "PRODUCTION",
    intelligenceType: "DETERMINISTIC",
    sourceOfTruth: false,
    riskLevel: "HIGH",
    currentStatus: "ACTIVE",
    mergeStatus: "MIRRORED",
  },
  {
    title: "resolveMenuIntent (menu matcher)",
    description:
      "Casa a fala do cliente com o cardápio real (grupo, porção, leve, orçamento…) sem palavra-chave literal. Base determinística da recomendação.",
    filePath: "src/services/ai/WaiterBrainV2.ts",
    category: "Menu matcher",
    tab: "Brain & Skills",
    productionStatus: "PRODUCTION",
    intelligenceType: "DETERMINISTIC",
    sourceOfTruth: false,
    riskLevel: "MEDIUM",
    currentStatus: "ACTIVE",
    mergeStatus: "MIRRORED",
  },
  {
    title: "UpsellEngine",
    description: "Seleciona candidatos de upsell (bebida/sobremesa/complemento) pontuados a partir do carrinho e do catálogo.",
    filePath: "src/services/ai/UpsellEngine.ts",
    category: "Upsell",
    tab: "Brain & Skills",
    productionStatus: "PRODUCTION",
    intelligenceType: "DETERMINISTIC",
    sourceOfTruth: false,
    riskLevel: "MEDIUM",
    currentStatus: "ACTIVE",
    mergeStatus: "MIRRORED",
  },
  {
    title: "PromptBuilderService",
    description:
      "Monta o array de mensagens OpenAI: identidade/marca, cardápio real com IDs e preços (âncora anti-alucinação), draft, cliente e regras de segurança.",
    filePath: "src/services/ai/PromptBuilderService.ts",
    category: "Prompt",
    tab: "Runtime & Testes",
    productionStatus: "PRODUCTION",
    intelligenceType: "DETERMINISTIC",
    sourceOfTruth: false,
    riskLevel: "HIGH",
    currentStatus: "ACTIVE",
    mergeStatus: "MIRRORED",
  },
  {
    title: "AIOrderService",
    description:
      "Orquestrador do turno: runWebTurn (web /pedido) e processTurn (WhatsApp). Injeta a constituição + diretivas, executa tool-calls (máx. 6), faz fallback/handoff e loga.",
    filePath: "src/services/ai/AIOrderService.ts",
    category: "Orquestrador",
    tab: "Operação",
    productionStatus: "PRODUCTION",
    intelligenceType: "HYBRID",
    sourceOfTruth: false,
    riskLevel: "HIGH",
    currentStatus: "ACTIVE",
    mergeStatus: "MIRRORED",
    notes: "LLM só redige texto curto; a decisão é determinística.",
  },
  {
    title: "/pedido (UI pública)",
    description:
      "A interface do cliente — o salão onde o Waiter trabalha. Cards, carrinho, variantes, adicionais, revisão; emite eventos para a API. Checkout/pagamento são da UI.",
    filePath: "src/app/pedido/[slug]/PedidoClient.tsx",
    category: "UI",
    tab: "Operação",
    productionStatus: "PRODUCTION",
    intelligenceType: "UI",
    sourceOfTruth: false,
    riskLevel: "HIGH",
    currentStatus: "ACTIVE",
    mergeStatus: "MIRRORED",
  },
  {
    title: "APIs do pedido",
    description:
      "POST /api/pedido/[slug] aciona runWebTurn (coração do runtime web). Sub-rotas: draft, finalize, delivery-quote, validate-coupon, identify-customer, repeat-order, payment.",
    filePath: "src/app/api/pedido/[slug]/route.ts",
    category: "API",
    tab: "Operação",
    productionStatus: "PRODUCTION",
    intelligenceType: "DETERMINISTIC",
    sourceOfTruth: false,
    riskLevel: "HIGH",
    currentStatus: "ACTIVE",
    mergeStatus: "MIRRORED",
  },
  {
    title: "Waiter Test Center",
    description:
      "Suíte determinística contra o catálogo real (waiterScenarios + waiterEvaluator). Sem OpenAI, sem gravar no banco, sem WhatsApp. Gera score de qualidade.",
    filePath: "src/app/api/admin/ai/waiter-tests/run/route.ts",
    category: "Teste",
    tab: "Runtime & Testes",
    productionStatus: "ADMIN_TOOL",
    intelligenceType: "TEST",
    sourceOfTruth: true,
    riskLevel: "LOW",
    currentStatus: "ACTIVE",
    mergeStatus: "MIRRORED",
  },
  {
    title: "Agent Library (formação)",
    description:
      "Fontes e técnicas curadas por agente (universidade privada). Data-only do admin: NÃO é lido pelo runtime e não altera nenhum prompt nesta fase.",
    filePath: "src/services/agentLibrary/AgentLibraryService.ts",
    category: "Library",
    tab: "Library",
    productionStatus: "NOT_RUNTIME",
    intelligenceType: "CONFIG",
    sourceOfTruth: false,
    riskLevel: "LOW",
    currentStatus: "PLANNED",
    mergeStatus: "NOT_CONNECTED",
    notes: "Formação técnica; conexão ao runtime só em fase futura, com flag/testes/versionamento.",
  },
];

// ── auxiliary services the orchestrator depends on ──────────────────────────────

export const WAITER_RUNTIME_SERVICES: readonly WaiterRuntimeComponent[] = [
  {
    title: "AITools",
    description: "Definições + executor de tool-calls (suggest_upsell, etc.) usadas pelo turno do LLM.",
    filePath: "src/services/ai/AITools.ts",
    category: "Tools",
    tab: "Runtime & Testes",
    productionStatus: "PRODUCTION",
    intelligenceType: "HYBRID",
    sourceOfTruth: false,
    riskLevel: "HIGH",
    currentStatus: "ACTIVE",
    mergeStatus: "MIRRORED",
  },
  {
    title: "ConversationGuardrails",
    description: "Limites de oferta (bebida/sobremesa uma vez, sem loop) e contagem de tentativas.",
    filePath: "src/services/ai/ConversationGuardrails.ts",
    category: "Guardrails",
    tab: "Runtime & Testes",
    productionStatus: "PRODUCTION",
    intelligenceType: "DETERMINISTIC",
    sourceOfTruth: false,
    riskLevel: "MEDIUM",
    currentStatus: "ACTIVE",
    mergeStatus: "MIRRORED",
  },
  {
    title: "BehaviorEngine",
    description: "Resolve limites de tokens e blocos de comportamento por turno.",
    filePath: "src/services/ai/BehaviorEngine.ts",
    category: "Comportamento",
    tab: "Runtime & Testes",
    productionStatus: "PRODUCTION",
    intelligenceType: "DETERMINISTIC",
    sourceOfTruth: false,
    riskLevel: "MEDIUM",
    currentStatus: "ACTIVE",
    mergeStatus: "MIRRORED",
  },
  {
    title: "SalesProfile",
    description: "Perfil de venda (metas/contexto comercial) usado na montagem do prompt.",
    filePath: "src/services/ai/SalesProfile.ts",
    category: "Venda",
    tab: "Runtime & Testes",
    productionStatus: "PRODUCTION",
    intelligenceType: "DETERMINISTIC",
    sourceOfTruth: false,
    riskLevel: "MEDIUM",
    currentStatus: "ACTIVE",
    mergeStatus: "MIRRORED",
  },
  {
    title: "bestSellers",
    description: "Ordena os cards por mais vendidos reais (cache por restaurante; fallback determinístico).",
    filePath: "src/services/ai/waiter/bestSellers.ts",
    category: "Ranking",
    tab: "Runtime & Testes",
    productionStatus: "PRODUCTION",
    intelligenceType: "DETERMINISTIC",
    sourceOfTruth: false,
    riskLevel: "LOW",
    currentStatus: "ACTIVE",
    mergeStatus: "MIRRORED",
  },
  {
    title: "BrandConfigService",
    description: "Lê RestaurantBrandConfig (voz da marca, modelo, parâmetros) por restaurante.",
    filePath: "src/services/ai/BrandConfigService.ts",
    category: "Config",
    tab: "Runtime & Testes",
    productionStatus: "PRODUCTION",
    intelligenceType: "CONFIG",
    sourceOfTruth: false,
    riskLevel: "MEDIUM",
    currentStatus: "ACTIVE",
    mergeStatus: "MIRRORED",
  },
];

// ── order flow (real, agent + UI) ───────────────────────────────────────────────

export const WAITER_RUNTIME_FLOWS: readonly string[] = [
  "Entrada do cliente (ON_ENTRY)",
  "Abertura do cardápio",
  "Navegação por categoria",
  "Produto / card",
  "Variantes",
  "Opções / adicionais",
  "Carrinho",
  "Revisão",
  "Upsell bebida",
  "Upsell sobremesa",
  "Promoção (opcional)",
  "Entrega / retirada",
  "Endereço",
  "Pagamento",
  "Conclusão",
];

// ── existing operational rules (positive language) ──────────────────────────────

export const WAITER_RUNTIME_RULES: readonly string[] = [
  "Usa apenas produtos reais do cardápio.",
  "Usa os preços oficiais do cardápio.",
  "Recomenda com base no contexto do cliente.",
  "Mantém mensagens curtas e objetivas.",
  "Prioriza card/clique em vez de texto longo.",
  "Avança o pedido sempre que possível (próximo passo claro).",
  "Usa bebida/sobremesa como oportunidade comercial contextual.",
  "Oferece o upsell uma vez e respeita a recusa.",
  "Respeita restrições alimentares e disponibilidade.",
  "Conduz à confirmação antes de finalizar; pagamento/entrega ficam com a UI.",
];

// ── Test Center groups (real) ───────────────────────────────────────────────────

export interface WaiterTestGroup {
  id: string;
  label: string;
  validates: string;
}

export const WAITER_RUNTIME_TEST_GROUPS: readonly WaiterTestGroup[] = [
  { id: "recommendation", label: "Recomendação", validates: "Sugere produtos reais relevantes ao pedido." },
  { id: "upsell_open", label: "Upsell", validates: "Oferece bebida/sobremesa contextual, sem loop." },
  { id: "restrictions", label: "Restrições", validates: "Respeita alergias/restrições alimentares." },
  { id: "checkout_guidance", label: "Condução ao checkout", validates: "Encaminha para revisão/finalização." },
  { id: "no_hallucination", label: "Sem alucinação", validates: "Nunca inventa produto/preço inexistente." },
  { id: "budget_intent", label: "Orçamento", validates: "Sugere bom custo-benefício quando há sinal de orçamento." },
  { id: "group_size", label: "Grupos / família", validates: "Prioriza combos/porções para grupos." },
  { id: "portion_category", label: "Porção / categoria", validates: "Entende 'porção'/'para X pessoas' como intenção." },
  { id: "light_intent", label: "Opção leve", validates: "Prioriza opções leves quando pedido." },
  { id: "consultative_close", label: "Fechamento consultivo", validates: "Termina com um próximo passo comercial." },
];

// ── gaps between "what the Waiter does" and "what the Room shows" ────────────────

export interface WaiterRuntimeGap {
  title: string;
  detail: string;
  mergeStatus: MergeStatus;
}

export const WAITER_RUNTIME_GAPS: readonly WaiterRuntimeGap[] = [
  { title: "KPIs sem telemetria", detail: "Os KPIs de performance ainda não têm fonte de dados real (seguem 'Aguardando tracking').", mergeStatus: "FUTURE" },
  { title: "Constituição × textos da sala", detail: "Parte do texto da Room é síntese manual; o ideal é derivar de WaiterAgentProfile para evitar divergência.", mergeStatus: "NEEDS_REVIEW" },
  { title: "Regras implícitas do WaiterBrainV2", detail: "Algumas regras vivem só no código do motor; trazê-las para a constituição facilita governança.", mergeStatus: "NEEDS_REVIEW" },
  { title: "Library fora do runtime", detail: "Técnicas da Library não influenciam o prompt; conexão só em fase futura com flag/testes.", mergeStatus: "NOT_CONNECTED" },
  { title: "Score de testes não exibido", detail: "O Test Center roda, mas o score não é carregado nesta tela.", mergeStatus: "FUTURE" },
];

// ── high-level merge status ─────────────────────────────────────────────────────

export interface MergeSummary {
  total: number;
  production: number;
  sourceOfTruth: number;
  mirrored: number;
  notConnected: number;
}

export function runtimeMergeSummary(): MergeSummary {
  const all = [...WAITER_RUNTIME_COMPONENTS, ...WAITER_RUNTIME_SERVICES];
  return {
    total: all.length,
    production: all.filter((c) => c.productionStatus === "PRODUCTION").length,
    sourceOfTruth: all.filter((c) => c.sourceOfTruth).length,
    mirrored: all.filter((c) => c.mergeStatus === "MIRRORED").length,
    notConnected: all.filter((c) => c.mergeStatus === "NOT_CONNECTED").length,
  };
}

/** All headline components whose home tab is `tab`. */
export function componentsForTab(tab: WaiterTab): WaiterRuntimeComponent[] {
  return WAITER_RUNTIME_COMPONENTS.filter((c) => c.tab === tab);
}
