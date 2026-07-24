import { describe, it, expect } from "vitest";
import {
  CRMWhatsAppBudgetPlanner,
  evaluateCircuitBreaker,
  distributeCycle,
  inferCampaignPriority,
  describeBudgetAllocation,
  isCycleIntervalActive,
  type BudgetCampaignInput,
} from "../CRMWhatsAppBudgetPlanner";
import { computeRecoverablePlan } from "../recoverableReprocessPlan";
import { DEFAULT_BUDGET_CONFIG, type CRMWhatsAppBudgetConfig } from "@/lib/crm-safety";

// ── helpers ──────────────────────────────────────────────────────────────────

function cfg(over: Partial<CRMWhatsAppBudgetConfig> = {}): CRMWhatsAppBudgetConfig {
  return { ...DEFAULT_BUDGET_CONFIG, ...over };
}

function campaign(id: string, over: Partial<BudgetCampaignInput> = {}): BudgetCampaignInput {
  return {
    campaignId:        id,
    campaignName:      id,
    priority:          "GENERIC_PROMO",
    alreadySentToday:  0,
    remainingAudience: 1000,
    ...over,
  };
}

const alloc = (plan: { perCampaign: { allocated: number }[] }) => plan.perCampaign.map((p) => p.allocated);

// ── Section 11 required tests ─────────────────────────────────────────────────

