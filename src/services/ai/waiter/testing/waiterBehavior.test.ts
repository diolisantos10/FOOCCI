/**
 * waiterBehavior — pure behavioral tests for WaiterBrainV2 via the existing
 * evaluator, against a FIXED synthetic catalog (no DB, no OpenAI, no network).
 *
 * These exercise safe behavioral invariants for tomorrow's critical scenarios
 * without touching the live Test Center scoring. ConversationGuardrails is
 * mocked to isolate the prisma import (same pattern as the other V2 tests).
 */

import { vi, describe, it, expect } from "vitest";

vi.mock("../../ConversationGuardrails", () => ({
  isDessertCategory: (name: string) =>
    /sobremesa|doce|sorvete|torta|bolo|brownie|pudim|brigadeiro|mousse|dessert|sweet/i.test(name),
  isMainCategory: () => true,
}));

import { evaluateScenario } from "./waiterEvaluator";
import type { WaiterTestCase } from "./waiterScenarios";
import type { V2CatalogItem } from "../../WaiterBrainV2";

function catalog(): V2CatalogItem[] {
  return [
    { id: "m1", name: "Temaki Salmão", categoryName: "Temakis", price: 22, sortOrder: 1 },
    { id: "m2", name: "Hot Roll Frito", categoryName: "Hot Rolls", price: 28, sortOrder: 2 },
    { id: "m3", name: "Combinado Família 40 peças", categoryName: "Combos", price: 120, sortOrder: 3, servingSize: 4 },
    { id: "d1", name: "Refrigerante Lata", categoryName: "Bebidas", price: 7, sortOrder: 4 },
    { id: "s1", name: "Pudim de Leite", categoryName: "Sobremesas", price: 12, sortOrder: 5 },
    { id: "m4", name: "Sashimi Salmão", categoryName: "Sashimi", price: 30, sortOrder: 6, description: "opção leve e fresca" },
  ];
}

describe("WaiterBrainV2 behavior — synthetic catalog (pure)", () => {
  it("recommendation returns only real cards, never a menu dump", () => {
    const tc: WaiterTestCase = {
      id: "beh-reco",
      group: "recommendation",
      groupLabel: "Recomendação",
      description: "'me sugere algo' → cards reais, sem dump",
      message: "me sugere algo",
      checks: [{ type: "has_real_cards" }, { type: "no_hallucination" }, { type: "no_long_menu_dump" }],
    };
    const r = evaluateScenario(tc, catalog());
    expect(r.pass).toBe(true);
  });

  it("never hallucinates on an off-catalog request", () => {
    const tc: WaiterTestCase = {
      id: "beh-noh",
      group: "no_hallucination",
      groupLabel: "Sem alucinação",
      description: "pedido aleatório → só IDs reais e sem negação proibida",
      message: "quero um prato qualquer surpresa",
      checks: [{ type: "no_hallucination" }, { type: "no_forbidden_denial" }, { type: "no_long_menu_dump" }],
    };
    const r = evaluateScenario(tc, catalog());
    expect(r.pass).toBe(true);
  });

  it("respects a drink refusal (cart has food) — no drink card re-pushed", () => {
    const tc: WaiterTestCase = {
      id: "beh-refusal",
      group: "consultative_close",
      groupLabel: "Fechamento",
      description: "'não quero bebida' com comida no carrinho → não re-empurra bebida",
      message: "não quero bebida",
      cartItemIds: ["m1"],
      checks: [{ type: "no_hallucination" }, { type: "respects_refusal", refusedCategory: "drink" }],
    };
    const r = evaluateScenario(tc, catalog());
    expect(r.pass).toBe(true);
  });

  it("every returned card across scenarios exists in the catalog", () => {
    const ids = new Set(catalog().map((i) => i.id));
    const messages = ["me sugere algo", "o que tem pra 4 pessoas?", "quero algo leve", "quero finalizar"];
    for (const message of messages) {
      const tc: WaiterTestCase = {
        id: `beh-real-${message}`,
        group: "recommendation",
        groupLabel: "Recomendação",
        description: "cards reais",
        message,
        checks: [{ type: "no_hallucination" }],
      };
      const r = evaluateScenario(tc, catalog());
      for (const card of r.aiResponse.cards) expect(ids.has(card)).toBe(true);
    }
  });
});
