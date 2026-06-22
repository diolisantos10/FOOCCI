/**
 * actionRecipes — pure mapping from a detected CRM opportunity (CrmAction) to a
 * ready-to-run campaign DRAFT (segment + on-brand message + schedule).
 *
 * This is the "decision → action" bridge of the Weekly Strategist. It is a pure
 * module (no DB, no side effects) so the agent's judgement is fully unit-testable.
 *
 * SCOPE GUARD (V1):
 *   - Only maps action types whose targetSegment `resolveAudience()` supports
 *     CORRECTLY. SEM_PEDIDOS / high-value / coupon have no precise audience case
 *     yet, so they are intentionally NOT auto-converted here.
 *   - Cold (FRIO, 61–120d) and lost (PERDIDO, 120+d) are split into two recipes
 *     with different message strength. The lost campaign runs an hour earlier so a
 *     lost customer gets the stronger win-back first; the cross-campaign 24h safety
 *     gate then prevents the cold nudge from re-hitting them the same day.
 *   - Alert-type actions (SAFETY_ISSUE_ALERT, CAMPAIGN_PERFORMANCE_ALERT) are not
 *     campaigns; the planner surfaces them as warnings instead.
 *   - Messages follow the CrmAgentProfile tone floor: human, ≤3 short paragraphs,
 *     ≤2 emojis, no spam, real placeholders only.
 */

import type { CrmAction, CrmActionType, ActionPriority } from "@/services/crm/CrmActionCenterService";

/** Exact shape ScheduledCampaignRunnerService reads from Campaign.scheduleConfig. */
export interface RecurringScheduleConfig {
  mode: "RECURRING";
  weekdays: number[]; // 0=Sunday … 6=Saturday
  timeWindow: { start: string; end: string }; // "HH:MM"
  dailyLimit: number;
  endCondition: "AUDIENCE_EXHAUSTED";
}

/** A campaign the agent proposes for one opportunity, before persistence. */
export interface PlanItemDraft {
  actionType: CrmActionType;
  title: string;
  rationale: string;
  targetSegment: string;
  templateId: string | null;
  objective: string | null;
  messageTemplate: string;
  priority: ActionPriority;
  estimatedAudience: number;
  estimatedRevenue: number;
  suggestedScheduleConfig: RecurringScheduleConfig;
}

const WEEKDAYS_BUSINESS = [1, 2, 3, 4, 5]; // Mon–Fri
const WEEKDAYS_ALL = [0, 1, 2, 3, 4, 5, 6];

interface Recipe {
  targetSegment: string;
  templateId: string;
  objective: string;
  message: string;
  weekdays: number[];
  timeWindow: { start: string; end: string };
  dailyLimit: number;
}

/**
 * One recipe per SUPPORTED action type. Messages use only placeholders the
 * personalizer understands: {nome} {restaurante} {link_cardapio}
 * {link_avaliacao_google} {nivel} {dias_sem_pedir} {ultimo_pedido}.
 */
