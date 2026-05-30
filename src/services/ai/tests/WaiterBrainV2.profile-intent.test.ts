/**
 * WaiterBrainV2 — Professional Profile / Intent Tests
 *
 * Verifies the Waiter behaves like a consultative salesperson, NOT a literal
 * keyword search bot. Specifically: group-size and "porção" phrases must never
 * become literal product searches that reply "não encontrei pessoas/porção".
 *
 * Pure functions only — no DB, no AI, no network.
 */

import { vi, describe, it, expect } from "vitest";

vi.mock("../ConversationGuardrails", () => ({
  isDessertCategory: (name: string) =>
    /sobremesa|doce|sorvete|torta|bolo|brownie|pudim|brigadeiro|dessert|sweet/i.test(name),
}));

import { decide, type V2CatalogItem, type V2Input } from "../WaiterBrainV2";
import { buildWaiterProfileDirective, WAITER_AGENT_PROFILE } from "../waiter/WaiterAgentProfile";

// ── Catalog with shareable combos + a "Porções" category ──────────────────────

function makeSushiCatalog(): V2CatalogItem[] {
  return [
    { id: "t1", name: "Temaki Salmão",        categoryName: "Temakis",    price: 22, sortOrder: 1 },
    { id: "u1", name: "Uramaki Philadelphia", categoryName: "Uramakis",   price: 28, sortOrder: 2 },
    { id: "c1", name: "Combinado 32 peças",   categoryName: "Combinados", price: 89, sortOrder: 3, servingSize: 3, description: "32 unidades para compartilhar" },
    { id: "c2", name: "Combo Família 60 peças", categoryName: "Combinados", price: 159, sortOrder: 4, servingSize: 4 },
    { id: "p1", name: "Porção de Gyoza",      categoryName: "Porções",    price: 26, sortOrder: 5 },
    { id: "p2", name: "Porção de Edamame",    categoryName: "Porções",    price: 18, sortOrder: 6 },
    { id: "b1", name: "Refrigerante Lata",    categoryName: "Bebidas",    price: 7,  sortOrder: 7 },
    { id: "s1", name: "Sashimi de Salmão",    categoryName: "Sashimis",   price: 32, sortOrder: 8, description: "peixe cru fresco" },
  ];
}

function makeInput(message: string, overrides: Partial<V2Input> = {}): V2Input {
  return {
    event:       "ON_USER_MESSAGE",
    cartItemIds: [],
    cartValue:   0,
    catalog:     makeSushiCatalog(),
    message,
    ...overrides,
  };
}

const catalogIds = makeSushiCatalog().map((i) => i.id);

function assertRealCards(out: { cards: string[] }) {
  expect(out.cards.length).toBeGreaterThan(0);
  for (const id of out.cards) expect(catalogIds).toContain(id);
}

function assertNoLiteralDenial(out: { message: string }) {
  expect(out.message.toLowerCase()).not.toMatch(/não\s+(encontrei|temos)\s+(pessoas|por[çc])/);
}

// ── Group-size intent ─────────────────────────────────────────────────────────

describe("group-size intent → shareable cards, never literal search", () => {
  it.each([
    "o que vc tem para 4 pessoas?",
    "me indica algo para 3 pessoas",
    "somos 4",
    "quero algo para a família",
    "tem algo para compartilhar?",
  ])("'%s' returns real shareable cards (no 'pessoas' denial)", (msg) => {
    const out = decide(makeInput(msg));
    assertNoLiteralDenial(out);
    assertRealCards(out);
    // shareable combos should be prioritized for group intent
    expect(out.cards.some((id) => id === "c1" || id === "c2")).toBe(true);
  });
});

// ── Porção intent ─────────────────────────────────────────────────────────────

describe("porção intent → category/shareable cards, never literal search", () => {
  it.each(["tem porção?", "quero uma porção", "me mostra as porções"])(
    "'%s' returns real Porções cards (no 'porção' denial)",
    (msg) => {
      const out = decide(makeInput(msg));
      assertNoLiteralDenial(out);
      assertRealCards(out);
      // should surface items from the real "Porções" category
      expect(out.cards.some((id) => id === "p1" || id === "p2")).toBe(true);
    },
  );
});

// ── Light intent ──────────────────────────────────────────────────────────────

describe("light intent → fresher options, never empty", () => {
  it("'quero algo leve' returns real cards", () => {
    const out = decide(makeInput("quero algo leve"));
    assertRealCards(out);
  });
});

// ── No hallucination: every card is a real catalog ID ─────────────────────────

describe("no hallucination", () => {
  it.each([
    "o que vc tem para 4 pessoas?",
    "tem porção?",
    "quero algo leve",
    "me sugere algo",
  ])("'%s' only returns real catalog IDs", (msg) => {
    const out = decide(makeInput(msg));
    for (const id of out.cards) expect(catalogIds).toContain(id);
  });
});

// ── Profile directive sanity ──────────────────────────────────────────────────

describe("WaiterAgentProfile", () => {
  it("compiles a non-empty compact directive that frames the Waiter as a professional", () => {
    const d = buildWaiterProfileDirective();
    expect(d.length).toBeGreaterThan(100);
    expect(d).toMatch(/GAR[ÇC]OM PROFISSIONAL/i);
    expect(d).toMatch(/NÃO\s+É\s+UM\s+BOT/i);
  });

  it("exposes a structured profile object for future Agent Dashboard migration", () => {
    expect(WAITER_AGENT_PROFILE.role).toBeTruthy();
    expect(WAITER_AGENT_PROFILE.mission).toBeTruthy();
    expect(WAITER_AGENT_PROFILE.objectives.length).toBeGreaterThan(0);
    expect(WAITER_AGENT_PROFILE.boundaries.cannotDo).toContain("Alterar preços");
  });
});
