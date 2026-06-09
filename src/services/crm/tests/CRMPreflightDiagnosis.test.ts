import { describe, it, expect } from "vitest";
import { diagnosePreflight, type PreflightInput } from "../CRMPreflightDiagnosisService";

function cust(id: string, over: Partial<{ phone: string | null; hasOptedOut: boolean }> = {}) {
  return { id, phone: over.phone === undefined ? "5511999990000" : over.phone, hasOptedOut: over.hasOptedOut };
}

function base(over: Partial<PreflightInput> = {}): PreflightInput {
  return {
    customers: [],
    impactedByCampaign: new Set(),
    impactedByConcept: new Set(),
    impactedByMessage: new Set(),
    dedupeByConcept: true,
    dedupeByMessage: true,
    allowResendToImpacted: false,
    globalDailyRemaining: -1,
    campaignDailyRemaining: 1000,
    allowWeeklyOverride: false,
    ...over,
  };
}

describe("diagnosePreflight — pre-send breakdown", () => {
  it("(13) returns eligible vs blocked breakdown with correct precedence", () => {
    const d = diagnosePreflight(base({
      customers: [cust("a"), cust("b", { hasOptedOut: true }), cust("c", { phone: null }), cust("d")],
    }));
    expect(d.audienceTotal).toBe(4);
    expect(d.blocked.optOut).toBe(1);
    expect(d.blocked.invalidPhone).toBe(1);
    expect(d.eligibleNow).toBe(2);
  });

  it("(5) already-impacted-by-concept is suppressed", () => {
    const d = diagnosePreflight(base({
      customers: [cust("a"), cust("b")],
      impactedByConcept: new Set(["a"]),
    }));
    expect(d.blocked.alreadyImpactedConcept).toBe(1);
    expect(d.eligibleNow).toBe(1);
  });

  it("(6) duplicate message is suppressed", () => {
    const d = diagnosePreflight(base({
      customers: [cust("a"), cust("b")],
      impactedByMessage: new Set(["b"]),
    }));
    expect(d.blocked.duplicateMessage).toBe(1);
    expect(d.eligibleNow).toBe(1);
  });

  it("allowResendToImpacted bypasses concept/message dedupe", () => {
    const d = diagnosePreflight(base({
      customers: [cust("a")],
      impactedByConcept: new Set(["a"]),
      impactedByMessage: new Set(["a"]),
      allowResendToImpacted: true,
    }));
    expect(d.blocked.alreadyImpactedConcept).toBe(0);
    expect(d.eligibleNow).toBe(1);
  });

  it("(7) weekly cap blocks unless priority override is on", () => {
    const weeklyCapped = new Set(["a", "b"]);
    const blockedRun = diagnosePreflight(base({ customers: [cust("a"), cust("b")], weeklyCappedIds: weeklyCapped }));
    expect(blockedRun.blocked.weeklyLimit).toBe(2);
    expect(blockedRun.eligibleNow).toBe(0);

    const overrideRun = diagnosePreflight(base({ customers: [cust("a"), cust("b")], weeklyCappedIds: weeklyCapped, allowWeeklyOverride: true }));
    expect(overrideRun.blocked.weeklyLimit).toBe(0);
    expect(overrideRun.eligibleNow).toBe(2);
    expect(overrideRun.overrideWeeklyLimitUsed).toBe(2);
  });

  it("forecast today is capped by the global + campaign budgets", () => {
    const d = diagnosePreflight(base({
      customers: [cust("a"), cust("b"), cust("c")],
      globalDailyRemaining: 2,
      campaignDailyRemaining: 5,
    }));
    expect(d.eligibleNow).toBe(3);
    expect(d.forecastSendToday).toBe(2);
    expect(d.blocked.globalCap).toBe(1);
    expect(d.canSendNow).toBe(true);
  });
});