const RECIPES: Partial<Record<CrmActionType, Recipe>> = {
  RECOVER_COLD_CUSTOMERS: {
    targetSegment: "FRIO",
    templateId: "recuperar-frios",
    objective: "RECUPERAR",
    message:
      "Oi, {nome} 😊 Faz um tempinho que você não pede com a gente — e a sua presença faz falta por aqui!\n\n" +
      "Preparei o cardápio com carinho pra te receber de volta. Dá uma olhada: {link_cardapio}",
    weekdays: WEEKDAYS_BUSINESS,
    timeWindow: { start: "11:00", end: "20:00" },
    dailyLimit: 25,
  },
  RECOVER_LOST_CUSTOMERS: {
    targetSegment: "PERDIDO",
    templateId: "recuperar-perdidos",
    objective: "RECUPERAR",
    message:
      "Oi, {nome} 💙 Faz um bom tempo que a gente não se vê por aqui — e a sua presença fez falta de verdade.\n\n" +
      "Separei o cardápio com carinho pra te receber de volta. Bora matar a saudade? {link_cardapio}",
    // Runs an hour earlier than the cold recovery so a lost customer gets the
    // stronger win-back first (the 24h cross-campaign gate then skips the cold nudge).
    weekdays: WEEKDAYS_BUSINESS,
    timeWindow: { start: "10:00", end: "20:00" },
    dailyLimit: 20,
  },
  WARM_CUSTOMERS: {
    targetSegment: "MORNO",
    templateId: "reativar-mornos",
    objective: "RECOMPRA",
    message:
      "Oi, {nome}! Bateu aquela vontade? 😋 Tem novidade fresquinha esperando por você no nosso cardápio.\n\n" +
      "É só escolher e pedir: {link_cardapio}",
    weekdays: WEEKDAYS_BUSINESS,
    timeWindow: { start: "11:00", end: "20:00" },
    dailyLimit: 30,
  },
  VIP_APPRECIATION: {
    targetSegment: "VIP",
    templateId: "clientes-vip",
    objective: "VIP",
    message:
      "{nome}, você é um dos nossos clientes favoritos 🙌 Obrigado de verdade por cada pedido — você faz parte da nossa casa.\n\n" +
      "Se precisar de algo especial, é só chamar por aqui.",
    weekdays: WEEKDAYS_BUSINESS,
    timeWindow: { start: "11:00", end: "20:00" },
    dailyLimit: 15,
  },
  BIRTHDAY_CAMPAIGN: {
    targetSegment: "ANIVERSARIANTES",
    templateId: "aniversariantes",
    objective: "OUTRO",
    message:
      "{nome}, passando pra te desejar um feliz aniversário! 🎉 Que seu dia seja delicioso.\n\n" +
      "Se quiser comemorar com a gente, é só pedir: {link_cardapio}",
    weekdays: WEEKDAYS_ALL,
    timeWindow: { start: "10:00", end: "20:00" },
    dailyLimit: 20,
  },
  REVIEW_REQUEST: {
    targetSegment: "RECENTE_AVALIACAO",
    templateId: "pedido-avaliacao",
    objective: "AVALIACAO",
    message:
      "Oi, {nome}! Tudo certo com seu último pedido? 🙏 Se puder, deixa uma avaliação rapidinha pra gente — ajuda demais.\n\n" +
      "É só por aqui: {link_avaliacao_google}",
    weekdays: WEEKDAYS_BUSINESS,
    timeWindow: { start: "11:00", end: "20:00" },
    dailyLimit: 20,
  },
};

/** Action types that are alerts, not campaigns — surfaced as plan warnings. */
export const ALERT_ACTION_TYPES: ReadonlySet<CrmActionType> = new Set<CrmActionType>([
  "SAFETY_ISSUE_ALERT",
  "CAMPAIGN_PERFORMANCE_ALERT",
]);

/**
 * Convert a single Action Center opportunity into a campaign draft.
 * Returns null when the action is not auto-convertible (unsupported segment,
 * zero eligible audience, alert type, or review with no link configured).
 */
export function buildPlanItemDraft(action: CrmAction): PlanItemDraft | null {
  const recipe = RECIPES[action.type];
  if (!recipe) return null;

  // No one safe to contact → nothing to propose.
  if (action.eligibleCount <= 0) return null;

  // Review requests need a configured review link; the Action Center signals this
  // by leaving recommendedCampaignType null when no Google/iFood link exists.
  if (action.type === "REVIEW_REQUEST" && action.recommendedCampaignType == null) {
    return null;
  }

  return {
    actionType: action.type,
    title: action.title,
    rationale: action.reason,
    targetSegment: recipe.targetSegment,
    templateId: recipe.templateId,
    objective: recipe.objective,
    messageTemplate: recipe.message,
    priority: action.priority,
    estimatedAudience: action.eligibleCount,
    estimatedRevenue: action.estimatedRevenueOpportunity,
    suggestedScheduleConfig: {
      mode: "RECURRING",
      weekdays: recipe.weekdays,
      timeWindow: recipe.timeWindow,
      dailyLimit: recipe.dailyLimit,
      endCondition: "AUDIENCE_EXHAUSTED",
    },
  };
}

/**
 * Map a ranked list of Action Center opportunities into campaign drafts.
 * Preserves the Action Center ordering (already priority/revenue ranked) and
 * drops anything not auto-convertible.
 */
export function buildPlanDrafts(actions: CrmAction[]): PlanItemDraft[] {
  const drafts: PlanItemDraft[] = [];
  for (const action of actions) {
    const draft = buildPlanItemDraft(action);
    if (draft) drafts.push(draft);
  }
  return drafts;
}
