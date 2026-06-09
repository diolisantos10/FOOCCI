import { describe, it, expect } from "vitest";
import { parseSafetyConfig, DEFAULT_SAFETY_CONFIG } from "@/lib/crm-safety";

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
