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

describe("applyEffectiveSafety — canal único (Meta)", () => {
  const base = parseSafetyConfig({});

  it("modo seguro usa o teto do tier, ritmo rápido e ciclos grandes", () => {
    const eff = applyEffectiveSafety(base);
    expect(eff.dailyGlobalCap).toBe(META_SAFE_DAILY_LIMIT);
    expect(eff.crmWhatsAppSafety?.globalDailyLimit).toBe(META_SAFE_DAILY_LIMIT);
    expect(eff.crmWhatsAppSafety?.globalCycleLimit).toBe(META_CYCLE_LIMIT);
    expect(eff.randomDelayMinSec).toBe(1);
    expect(eff.randomDelayMaxSec).toBe(2);
  });

  // O caso que este teste substitui provava a rampa de aquecimento (20→250/dia
  // conforme a idade do número) e o ciclo de 5. Aquilo existia para proteger uma
  // sessão de WhatsApp Web NÃO OFICIAL de banimento, e saiu com a Evolution em
  // 04/08. Agora não há um "modo sem Meta": não existe segundo canal, então o
  // teto seguro é sempre o da Meta — e é isso que o caso abaixo trava.
  it("não existe modo alternativo: sem argumentos extras, o teto é sempre o da Meta", () => {
    expect(applyEffectiveSafety(base).dailyGlobalCap).toBe(META_SAFE_DAILY_LIMIT);
    expect(applyEffectiveSafety(parseSafetyConfig({})).crmWhatsAppSafety?.globalCycleLimit)
      .toBe(META_CYCLE_LIMIT);
  });

  it("override manual vence (os números do dono ficam intactos)", () => {
    const manual = parseSafetyConfig({ manualOverride: true, dailyGlobalCap: 123 });
    expect(applyEffectiveSafety(manual).dailyGlobalCap).toBe(123);
  });
});
