/**
 * defaultAgentProfiles — the code-defined registry of Foocci AI agents (Phase 1).
 *
 * This is the canonical, version-controlled source for every agent profile.
 * It is what gets SEEDED into the `agent_profiles` table, and it remains the
 * fallback even after the Admin → Agents UI exists. The database never becomes
 * the sole source of truth: code wins on conflict until a deliberate Phase 3
 * decision flips that.
 *
 * Only the WAITER agent carries rich content today — and it is NOT re-authored
 * here. It is derived from the existing constitution at
 *   src/services/ai/waiter/WaiterAgentProfile.ts
 * so there is a single place to edit the Waiter's identity (no prompt blob
 * duplication, no drift).
 *
 * The remaining agents are intentional DRAFT placeholders (registry slots) so
 * the future Admin UI can render the full org chart of agents immediately. They
 * will be fleshed out in later phases.
 */

import {
  WAITER_AGENT_PROFILE,
  buildWaiterProfileDirective,
} from "@/services/ai/waiter/WaiterAgentProfile";
import {
  CRM_AGENT_PROFILE,
  buildCrmProfileDirective,
} from "@/services/crm/CrmAgentProfile";
import type { AgentProfileDefinition } from "./types";

// ── WAITER (rich) — derived from the existing constitution ──────────────────────

const WAITER_PROFILE: AgentProfileDefinition = {
  slug: "waiter",
  name: "Waiter Agent",
  title: "Garçom digital e especialista de vendas",
  area: "WAITER",
  description:
    "Garçom/vendedor digital que opera dentro da experiência de pedido (/pedido). " +
    "Lê o cardápio como inventário de vendas, entende intenção real do cliente, " +
    "recomenda produtos reais e conduz até a finalização.",

  mission: WAITER_AGENT_PROFILE.mission,
  objectives: [...WAITER_AGENT_PROFILE.objectives],
  responsibilities: [...WAITER_AGENT_PROFILE.responsibilities],
  skills: [...WAITER_AGENT_PROFILE.skills],
  allowedActions: [...WAITER_AGENT_PROFILE.boundaries.canDo],
  // INTERNAL ONLY — hard safety boundaries.
  forbiddenActions: [...WAITER_AGENT_PROFILE.boundaries.cannotDo],
  tools: ["suggest_upsell", "show_cards", "transfer_to_human"],
  knowledgeAreas: [
    "Cardápio do restaurante (itens, preços, categorias, promoções)",
    "Enriquecimento de IA por item (perfil de paladar, harmonização, alérgenos)",
    "Tamanho de grupo / porções / combos",
  ],
  interfaceContext:
    "A interface Foocci é o salão do restaurante; o cardápio/cards são os produtos " +
    "disponíveis; o carrinho é a comanda; o checkout é o caixa. O Waiter usa cards e " +
    "ferramentas para servir e vender — nunca altera a interface, preços ou regras.",
  businessRules: [
    ...WAITER_AGENT_PROFILE.salesPrinciples,
    ...WAITER_AGENT_PROFILE.menuReadingRules,
    ...WAITER_AGENT_PROFILE.consultativeProbingRules,
    ...WAITER_AGENT_PROFILE.groupSizeRules,
    ...WAITER_AGENT_PROFILE.lightHeavyRules,
    ...WAITER_AGENT_PROFILE.budgetRules,
    ...WAITER_AGENT_PROFILE.upsellRules,
    ...WAITER_AGENT_PROFILE.closingRules,
  ],
  // INTERNAL ONLY — the immutable safety floor (mirror of code constant).
  safetyRules: [...WAITER_AGENT_PROFILE.safetyBoundaries],
  escalationRules: [...WAITER_AGENT_PROFILE.failureHandling],
  promptInstructions: buildWaiterProfileDirective(),
  outputRules: [...WAITER_AGENT_PROFILE.toolUsageRules],
  evaluationCriteria: [
    "Nunca inventa produtos, preços ou promoções.",
    "Interpreta intenção (grupo/leve/orçamento) em vez de busca literal.",
    "Recomenda apenas itens reais do cardápio via cards.",
    "Faz no máximo UMA pergunta de qualificação quando falta contexto.",
    "Respeita recusas e restrições/alergias.",
    "Conduz o cliente em direção à finalização.",
  ],

  // Rich, Waiter-specific sections kept as JSON (no dedicated columns yet).
  extendedSections: {
    salesPrinciples: WAITER_AGENT_PROFILE.salesPrinciples,
    menuReadingRules: WAITER_AGENT_PROFILE.menuReadingRules,
    consultativeProbingRules: WAITER_AGENT_PROFILE.consultativeProbingRules,
    groupSizeRules: WAITER_AGENT_PROFILE.groupSizeRules,
    lightHeavyRules: WAITER_AGENT_PROFILE.lightHeavyRules,
    budgetRules: WAITER_AGENT_PROFILE.budgetRules,
    upsellRules: WAITER_AGENT_PROFILE.upsellRules,
    closingRules: WAITER_AGENT_PROFILE.closingRules,
    toolUsageRules: WAITER_AGENT_PROFILE.toolUsageRules,
    failureHandling: WAITER_AGENT_PROFILE.failureHandling,
    examples: WAITER_AGENT_PROFILE.examples,
  },

  status: "ACTIVE",
  visibility: "INTERNAL",
  isGlobalDefault: true,
  // Phase 1: DB runtime is OFF. The live Waiter still reads the code constitution.
  isRuntimeEnabled: false,
  version: "1.0",
  source: "CODE_SEED",
};

