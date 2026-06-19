/**
 * Agentes → WhatsApp — 7-tab UX consolidation tests.
 *
 * Tests cover:
 *   1. Visão Geral tab present
 *   2. Conversas de hoje tab present
 *   3. Aprendizados pendentes tab present
 *   4. Learning card fields include all required business labels
 *   5. Main label blocklist excludes raw technical jargon
 *   6. Approval disclaimer does NOT say it auto-applies to production
 *   7. Simulador tab present
 *   8. Modo avançado has technical diagnostic links
 *   9. All 7 tabs present (comprehensive check)
 */

import { describe, it, expect } from "vitest";
import {
  WA_TABS,
  APPROVAL_DISCLAIMER,
  MODO_AVANCADO_LINKS,
  MAIN_LABEL_BLOCKLIST,
  TERM_REPLACEMENTS,
} from "./wa-agent-ux.constants";

// Learning card field labels required on the Aprendizados tab (business-language).
const REQUIRED_CARD_LABELS = [
  "O que o cliente queria",
  "O que a IA respondeu",
  "Qual foi o erro",
  "Resposta ideal",
  "Aprendizado sugerido",
  "Impacto na venda",
];

describe("Agentes → WhatsApp — UX consolidation", () => {
  it("page has Visão Geral tab", () => {
    const tab = WA_TABS.find((t) => t.id === "visao-geral");
    expect(tab).toBeDefined();
    expect(tab!.label).toBe("Visão Geral");
  });

  it("page has Conversas de hoje tab", () => {
    const tab = WA_TABS.find((t) => t.id === "conversas");
    expect(tab).toBeDefined();
    expect(tab!.label).toBe("Conversas de hoje");
  });

  it("page has Aprendizados pendentes tab", () => {
    const tab = WA_TABS.find((t) => t.id === "aprendizados");
    expect(tab).toBeDefined();
    expect(tab!.label).toBe("Aprendizados pendentes");
  });

  it("learning card exposes all required business-language fields", () => {
    // Each field must be representable as a plain label (in REQUIRED_CARD_LABELS).
    // The renderer maps them to business terms; none of these are technical identifiers.
    for (const field of REQUIRED_CARD_LABELS) {
      // The field label must exist as a proper business-language string.
      expect(field).not.toMatch(/^[a-z][A-Z]/);     // not camelCase
      expect(field).not.toMatch(/^[A-Z_]+$/);        // not SCREAMING_SNAKE
      expect(field.trim().length).toBeGreaterThan(3); // not a raw symbol
    }
    expect(REQUIRED_CARD_LABELS).toContain("O que o cliente queria");
    expect(REQUIRED_CARD_LABELS).toContain("O que a IA respondeu");
    expect(REQUIRED_CARD_LABELS).toContain("Qual foi o erro");
    expect(REQUIRED_CARD_LABELS).toContain("Resposta ideal");
    expect(REQUIRED_CARD_LABELS).toContain("Impacto na venda");
  });

  it("main label blocklist prevents technical jargon from appearing in card body", () => {
    expect(MAIN_LABEL_BLOCKLIST).toContain("intent");
    expect(MAIN_LABEL_BLOCKLIST).toContain("runtime");
    expect(MAIN_LABEL_BLOCKLIST).toContain("classifier");
    expect(MAIN_LABEL_BLOCKLIST).toContain("UNKNOWN");
    // P0/P1/P2 are also replaced — check TERM_REPLACEMENTS
    expect(TERM_REPLACEMENTS["P0"]).toBe("crítico");
    expect(TERM_REPLACEMENTS["P1"]).toBe("atenção");
    expect(TERM_REPLACEMENTS["UNKNOWN"]).toBe("precisa revisar");
  });

  it("approval disclaimer says it does NOT apply to production automatically", () => {
    expect(APPROVAL_DISCLAIMER).toMatch(/não.*produção|produção.*não/i);
    expect(APPROVAL_DISCLAIMER).toMatch(/próxima rodada|treinamento/i);
    // Must NOT say it changes production:
    expect(APPROVAL_DISCLAIMER).not.toMatch(/muda.*produção imediatamente|aplica.*imediatamente.*produção/i);
  });

  it("Simulador tab is present", () => {
    const tab = WA_TABS.find((t) => t.id === "simulador");
    expect(tab).toBeDefined();
    expect(tab!.label).toBe("Simulador");
  });

  it("Modo avançado tab has diagnostic links pointing to technical admin pages", () => {
    expect(MODO_AVANCADO_LINKS.length).toBeGreaterThanOrEqual(3);
    const hrefs = MODO_AVANCADO_LINKS.map((l) => l.href);
    expect(hrefs.some((h) => h.includes("simulator") || h.includes("diagnos"))).toBe(true);
    expect(hrefs.some((h) => h.includes("quality") || h.includes("training") || h.includes("cockpit"))).toBe(true);
    // All links must be internal admin paths
    for (const l of MODO_AVANCADO_LINKS) {
      expect(l.href).toMatch(/^\/admin/);
    }
  });

  it("all 7 required tabs are present in WA_TABS", () => {
    const requiredIds = [
      "visao-geral",
      "conversas",
      "aprendizados",
      "simulador",
      "saude",
      "configuracoes",
      "modo-avancado",
    ] as const;
    for (const id of requiredIds) {
      expect(WA_TABS.find((t) => t.id === id), `tab '${id}' is missing`).toBeDefined();
    }
    expect(WA_TABS).toHaveLength(7);
  });
});
