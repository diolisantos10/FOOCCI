import { describe, it, expect } from "vitest";
import type { CrmAction, CrmActionType, ActionPriority } from "@/services/crm/CrmActionCenterService";
import { buildPlanItemDraft, buildPlanDrafts } from "./actionRecipes";
import {
  decidePlan,
  resolveAutonomyConfig,
  DEFAULT_AUTONOMY_CONFIG,
} from "./autonomyPolicy";

// ─── fixtures ────────────────────────────────────────────────────────────────

function action(
  type: CrmActionType,
  over: Partial<CrmAction> = {},
): CrmAction {
  return {
    id: `${type}-1`,
    type,
    title: `Ação ${type}`,
    description: "desc",
    priority: "MEDIUM" as ActionPriority,
    estimatedAudienceCount: 50,
    estimatedRevenueOpportunity: 800,
    safetyStatus: "READY",
    eligibleCount: 40,
    blockedCount: 0,
    blockerReasons: [],
    suggestedNextStep: "next",
    recommendedCampaignType: "recuperar-frios",
    linkedCustomerSample: [],
    reason: "porque sim",
    computedAt: new Date().toISOString(),
    ...over,
  };
}

// ─── actionRecipes ───────────────────────────────────────────────────────────

describe("buildPlanItemDraft — supported opportunities map to safe segments", () => {
  it("RECOVER_COLD_CUSTOMERS → FRIO recurring campaign draft", () => {
    const draft = buildPlanItemDraft(action("RECOVER_COLD_CUSTOMERS", { priority: "HIGH" }));
    expect(draft).not.toBeNull();
    expect(draft!.targetSegment).toBe("FRIO");
    expect(draft!.templateId).toBe("recuperar-frios");
    expect(draft!.priority).toBe("HIGH");
    expect(draft!.estimatedAudience).toBe(40); // eligibleCount, not estimatedAudienceCount
    expect(draft!.suggestedScheduleConfig.mode).toBe("RECURRING");
    expect(draft!.suggestedScheduleConfig.endCondition).toBe("AUDIENCE_EXHAUSTED");
    expect(draft!.messageTemplate).toContain("{nome}");
    expect(draft!.messageTemplate).toContain("{link_cardapio}");
  });

  it("WARM_CUSTOMERS → MORNO, VIP_APPRECIATION → VIP, BIRTHDAY → ANIVERSARIANTES", () => {
    expect(buildPlanItemDraft(action("WARM_CUSTOMERS"))!.targetSegment).toBe("MORNO");
    expect(buildPlanItemDraft(action("VIP_APPRECIATION"))!.targetSegment).toBe("VIP");
    expect(buildPlanItemDraft(action("BIRTHDAY_CAMPAIGN"))!.targetSegment).toBe("ANIVERSARIANTES");
  });

  it("BIRTHDAY runs every day; recovery runs business days only", () => {
    expect(buildPlanItemDraft(action("BIRTHDAY_CAMPAIGN"))!.suggestedScheduleConfig.weekdays)
      .toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(buildPlanItemDraft(action("RECOVER_COLD_CUSTOMERS"))!.suggestedScheduleConfig.weekdays)
      .toEqual([1, 2, 3, 4, 5]);
  });

  it("returns null when there is no eligible (contactable) audience", () => {
    expect(buildPlanItemDraft(action("RECOVER_COLD_CUSTOMERS", { eligibleCount: 0 }))).toBeNull();
  });

  it("does NOT convert unsupported segments (PERDIDO / SEM_PEDIDOS / high-value / coupon)", () => {
    expect(buildPlanItemDraft(action("RECOVER_LOST_CUSTOMERS"))).toBeNull();
    expect(buildPlanItemDraft(action("NO_ORDER_FIRST_PURCHASE"))).toBeNull();
    expect(buildPlanItemDraft(action("HIGH_VALUE_CUSTOMER_ATTENTION"))).toBeNull();
    expect(buildPlanItemDraft(action("COUPON_OPPORTUNITY"))).toBeNull();
  });

  it("REVIEW_REQUEST needs a configured review link (recommendedCampaignType present)", () => {
    expect(buildPlanItemDraft(action("REVIEW_REQUEST", { recommendedCampaignType: null }))).toBeNull();
    const ok = buildPlanItemDraft(action("REVIEW_REQUEST", { recommendedCampaignType: "solicitar-avaliacao" }));
    expect(ok).not.toBeNull();
    expect(ok!.targetSegment).toBe("RECENTE_AVALIACAO");
    expect(ok!.messageTemplate).toContain("{link_avaliacao_google}");
  });

  it("buildPlanDrafts drops alerts and unsupported, keeps order", () => {
    const drafts = buildPlanDrafts([
      action("SAFETY_ISSUE_ALERT"),
      action("RECOVER_COLD_CUSTOMERS", { priority: "HIGH" }),
      action("RECOVER_LOST_CUSTOMERS"),
      action("VIP_APPRECIATION"),
      action("CAMPAIGN_PERFORMANCE_ALERT"),
    ]);
    expect(drafts.map((d) => d.actionType)).toEqual([
      "RECOVER_COLD_CUSTOMERS",
      "VIP_APPRECIATION",
    ]);
  });
});