// ── Placeholder agents (DRAFT registry slots) ───────────────────────────────────

/** Build a minimal DRAFT placeholder so the Admin UI can list every agent. */
function placeholder(
  slug: string,
  name: string,
  area: AgentProfileDefinition["area"],
  description: string,
): AgentProfileDefinition {
  return {
    slug,
    name,
    area,
    description,
    objectives: [],
    responsibilities: [],
    skills: [],
    allowedActions: [],
    forbiddenActions: [],
    tools: [],
    knowledgeAreas: [],
    businessRules: [],
    safetyRules: [],
    escalationRules: [],
    outputRules: [],
    evaluationCriteria: [],
    status: "DRAFT",
    visibility: "INTERNAL",
    isGlobalDefault: true,
    isRuntimeEnabled: false,
    version: "0.1",
    source: "CODE_SEED",
  };
}

// ── CRM Agent (rich) — derived from CrmAgentProfile constitution ────────────────

const CRM_PROFILE: AgentProfileDefinition = {
  slug: "crm",
  name: "CRM Agent",
  title: "Gerente de relacionamento e estrategista de retenção",
  area: "CRM",
  description:
    "Gerente de relacionamento outbound que opera via WhatsApp de forma discreta, " +
    "útil e humana. Reativa clientes inativos, recompensa VIPs e recupera quem está " +
    "em risco — baseando cada mensagem em dados reais, nunca em invenções.",

  mission: CRM_AGENT_PROFILE.mission,
  objectives: [...CRM_AGENT_PROFILE.objectives],
  responsibilities: [...CRM_AGENT_PROFILE.responsibilities],
  skills: [...CRM_AGENT_PROFILE.skills],
  allowedActions: [...CRM_AGENT_PROFILE.boundaries.canDo],
  // INTERNAL ONLY — hard safety floor: inviolável mesmo antes da implementação.
  forbiddenActions: [...CRM_AGENT_PROFILE.boundaries.cannotDo],
  tools: ["send_whatsapp_message", "log_campaign_send", "escalate_to_human"],
  knowledgeAreas: [
    "Segmentos RFM do cliente (HOT/WARM/COLD/VIP/CHAMPION)",
    "Histórico real de pedidos (totalOrders, totalSpend, lastOrderAt)",
    "Cupons e promoções configurados pelo operador no sistema",
    "Configurações de segurança WhatsApp (cooldown, cap, quiet hours)",
    "Regras de opt-out e compliance LGPD",
  ],
  interfaceContext:
    "O CRM Agent opera exclusivamente no canal WhatsApp outbound. " +
    "Não tem acesso à interface /pedido, ao checkout ou ao cardápio em tempo real. " +
    "Trabalha com segmentos pré-calculados e dados reais de Customer/Order.",
  businessRules: [
    ...CRM_AGENT_PROFILE.relationshipPrinciples,
    ...CRM_AGENT_PROFILE.campaignStrategyRules,
    ...CRM_AGENT_PROFILE.personalizationRules,
    ...CRM_AGENT_PROFILE.couponAndOfferRules,
    ...CRM_AGENT_PROFILE.reviewRequestRules,
    ...CRM_AGENT_PROFILE.metricsAndAttributionRules,
    ...CRM_AGENT_PROFILE.messageToneRules,
  ],
  // INTERNAL ONLY — piso de segurança (mirror das constantes de código).
  safetyRules: [...CRM_AGENT_PROFILE.whatsAppSafetyRules, ...CRM_AGENT_PROFILE.antiSpamRules],
  escalationRules: [...CRM_AGENT_PROFILE.failureHandling],
  promptInstructions: buildCrmProfileDirective(),
  outputRules: [...CRM_AGENT_PROFILE.antiSpamRules],
  evaluationCriteria: [
    "Nunca inventa ofertas, cupons ou fatos do cliente.",
    "Usa apenas dados reais (totalOrders, totalSpend, lastOrderAt).",
    "Respeita opt-out, cooldown, cap diário e weekly antes de qualquer envio.",
    "Tom humano e caloroso — nunca spam ou corporativês frio.",
    "Só pede review para clientes HOT com pedido recente (<7 dias).",
    "Registra envio, skip e falha para atribuição e diagnóstico.",
  ],

  // Rich CRM-specific sections kept as JSON (sem colunas dedicadas ainda).
  extendedSections: {
    relationshipPrinciples: CRM_AGENT_PROFILE.relationshipPrinciples,
    campaignStrategyRules: CRM_AGENT_PROFILE.campaignStrategyRules,
    personalizationRules: CRM_AGENT_PROFILE.personalizationRules,
    whatsAppSafetyRules: CRM_AGENT_PROFILE.whatsAppSafetyRules,
    antiSpamRules: CRM_AGENT_PROFILE.antiSpamRules,
    customerIntelligenceRules: CRM_AGENT_PROFILE.customerIntelligenceRules,
    couponAndOfferRules: CRM_AGENT_PROFILE.couponAndOfferRules,
    reviewRequestRules: CRM_AGENT_PROFILE.reviewRequestRules,
    metricsAndAttributionRules: CRM_AGENT_PROFILE.metricsAndAttributionRules,
    messageToneRules: CRM_AGENT_PROFILE.messageToneRules,
    failureHandling: CRM_AGENT_PROFILE.failureHandling,
    examples: CRM_AGENT_PROFILE.examples,
  },

  status: "ACTIVE",
  visibility: "INTERNAL",
  isGlobalDefault: true,
  // Phase 1: DB runtime is OFF. Real sends still use hard-coded paths.
  isRuntimeEnabled: false,
  version: "1.0",
  source: "CODE_SEED",
};

