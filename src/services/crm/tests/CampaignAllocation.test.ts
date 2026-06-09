import { describe, it, expect } from "vitest";
import {
  calculateCampaignSendAllocation,
  priorityFromScheduleConfig,
  type AllocationCampaignInput,
} from "../campaignAllocation";

function camp(over: Partial<AllocationCampaignInput> = {}): AllocationCampaignInput {
  return { campaignId: "c", campaignName: "C", priority: "NORMAL", dailyLimit: 100, eligibleNow: 100, alreadySent24h: 0, ...over };
}

describe("calculateCampaignSendAllocation", () => {
  it("(4) distributes a tight budget in a balanced way across equal-priority campaigns", () => {
    const r = calculateCampaignSendAllocation({
      globalDailyCap: 100, globalDailyConsumed: 0,
      campaigns: [
        camp({ campaignId: "a", campaignName: "A" }),
        camp({ campaignId: "b", campaignName: "B" }),
        camp({ campaignId: "c", campaignName: "C" }),
        camp({ campaignId: "d", campaignName: "D" }),
      ],
    });
    // ~25 each (balanced), total == budget
    expect(r.totalAllocatedToday).toBe(100);
    for (const c of r.campaigns) expect(c.allocatedToday).toBeGreaterThanOrEqual(24);
    for (const c of r.campaigns) expect(c.allocatedToday).toBeLessThanOrEqual(26);
  });

  it("(5) higher priority is served before normal/low", () => {
    const r = calculateCampaignSendAllocation({
      globalDailyCap: 50, globalDailyConsumed: 0,
      campaigns: [
        camp({ campaignId: "hi", campaignName: "Aniversário", priority: "HIGH", eligibleNow: 50, dailyLimit: 50 }),
        camp({ campaignId: "lo", campaignName: "Promo", priority: "LOW", eligibleNow: 50, dailyLimit: 50 }),
      ],
    });
    const hi = r.campaigns.find((c) => c.campaignId === "hi")!;
    const lo = r.campaigns.find((c) => c.campaignId === "lo")!;
    expect(hi.allocatedToday).toBe(50); // HIGH fully served first
    expect(lo.allocatedToday).toBe(0);  // LOW only gets leftover (none here)
    expect(lo.riskLevel).toBe("COMPETING");
  });

  it("(6) a low-priority campaign cannot consume everything while others have demand", () => {
    const r = calculateCampaignSendAllocation({
      globalDailyCap: 60, globalDailyConsumed: 0,
      campaigns: [
        camp({ campaignId: "lo", campaignName: "Promo", priority: "LOW", eligibleNow: 1000, dailyLimit: 1000 }),
        camp({ campaignId: "norm", campaignName: "Reativação", priority: "NORMAL", eligibleNow: 30, dailyLimit: 30 }),
      ],
    });
    const norm = r.campaigns.find((c) => c.campaignId === "norm")!;
    expect(norm.allocatedToday).toBe(30); // NORMAL served before LOW
  });

  it("(7) starvation risk is detected (COMPETING) when the budget is consumed by others", () => {
    const r = calculateCampaignSendAllocation({
      globalDailyCap: 100, globalDailyConsumed: 100, // budget already exhausted
      campaigns: [camp({ campaignId: "frios", campaignName: "Recuperar frios", eligibleNow: 200, dailyLimit: 200 })],
    });
    const frios = r.campaigns[0]!;
    expect(frios.allocatedToday).toBe(0);
    expect(frios.riskLevel).toBe("COMPETING");
    expect(r.atRisk).toContain("Recuperar frios");
  });

  it("blocked-by-own-limit is distinct from competing", () => {
    const r = calculateCampaignSendAllocation({
      globalDailyCap: 0, globalDailyConsumed: 0, // unlimited global
      campaigns: [camp({ eligibleNow: 200, dailyLimit: 20 })],
    });
    const c = r.campaigns[0]!;
    expect(c.allocatedToday).toBe(20);
    expect(c.blockedByCampaignLimit).toBe(180);
    expect(c.riskLevel).toBe("BLOCKED_BY_LIMIT");
  });

  it("unlimited global cap → each campaign sends its full demand, no competition", () => {
    const r = calculateCampaignSendAllocation({
      globalDailyCap: 0, globalDailyConsumed: 0,
      campaigns: [camp({ campaignId: "a", eligibleNow: 50, dailyLimit: 100 }), camp({ campaignId: "b", eligibleNow: 80, dailyLimit: 100 })],
    });
    expect(r.budgetToday).toBe(-1);
    expect(r.campaigns[0]!.allocatedToday).toBe(50);
    expect(r.campaigns[1]!.allocatedToday).toBe(80);
  });

  it("optional weekly cap further limits today's budget when set", () => {
    const r = calculateCampaignSendAllocation({
      globalDailyCap: 200, globalDailyConsumed: 0,
      weeklyGlobalCap: 30, weeklyGlobalConsumed: 20, // only 10 left this week
      campaigns: [camp({ eligibleNow: 100, dailyLimit: 100 })],
    });
    expect(r.budgetToday).toBe(10);
    expect(r.campaigns[0]!.allocatedToday).toBe(10);
  });
});

describe("priorityFromScheduleConfig", () => {
  it("(3) reads priority from scheduleConfig, defaulting to NORMAL", () => {
    expect(priorityFromScheduleConfig({ priority: "HIGH" })).toBe("HIGH");
    expect(priorityFromScheduleConfig({ priority: "garbage" })).toBe("NORMAL");
    expect(priorityFromScheduleConfig(null)).toBe("NORMAL");
  });
});