// ─── autonomyPolicy ──────────────────────────────────────────────────────────

describe("decidePlan — COPILOT", () => {
  it("proposes every item and waits for approval", () => {
    const drafts = buildPlanDrafts([
      action("RECOVER_COLD_CUSTOMERS", { priority: "HIGH" }),
      action("WARM_CUSTOMERS", { priority: "LOW" }),
    ]);
    const { decisions, planStatus, autoApprovedCount } = decidePlan(drafts, "COPILOT", {});
    expect(planStatus).toBe("PENDING_APPROVAL");
    expect(autoApprovedCount).toBe(0);
    expect(decisions.every((d) => d.status === "PROPOSED")).toBe(true);
  });
});

describe("decidePlan — AUTOPILOT guardrails", () => {
  it("auto-approves HIGH+MEDIUM, holds LOW (default minPriority MEDIUM) → PARTIALLY_APPROVED", () => {
    const drafts = buildPlanDrafts([
      action("RECOVER_COLD_CUSTOMERS", { priority: "HIGH" }),
      action("WARM_CUSTOMERS", { priority: "MEDIUM" }),
      action("VIP_APPRECIATION", { priority: "LOW" }),
    ]);
    const { decisions, planStatus, autoApprovedCount } = decidePlan(drafts, "AUTOPILOT", {});
    expect(autoApprovedCount).toBe(2);
    expect(planStatus).toBe("PARTIALLY_APPROVED");
    const low = decisions.find((d) => d.draft.priority === "LOW")!;
    expect(low.status).toBe("PROPOSED");
  });

  it("auto-approves everything when all clear the bar → APPROVED", () => {
    const drafts = buildPlanDrafts([
      action("RECOVER_COLD_CUSTOMERS", { priority: "HIGH" }),
      action("VIP_APPRECIATION", { priority: "HIGH" }),
    ]);
    const { planStatus, autoApprovedCount } = decidePlan(drafts, "AUTOPILOT", {});
    expect(autoApprovedCount).toBe(2);
    expect(planStatus).toBe("APPROVED");
  });

  it("weeklySendBudget stops auto-approval once exceeded", () => {
    const drafts = buildPlanDrafts([
      action("RECOVER_COLD_CUSTOMERS", { priority: "HIGH", eligibleCount: 80 }),
      action("WARM_CUSTOMERS", { priority: "HIGH", eligibleCount: 80 }),
    ]);
    const { decisions, autoApprovedCount } = decidePlan(drafts, "AUTOPILOT", { weeklySendBudget: 100 });
    expect(autoApprovedCount).toBe(1); // first fits (80), second would exceed 100
    expect(decisions[1].status).toBe("PROPOSED");
  });

  it("maxAudiencePerCampaign holds oversized items for human review", () => {
    const drafts = buildPlanDrafts([
      action("RECOVER_COLD_CUSTOMERS", { priority: "HIGH", eligibleCount: 300 }),
    ]);
    const { decisions } = decidePlan(drafts, "AUTOPILOT", { maxAudiencePerCampaign: 200 });
    expect(decisions[0].status).toBe("PROPOSED");
  });

  it("excludedActionTypes are dropped from the plan entirely", () => {
    const drafts = buildPlanDrafts([
      action("RECOVER_COLD_CUSTOMERS", { priority: "HIGH" }),
      action("VIP_APPRECIATION", { priority: "HIGH" }),
    ]);
    const { decisions } = decidePlan(drafts, "AUTOPILOT", {
      excludedActionTypes: ["VIP_APPRECIATION"],
    });
    expect(decisions.map((d) => d.draft.actionType)).toEqual(["RECOVER_COLD_CUSTOMERS"]);
  });

  it("allowedActionTypes restricts the plan to the whitelist", () => {
    const drafts = buildPlanDrafts([
      action("RECOVER_COLD_CUSTOMERS", { priority: "HIGH" }),
      action("VIP_APPRECIATION", { priority: "HIGH" }),
    ]);
    const { decisions } = decidePlan(drafts, "COPILOT", {
      allowedActionTypes: ["VIP_APPRECIATION"],
    });
    expect(decisions.map((d) => d.draft.actionType)).toEqual(["VIP_APPRECIATION"]);
  });
});

describe("resolveAutonomyConfig", () => {
  it("falls back to defaults for missing/invalid fields", () => {
    expect(resolveAutonomyConfig(null)).toEqual(DEFAULT_AUTONOMY_CONFIG);
    expect(resolveAutonomyConfig({ weeklySendBudget: -5 }).weeklySendBudget).toBe(0);
    expect(resolveAutonomyConfig({ autoApproveMinPriority: "BOGUS" }).autoApproveMinPriority).toBe("MEDIUM");
  });

  it("keeps valid overrides", () => {
    const c = resolveAutonomyConfig({ weeklySendBudget: 500, autoApproveMinPriority: "HIGH" });
    expect(c.weeklySendBudget).toBe(500);
    expect(c.autoApproveMinPriority).toBe("HIGH");
  });
});
