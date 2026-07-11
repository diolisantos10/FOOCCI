import { describe, it, expect } from "vitest";
import { isToneSection, technicalExtendedEntries, stripToneForFicha, TONE_EXTENDED_SECTIONS } from "./fichaVisibility";
import { DEFAULT_AGENT_PROFILES } from "./defaultAgentProfiles";

const WAITER = DEFAULT_AGENT_PROFILES.find((p) => p.slug === "waiter")!;
const CRM = DEFAULT_AGENT_PROFILES.find((p) => p.slug === "crm")!;

/** Dump de todos os valores string de um extendedSections (recursivo raso). */
function flatten(sections?: Record<string, unknown>): string {
  return JSON.stringify(sections ?? {});
}

describe("fichaVisibility — a ficha esconde tom, mantém o técnico", () => {
  it("classifica seções de tom vs técnicas", () => {
    expect(isToneSection("salesPrinciples")).toBe(true);
    expect(isToneSection("messageToneRules")).toBe(true);
    expect(isToneSection("examples")).toBe(true);
    expect(isToneSection("menuReadingRules")).toBe(false); // técnico
    expect(isToneSection("failureHandling")).toBe(false); // técnico
  });

  it("waiter: remove princípios de venda/fechamento, mantém leitura de cardápio", () => {
    const keys = technicalExtendedEntries(WAITER.extendedSections).map(([k]) => k);
    expect(keys).not.toContain("salesPrinciples");
    expect(keys).not.toContain("closingRules");
    expect(keys).not.toContain("examples");
    expect(keys).toContain("menuReadingRules"); // técnico permanece
    expect(keys).toContain("failureHandling");
  });

  it("crm: remove messageToneRules (scripts de tom), mantém métricas", () => {
    const keys = technicalExtendedEntries(CRM.extendedSections).map(([k]) => k);
    expect(keys).not.toContain("messageToneRules");
    expect(keys).not.toContain("examples");
    expect(keys).toContain("metricsAndAttributionRules"); // técnico permanece
  });

  it("o texto visível da ficha (waiter) não contém scripts de tom conhecidos", () => {
    const visible = flatten(Object.fromEntries(technicalExtendedEntries(WAITER.extendedSections)));
    expect(visible).not.toContain("Gatilho de desejo");
    expect(visible).not.toContain("Quer que eu adicione");
  });

  it("o texto visível da ficha (crm) não contém o script de spam de exemplo", () => {
    const visible = flatten(Object.fromEntries(technicalExtendedEntries(CRM.extendedSections)));
    expect(visible).not.toContain("PROMOÇÃO IMPERDÍVEL");
    expect(visible).not.toContain("Detectamos inatividade");
  });

  it("businessRules exibido é enxuto (curado) — não é o paredão da constituição", () => {
    // A poda: waiter/crm foram de 33/36 para ~8 regras técnicas legíveis.
    expect(WAITER.businessRules.length).toBeLessThanOrEqual(12);
    expect(WAITER.businessRules.length).toBeGreaterThan(5);
    expect(CRM.businessRules.length).toBeLessThanOrEqual(12);
    // E sem tom nas regras exibidas:
    const wr = WAITER.businessRules.join(" ");
    expect(wr).not.toContain("Gatilho de desejo");
    const cr = CRM.businessRules.join(" ");
    expect(cr).not.toContain("PROMOÇÃO IMPERDÍVEL");
  });

  it("stripToneForFicha remove o tom do payload no servidor (não vaza p/ view-source)", () => {
    const stripped = stripToneForFicha(WAITER);
    const blob = JSON.stringify(stripped.extendedSections);
    expect(blob).not.toContain("Gatilho de desejo");
    expect(blob).not.toContain("salesPrinciples");
    expect(blob).toContain("menuReadingRules"); // técnico permanece
    // não muta o original
    expect(JSON.stringify(WAITER.extendedSections)).toContain("salesPrinciples");
  });

  it("stripToneForFicha é seguro sem extendedSections", () => {
    expect(stripToneForFicha({ slug: "x" }).extendedSections).toBeUndefined();
  });

  it("TONE_EXTENDED_SECTIONS cobre os ofensores apontados na auditoria", () => {
    ["salesPrinciples", "closingRules", "messageToneRules", "examples"].forEach((k) =>
      expect(TONE_EXTENDED_SECTIONS.has(k)).toBe(true),
    );
  });
});
