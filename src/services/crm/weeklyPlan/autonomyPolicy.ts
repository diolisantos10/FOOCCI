/**
 * autonomyPolicy — pure decision logic for the Weekly Strategist.
 *
 * Given the campaign drafts the agent wants to propose plus the restaurant's
 * autonomy settings, decides — deterministically and testably — the initial
 * status of each item and of the plan as a whole:
 *
 *   • COPILOT  → every item is PROPOSED and waits for the lojista's approval.
 *   • AUTOPILOT → items that clear the guardrails are APPROVED automatically
 *                 (and later executed); the rest stay PROPOSED for human review.
 *
 * Guardrails (AUTOPILOT only):
 *   - autoApproveMinPriority — only auto-approve items at/above this priority.
 *   - maxAudiencePerCampaign — items bigger than this are held for human review.
 *   - weeklySendBudget       — stop auto-approving once the running audience total
 *                              would exceed the weekly budget.
 *   - allowed/excluded action types — scope which opportunities the agent may act on.
 */

import type { CrmActionType } from "@/services/crm/CrmActionCenterService";
import type { PlanItemDraft } from "./actionRecipes";

export type AutonomyMode = "COPILOT" | "AUTOPILOT";

export interface AutonomyConfig {
  /** 0 = no extra weekly cap beyond per-campaign safety. */
  weeklySendBudget: number;
  /** 0 = rely on the 500 hard cap in resolveAudience. */
  maxAudiencePerCampaign: number;
  /** null = every supported action type is allowed. */
  allowedActionTypes: CrmActionType[] | null;
  /** Action types the lojista never wants the agent to act on. */
  excludedActionTypes: CrmActionType[];
  /** AUTOPILOT auto-approves items at/above this priority; lower stays PROPOSED. */
  autoApproveMinPriority: "HIGH" | "MEDIUM" | "LOW";
}

export const DEFAULT_AUTONOMY_CONFIG: AutonomyConfig = {
  weeklySendBudget: 0,
  maxAudiencePerCampaign: 0,
  allowedActionTypes: null,
  excludedActionTypes: [],
  autoApproveMinPriority: "MEDIUM",
};

export type ItemInitialStatus = "PROPOSED" | "APPROVED";

export interface ItemDecision {
  draft: PlanItemDraft;
  status: ItemInitialStatus;
  /** Short human-readable note on why it was auto-approved or held. */
  note: string;
}

export type PlanInitialStatus =
  | "PENDING_APPROVAL"
  | "PARTIALLY_APPROVED"
  | "APPROVED";

export interface PlanDecision {
  decisions: ItemDecision[];
  planStatus: PlanInitialStatus;
  autoApprovedCount: number;
}

const PRIORITY_RANK: Record<"HIGH" | "MEDIUM" | "LOW", number> = {
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

/** Merge a partial (DB-stored) config onto the defaults. */
export function resolveAutonomyConfig(raw: unknown): AutonomyConfig {
  const c = (raw ?? {}) as Partial<AutonomyConfig>;
  return {
    weeklySendBudget:
      typeof c.weeklySendBudget === "number" && c.weeklySendBudget >= 0
        ? c.weeklySendBudget
        : DEFAULT_AUTONOMY_CONFIG.weeklySendBudget,
    maxAudiencePerCampaign:
      typeof c.maxAudiencePerCampaign === "number" && c.maxAudiencePerCampaign >= 0
        ? c.maxAudiencePerCampaign
        : DEFAULT_AUTONOMY_CONFIG.maxAudiencePerCampaign,
    allowedActionTypes: Array.isArray(c.allowedActionTypes)
      ? (c.allowedActionTypes as CrmActionType[])
      : DEFAULT_AUTONOMY_CONFIG.allowedActionTypes,
    excludedActionTypes: Array.isArray(c.excludedActionTypes)
      ? (c.excludedActionTypes as CrmActionType[])
      : DEFAULT_AUTONOMY_CONFIG.excludedActionTypes,
    autoApproveMinPriority:
      c.autoApproveMinPriority === "HIGH" ||
      c.autoApproveMinPriority === "MEDIUM" ||
      c.autoApproveMinPriority === "LOW"
        ? c.autoApproveMinPriority
        : DEFAULT_AUTONOMY_CONFIG.autoApproveMinPriority,
  };
}

/** True when the action type is allowed by the scope config. */
function isActionTypeAllowed(type: CrmActionType, config: AutonomyConfig): boolean {
  if (config.excludedActionTypes.includes(type)) return false;
  if (config.allowedActionTypes && !config.allowedActionTypes.includes(type)) {
    return false;
  }
  return true;
}

/**
 * Decide the initial status of each draft and the plan.
 * Drafts excluded by scope are dropped entirely (never reach the plan).
 */
export function decidePlan(
  drafts: PlanItemDraft[],
  mode: AutonomyMode,
  rawConfig: unknown,
): PlanDecision {
  const config = resolveAutonomyConfig(rawConfig);
  const inScope = drafts.filter((d) => isActionTypeAllowed(d.actionType, config));

  const decisions: ItemDecision[] = [];
  let runningAudience = 0;
  let autoApprovedCount = 0;

  for (const draft of inScope) {
    // COPILOT: never auto-approve.
    if (mode === "COPILOT") {
      decisions.push({ draft, status: "PROPOSED", note: "Aguardando sua aprovação." });
      continue;
    }

    // AUTOPILOT: evaluate guardrails.
    const meetsPriority =
      PRIORITY_RANK[draft.priority] >= PRIORITY_RANK[config.autoApproveMinPriority];
    const withinPerCampaign =
      config.maxAudiencePerCampaign === 0 ||
      draft.estimatedAudience <= config.maxAudiencePerCampaign;
    const withinBudget =
      config.weeklySendBudget === 0 ||
      runningAudience + draft.estimatedAudience <= config.weeklySendBudget;

    if (meetsPriority && withinPerCampaign && withinBudget) {
      runningAudience += draft.estimatedAudience;
      autoApprovedCount += 1;
      decisions.push({
        draft,
        status: "APPROVED",
        note: "Aprovado automaticamente (autopilot, dentro dos limites).",
      });
    } else {
      const why = !meetsPriority
        ? "prioridade abaixo do limite de autopilot"
        : !withinPerCampaign
          ? "audiência acima do teto por campanha"
          : "orçamento semanal de envios atingido";
      decisions.push({
        draft,
        status: "PROPOSED",
        note: `Retido para sua aprovação (${why}).`,
      });
    }
  }

  let planStatus: PlanInitialStatus;
  if (autoApprovedCount === 0) {
    planStatus = "PENDING_APPROVAL";
  } else if (autoApprovedCount === decisions.length) {
    planStatus = "APPROVED";
  } else {
    planStatus = "PARTIALLY_APPROVED";
  }

  return { decisions, planStatus, autoApprovedCount };
}
