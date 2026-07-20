import { describe, it, expect } from "vitest";
import { parseSafetyConfig, DEFAULT_SAFETY_CONFIG, applyEffectiveSafety, META_SAFE_DAILY_LIMIT, META_CYCLE_LIMIT } from "@/lib/crm-safety";

describe("parseSafetyConfig — weekly cap + per-customer + 0 semantics", () => {
  it("(2) exposes weeklyGlobalCap, default OFF (0)", () => {
    expect(DEFAULT_SAFETY_CONFIG.weeklyGlobalCap).toBe(0);
    expect(parseSafetyConfig({}).weeklyGlobalCap).toBe(0);
  });

  it("(1) exposes maxPerWeekPerCustomer", () => {
    expect(parseSafetyConfig({ maxPerWeekPerCustomer: 1 }).maxPerWeekPerCustomer).toBe(1);
    expect(parseSafetyConfig({}).maxPerWeekPerCustomer).toBe(DEFAULT_SAFETY_CONFIG.maxPerWeekPerCustomer);
  });

  it("(8) 0 is preserved exactly for caps (UI maps 0 → 'sem limite' via a switch, never ambiguous)", () => {
    const c = parseSafetyConfig({ dailyGlobalCap: 0, weeklyGlobalCap: 0, maxPerWeekPerCustomer: 0 });
    expect(c.dailyGlobalCap).toBe(0);
    expect(c.weeklyGlobalCap).toBe(0);
    expect(c.maxPerWeekPerCustomer).toBe(0);
  });

  it("round-trips a custom weekly cap", () => {
    expect(parseSafetyConfig({ weeklyGlobalCap: 500 }).weeklyGlobalCap).toBe(500);
  });
});

describe("applyEffectiveSafety — Meta official full-power mode", () => {
  const base = parseSafetyConfig({});

  it("safe mode on Meta uses the tier ceiling, fast pacing and big cycles", () => {
    const eff = applyEffectiveSafety(base, 100, { metaOfficial: true });
    expect(eff.dailyGlobalCap).toBe(META_SAFE_DAILY_LIMIT);
    expect(eff.crmWhatsAppSafety?.globalDailyLimit).toBe(META_SAFE_DAILY_LIMIT);
    expect(eff.crmWhatsAppSafety?.globalCycleLimit).toBe(META_CYCLE_LIMIT);
    expect(eff.randomDelayMinSec).toBe(1);
    expect(eff.randomDelayMaxSec).toBe(2);
  });

  it("safe mode WITHOUT Meta keeps the Evolution warmup ramp (max 250) and 5/cycle", () => {
    const eff = applyEffectiveSafety(base, 100, { metaOfficial: false });
    expect(eff.dailyGlobalCap).toBe(250);
    expect(eff.crmWhatsAppSafety?.globalCycleLimit).toBe(5);
    expect(eff.randomDelayMinSec).toBe(5);
  });

  it("manual override wins over Meta mode (owner's numbers untouched)", () => {
    const manual = parseSafetyConfig({ manualOverride: true, dailyGlobalCap: 123 });
    const eff = applyEffectiveSafety(manual, 100, { metaOfficial: true });
    expect(eff.dailyGlobalCap).toBe(123);
  });
});