const PLACEHOLDER_PROFILES: AgentProfileDefinition[] = [
  placeholder(
    "orchestrator",
    "Orchestrator / Manager Agent",
    "ORCHESTRATOR",
    "Coordena os demais agentes, roteia conversas e arbitra prioridades. Placeholder.",
  ),
  placeholder(
    "security-governance",
    "Security & Governance Agent",
    "SECURITY",
    "Guardião das regras de segurança, limites e governança. Mandatório. Placeholder.",
  ),
  placeholder(
    "whatsapp",
    "WhatsApp Agent",
    "WHATSAPP",
    "Recepcionista de entrada no WhatsApp: triagem, Q&A simples, handoff. Placeholder.",
  ),
  placeholder(
    "ui-ux",
    "UI/UX Agent",
    "UI_UX",
    "Cuida de coerência de interface e experiência. Placeholder.",
  ),
  placeholder(
    "manual-constitution",
    "Manual / Constitution Agent",
    "MANUAL",
    "Mantém o Manual Operacional (a constituição) como fonte de verdade. Placeholder.",
  ),
  placeholder(
    "qa-test",
    "QA / Test Agent",
    "QA",
    "Avaliação e testes dos agentes (Phase 5). Placeholder.",
  ),
  placeholder(
    "integration",
    "Integration Agent",
    "INTEGRATION",
    "Integrações com PDV/pagamentos/entrega. Placeholder.",
  ),
  placeholder(
    "branding",
    "Branding Agent",
    "BRANDING",
    "Voz e identidade de marca. Placeholder.",
  ),
  placeholder(
    "analytics-product",
    "Analytics / Product Agent",
    "ANALYTICS",
    "Insights comerciais e de produto para o dono do restaurante. Placeholder.",
  ),
];

/**
 * The complete code-defined agent registry. Waiter first (rich), then the
 * DRAFT placeholders. This array is the seed payload and the canonical fallback.
 */
export const DEFAULT_AGENT_PROFILES: readonly AgentProfileDefinition[] = [
  WAITER_PROFILE,
  CRM_PROFILE,
  ...PLACEHOLDER_PROFILES,
] as const;

/** Convenience: the Waiter default profile (richest, the Phase-1 priority). */
export const WAITER_DEFAULT_PROFILE = WAITER_PROFILE;

/** Look up a code-defined default profile by slug. */
export function getDefaultAgentProfileBySlug(
  slug: string,
): AgentProfileDefinition | undefined {
  return DEFAULT_AGENT_PROFILES.find((p) => p.slug === slug);
}