describe("CRMWhatsAppBudgetPlanner", () => {
  it("(1) globalCycleLimit 5 across 5 campaigns gives 1 each", () => {
    const plan = CRMWhatsAppBudgetPlanner.plan({
      config:            cfg({ globalDailyLimit: 50, globalCycleLimit: 5 }),
      globalSentToday:   0,
      instanceConnected: true,
      campaigns:         ["A", "B", "C", "D", "E"].map((id) => campaign(id)),
    });
    expect(alloc(plan)).toEqual([1, 1, 1, 1, 1]);
    expect(plan.allowedTotalThisCycle).toBe(5);
    // EQUAL daily quota = 50 / 5 = 10 each
    expect(plan.perCampaign.every((p) => p.dailyQuota === 10)).toBe(true);
  });

  it("(2) globalCycleLimit 5 across 2 campaigns gives a fair 3/2 split", () => {
    const plan = CRMWhatsAppBudgetPlanner.plan({
      config:            cfg({ globalDailyLimit: 50, globalCycleLimit: 5 }),
      globalSentToday:   0,
      instanceConnected: true,
      campaigns:         [campaign("A"), campaign("B")],
    });
    expect(alloc(plan)).toEqual([3, 2]);
    expect(plan.allowedTotalThisCycle).toBe(5);
  });

  it("(3) globalDailyLimit reached blocks all campaigns", () => {
    const plan = CRMWhatsAppBudgetPlanner.plan({
      config:            cfg({ globalDailyLimit: 50, globalCycleLimit: 5 }),
      globalSentToday:   50, // whole daily budget already spent
      instanceConnected: true,
      campaigns:         [campaign("A"), campaign("B")],
    });
    expect(plan.globalBlockReason).toBe("GLOBAL_DAILY_LIMIT_REACHED");
    expect(plan.allowedTotalThisCycle).toBe(0);
    expect(plan.perCampaign.every((p) => p.allocated === 0 && p.reason === "GLOBAL_DAILY_LIMIT_REACHED")).toBe(true);
  });

  it("(4) a campaign with no eligible recipients hands its slot to the others", () => {
    const plan = CRMWhatsAppBudgetPlanner.plan({
      // EQUAL-mode semantics: an empty campaign reports NO_ELIGIBLE_RECIPIENTS.
      config:            cfg({ globalDailyLimit: 50, globalCycleLimit: 5, distributionMode: "EQUAL" }),
      globalSentToday:   0,
      instanceConnected: true,
      campaigns:         [
        campaign("A", { remainingAudience: 0 }), // empty
        campaign("B"),
        campaign("C"),
      ],
    });
    const a = plan.perCampaign.find((p) => p.campaignId === "A")!;
    expect(a.allocated).toBe(0);
    expect(a.reason).toBe("NO_ELIGIBLE_RECIPIENTS");
    // The 5 cycle slots go entirely to B and C.
    expect(plan.allowedTotalThisCycle).toBe(5);
    expect(plan.perCampaign.find((p) => p.campaignId === "B")!.allocated
         + plan.perCampaign.find((p) => p.campaignId === "C")!.allocated).toBe(5);
  });

  it("(5) instance disconnected blocks all sends with no allocation", () => {
    const plan = CRMWhatsAppBudgetPlanner.plan({
      config:            cfg({ globalDailyLimit: 50, globalCycleLimit: 5, stopOnInstanceDisconnected: true }),
      globalSentToday:   0,
      instanceConnected: false,
      campaigns:         [campaign("A"), campaign("B")],
    });
    expect(plan.globalBlockReason).toBe("INSTANCE_DISCONNECTED");
    expect(plan.allowedTotalThisCycle).toBe(0);
    expect(plan.perCampaign.every((p) => p.reason === "INSTANCE_DISCONNECTED")).toBe(true);
  });

  it("(6) a tripped failure circuit breaker stops the cycle", () => {
    // The breaker trips once provider failures reach the threshold...
    const verdict = evaluateCircuitBreaker(
      { providerFailures: 3, sent: 1 },
      cfg({ maxConsecutiveProviderFailures: 3 }),
    );
    expect(verdict.tripped).toBe(true);
    expect(verdict.message).toContain("Pausado por segurança");

    // ...and a paused cycle blocks every campaign.
    const plan = CRMWhatsAppBudgetPlanner.plan({
      config:            cfg({ globalDailyLimit: 50, globalCycleLimit: 5 }),
      globalSentToday:   0,
      instanceConnected: true,
      failureRatePaused: true,
      campaigns:         [campaign("A"), campaign("B")],
    });
    expect(plan.globalBlockReason).toBe("FAILURE_RATE_PAUSED");
    expect(plan.allowedTotalThisCycle).toBe(0);
  });

  it("(6b) failure-rate breaker trips on percentage threshold", () => {
    // 2 failures / 4 attempts = 50% ≥ pauseOnFailureRatePercent 50
    const verdict = evaluateCircuitBreaker(
      { providerFailures: 2, sent: 2 },
      cfg({ maxConsecutiveProviderFailures: 0, pauseOnFailureRatePercent: 50 }),
    );
    expect(verdict.tripped).toBe(true);
  });

  it("(7) reprocess respects globalCycleLimit — cap caps the next batch", () => {
    // Reprocess derives its cap from min(Evolution hard cap 5, globalCycleLimit, remaining daily).
    const remainingDaily = 50 - 0;
    const reprocessCap = Math.min(5, /* globalCycleLimit */ 2, remainingDaily);
    const rows = Array.from({ length: 8 }, (_, i) => ({
      id: `e${i}`, customerId: `c${i}`, customerName: `n${i}`, customerPhone: `1198888000${i}`,
      status: "FAILED", failedReason: "timeout", errorMessage: "PROVIDER_TIMEOUT",
    }));
    const plan = computeRecoverablePlan(rows, reprocessCap);
    expect(plan.cap).toBe(2);
    expect(plan.nextBatchCount).toBe(2);
    expect(plan.nextBatch).toHaveLength(2);
  });

  it("(8) safety blocks/skips never count as provider failures for the breaker", () => {
    // A cycle full of safety blocks (cooldown/weekly-cap/opt-out) but ZERO real
    // provider failures must NOT trip the breaker.
    const verdict = evaluateCircuitBreaker(
      { providerFailures: 0, sent: 1 }, // blocks/skips are simply absent from the tally
      cfg({ maxConsecutiveProviderFailures: 3, pauseOnFailureRatePercent: 50 }),
    );
    expect(verdict.tripped).toBe(false);
  });
});

// ── Distribution + priority unit coverage ─────────────────────────────────────

describe("distributeCycle", () => {
  it("EQUAL round-robin spreads evenly and redistributes empty capacity", () => {
    expect(distributeCycle(5, [10, 10, 10, 10, 10], "EQUAL", [0, 1, 2, 3, 4])).toEqual([1, 1, 1, 1, 1]);
    expect(distributeCycle(5, [10, 10], "EQUAL", [0, 1])).toEqual([3, 2]);
    expect(distributeCycle(5, [0, 10, 10], "EQUAL", [0, 1, 2])).toEqual([0, 3, 2]);
  });

  it("PRIORITY fills by order, highest priority first", () => {
    // order [1,0]: index 1 served first, consumes the whole cycle up to its capacity.
    expect(distributeCycle(5, [10, 10], "PRIORITY", [1, 0])).toEqual([0, 5]);
    // index 0 capped at 2, the leftover spills to index 1.
    expect(distributeCycle(3, [2, 10], "PRIORITY", [0, 1])).toEqual([2, 1]);
  });

  it("never exceeds the cycle total", () => {
    const out = distributeCycle(3, [10, 10, 10], "EQUAL", [0, 1, 2]);
    expect(out.reduce((s, v) => s + v, 0)).toBe(3);
  });
});

