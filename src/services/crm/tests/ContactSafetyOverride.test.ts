import { describe, it, expect } from "vitest";
import { evaluateContactSafety } from "../ContactSafetyService";
import { DEFAULT_SAFETY_CONFIG } from "@/lib/crm-safety";

function input(over: Record<string, unknown> = {}) {
  return {
    phone: "5511999990000",
    hasOptedOut: false,
    crmContactable: true,
    whatsappAvailable: true,
    restaurantOpen: true,
    isBirthday: false,
    enforceTimeWindows: false,
    enforceDailyCap: false,
    enforceRestaurantOpen: false,
    sendingWindow: null,
    safety: { ...DEFAULT_SAFETY_CONFIG, maxPerWeekPerCustomer: 1 },
    globalSentToday: 0,
    sendsWithinCooldown: 0,
    sendsWithinWeek: 1, // at the weekly cap
    otherCampaignSendsWithin24h: 0,
    sameCampaignSends: 0,
    contactHistoryKnown: true, // contadores apurados — o override é sobre teto, não sobre ignorância
    contactBudgetUsed: 0,
    isNewContact: false, // teto pré-pago desligado no cenário-base
    enforceFrequency: true, // cenário-base: é abordagem, a frequência vale
    ...over,
  } as never;
}

describe("priority override — skips ONLY the weekly per-customer cap", () => {
  it("(7) without override: at weekly cap → blocked", () => {
    const d = evaluateContactSafety(input());
    expect(d.sendable).toBe(false);
    expect(d.reason).toBe("CUSTOMER_WEEKLY_CAP_REACHED");
  });

  it("(7) with override: at weekly cap → allowed", () => {
    const d = evaluateContactSafety(input({ allowWeeklyCapOverride: true }));
    expect(d.sendable).toBe(true);
  });

  it("(8) override does NOT bypass opt-out", () => {
    const d = evaluateContactSafety(input({ allowWeeklyCapOverride: true, hasOptedOut: true }));
    expect(d.sendable).toBe(false);
    expect(d.reason).toBe("CUSTOMER_OPTED_OUT");
  });

  it("(9) override does NOT bypass invalid phone", () => {
    const d = evaluateContactSafety(input({ allowWeeklyCapOverride: true, phone: "" }));
    expect(d.sendable).toBe(false);
    expect(d.reason).toBe("MISSING_PHONE");
  });

  it("override does NOT bypass the daily global cap", () => {
    const d = evaluateContactSafety(input({ allowWeeklyCapOverride: true, enforceDailyCap: true, globalSentToday: 200, safety: { ...DEFAULT_SAFETY_CONFIG, maxPerWeekPerCustomer: 1, dailyGlobalCap: 200 } }));
    expect(d.sendable).toBe(false);
    expect(d.reason).toBe("DAILY_GLOBAL_CAP_REACHED");
  });

  it("override does NOT bypass same-campaign dedup", () => {
    const d = evaluateContactSafety(input({ allowWeeklyCapOverride: true, sameCampaignSends: 1 }));
    expect(d.sendable).toBe(false);
    expect(d.reason).toBe("DUPLICATE_CAMPAIGN_RECIPIENT");
  });
});
