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
    "crm",
    "CRM Agent",
    "CRM",
    "Relacionamento outbound: campanhas, automações, recuperação. Placeholder.",
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