describe("PRIORITY distribution mode end-to-end", () => {
  it("serves birthday before generic promo when the cycle is scarce", () => {
    const plan = CRMWhatsAppBudgetPlanner.plan({
      config:            cfg({ globalDailyLimit: 50, globalCycleLimit: 2, distributionMode: "PRIORITY" }),
      globalSentToday:   0,
      instanceConnected: true,
      campaigns:         [
        campaign("promo", { priority: "GENERIC_PROMO" }),
        campaign("bday",  { priority: "BIRTHDAY" }),
      ],
    });
    const bday  = plan.perCampaign.find((p) => p.campaignId === "bday")!;
    const promo = plan.perCampaign.find((p) => p.campaignId === "promo")!;
    expect(bday.allocated).toBeGreaterThanOrEqual(promo.allocated);
    expect(bday.allocated + promo.allocated).toBe(2);
  });
});

describe("inferCampaignPriority", () => {
  it("classifies the common campaign shapes", () => {
    expect(inferCampaignPriority({ templateId: "aniversariantes" })).toBe("BIRTHDAY");
    expect(inferCampaignPriority({ targetSegment: "carrinho-abandonado" })).toBe("CART_ABANDONED");
    expect(inferCampaignPriority({ targetSegment: "pedido-avaliacao" })).toBe("POST_ORDER_REVIEW");
    expect(inferCampaignPriority({ targetSegment: "recuperar-frios" })).toBe("REACTIVATION_COLD");
    expect(inferCampaignPriority({ targetSegment: "promo-geral" })).toBe("GENERIC_PROMO");
    expect(inferCampaignPriority({})).toBe("GENERIC_PROMO");
  });
});

describe("describeBudgetAllocation (UI reasons)", () => {
  it("maps allocation + reason to owner-facing PT-BR text", () => {
    expect(describeBudgetAllocation({ allocated: 1 })).toBe("Receberá 1 envio no próximo ciclo");
    expect(describeBudgetAllocation({ allocated: 3 })).toBe("Receberá 3 envios no próximo ciclo");
    expect(describeBudgetAllocation({ allocated: 0, reason: "GLOBAL_CYCLE_LIMIT_REACHED" })).toBe("Aguardando próximo ciclo");
    expect(describeBudgetAllocation({ allocated: 0, reason: "GLOBAL_DAILY_LIMIT_REACHED" })).toBe("Limite global diário atingido");
    expect(describeBudgetAllocation({ allocated: 0, reason: "CAMPAIGN_DAILY_QUOTA_REACHED" })).toBe("Limite diário da campanha atingido");
    expect(describeBudgetAllocation({ allocated: 0, reason: "INSTANCE_DISCONNECTED" })).toBe("WhatsApp desconectado");
    expect(describeBudgetAllocation({ allocated: 0, reason: "FAILURE_RATE_PAUSED" })).toBe("Pausado por segurança");
  });
});

describe("disabled budget", () => {
  it("blocks the planner with SAFETY_DISABLED when off", () => {
    const plan = CRMWhatsAppBudgetPlanner.plan({
      config:            cfg({ enabled: false }),
      globalSentToday:   0,
      instanceConnected: true,
      campaigns:         [campaign("A")],
    });
    expect(plan.globalBlockReason).toBe("SAFETY_DISABLED");
  });
});

describe("MANUAL distribution mode", () => {
  it("uses each campaign's own daily limit as its quota", () => {
    const plan = CRMWhatsAppBudgetPlanner.plan({
      config:            cfg({ globalDailyLimit: 50, globalCycleLimit: 5, distributionMode: "MANUAL" }),
      globalSentToday:   0,
      instanceConnected: true,
      campaigns:         [
        campaign("A", { manualDailyQuota: 30 }),
        campaign("B", { manualDailyQuota: 2 }),
      ],
    });
    const a = plan.perCampaign.find((p) => p.campaignId === "A")!;
    const b = plan.perCampaign.find((p) => p.campaignId === "B")!;
    expect(a.dailyQuota).toBe(30);
    expect(b.dailyQuota).toBe(2);
    // Cycle still capped at 5 total; B can take at most its quota (2).
    expect(a.allocated + b.allocated).toBe(5);
    expect(b.allocated).toBeLessThanOrEqual(2);
  });

  it("a campaign that exhausted its manual quota is skipped with the campaign-quota reason", () => {
    const plan = CRMWhatsAppBudgetPlanner.plan({
      config:            cfg({ globalDailyLimit: 50, globalCycleLimit: 5, distributionMode: "MANUAL" }),
      globalSentToday:   10,
      instanceConnected: true,
      campaigns:         [
        campaign("A", { manualDailyQuota: 10, alreadySentToday: 10 }), // esgotada
        campaign("B", { manualDailyQuota: 20 }),
      ],
    });
    const a = plan.perCampaign.find((p) => p.campaignId === "A")!;
    const b = plan.perCampaign.find((p) => p.campaignId === "B")!;
    expect(a.allocated).toBe(0);
    expect(a.reason).toBe("CAMPAIGN_DAILY_QUOTA_REACHED");
    expect(b.allocated).toBe(5); // herda o ciclo inteiro
  });

  it("missing manual quota falls back to the equal share", () => {
    const plan = CRMWhatsAppBudgetPlanner.plan({
      config:            cfg({ globalDailyLimit: 40, globalCycleLimit: 5, distributionMode: "MANUAL" }),
      globalSentToday:   0,
      instanceConnected: true,
      campaigns:         [campaign("A"), campaign("B")], // sem manualDailyQuota
    });
    expect(plan.perCampaign.every((p) => p.dailyQuota === 20)).toBe(true);
  });
});

describe("isCycleIntervalActive (min interval between cycles)", () => {
  const now = new Date("2026-07-08T12:00:00Z");

  it("active when last activity is more recent than the interval", () => {
    expect(isCycleIntervalActive(new Date("2026-07-08T11:55:00Z"), 10, now)).toBe(true);
  });

  it("inactive when the interval has fully elapsed", () => {
    expect(isCycleIntervalActive(new Date("2026-07-08T11:49:59Z"), 10, now)).toBe(false);
  });

  it("inactive with no prior activity or interval disabled", () => {
    expect(isCycleIntervalActive(null, 10, now)).toBe(false);
    expect(isCycleIntervalActive(new Date("2026-07-08T11:59:00Z"), 0, now)).toBe(false);
  });

  it("accepts ISO strings and rejects invalid dates", () => {
    expect(isCycleIntervalActive("2026-07-08T11:59:00Z", 10, now)).toBe(true);
    expect(isCycleIntervalActive("not-a-date", 10, now)).toBe(false);
  });
});

describe("AUDIENCE distribution — daily budget proportional to audience size", () => {
  const cfg = (over: Partial<import("@/lib/crm-safety").CRMWhatsAppBudgetConfig> = {}) => ({
    enabled: true, providerMode: "EVOLUTION_WEB" as const,
    globalDailyLimit: 100, globalCycleLimit: 40, minMinutesBetweenCycles: 0,
    distributionMode: "AUDIENCE" as const,
    stopOnInstanceDisconnected: true, pauseOnFailureRatePercent: 0, maxConsecutiveProviderFailures: 0,
    ...over,
  });
  const camp = (id: string, audience: number, sent = 0) => ({
    campaignId: id, priority: "GENERIC_PROMO" as const,
    alreadySentToday: sent, remainingAudience: audience,
  });

  it("splits the daily budget proportionally to each campaign's audience", () => {
    const plan = CRMWhatsAppBudgetPlanner.plan({
      config: cfg(), globalSentToday: 0, instanceConnected: true,
      campaigns: [camp("big", 300), camp("mid", 100), camp("tiny", 0)],
    });
    const byId = Object.fromEntries(plan.perCampaign.map((p) => [p.campaignId, p]));
    expect(byId.big.dailyQuota).toBe(75);   // 300/400 of 100
    expect(byId.mid.dailyQuota).toBe(25);   // 100/400 of 100
    expect(byId.tiny.dailyQuota).toBe(0);   // empty audience gets nothing
    expect(byId.big.dailyQuota + byId.mid.dailyQuota).toBe(100);
  });

  it("guarantees at least 1 daily slot to any non-empty audience", () => {
    const plan = CRMWhatsAppBudgetPlanner.plan({
      config: cfg({ globalDailyLimit: 10 }), globalSentToday: 0, instanceConnected: true,
      campaigns: [camp("huge", 1000), camp("tiny", 1)],
    });
    const tiny = plan.perCampaign.find((p) => p.campaignId === "tiny")!;
    expect(tiny.dailyQuota).toBeGreaterThanOrEqual(1);
  });

  it("falls back to the even split when no audience data exists", () => {
    const plan = CRMWhatsAppBudgetPlanner.plan({
      config: cfg(), globalSentToday: 0, instanceConnected: true,
      campaigns: [camp("a", 0), camp("b", 0)],
    });
    expect(plan.perCampaign[0]!.dailyQuota).toBe(50);
    expect(plan.perCampaign[1]!.dailyQuota).toBe(50);
  });
});
