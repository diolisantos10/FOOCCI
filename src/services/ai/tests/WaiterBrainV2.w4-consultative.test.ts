/**
 * W4 — Consultative selling / closing loop.
 *
 * Runs the FULL Waiter Test Center suite (existing 26 scenarios + the new W4
 * "consultative_close" group) against a synthetic sushi catalog so the
 * deterministic behavior is verified without a live DB.
 *
 * This mirrors exactly what /api/admin/ai/waiter-tests/run does, just with a
 * fixed catalog, so a green run here means the Test Center is green too.
 */

import { describe, it, expect } from "vitest";
import { WAITER_TEST_CASES } from "../waiter/testing/waiterScenarios";
import { evaluateAll, evaluateScenario } from "../waiter/testing/waiterEvaluator";
import { decide, createWaiterMemory, type V2CatalogItem } from "../WaiterBrainV2";

// ── Synthetic sushi catalog (Sushi-Cazza-like) ────────────────────────────────
const CATALOG: V2CatalogItem[] = [
  // Entradas / leves / baratas
  { id: "edamame",   name: "Edamame",            categoryName: "Entradas",   price: 18, sortOrder: 1 },
  { id: "sunomono",  name: "Salada Sunomono",    categoryName: "Entradas",   price: 22, sortOrder: 2 },
  // Sushi / mains
  { id: "uramaki",   name: "Uramaki Filadélfia", categoryName: "Sushi",      price: 35, sortOrder: 3 },
  { id: "hotroll",   name: "Hot Roll Salmão",    categoryName: "Sushi",      price: 38, sortOrder: 4 },
  { id: "temaki",    name: "Temaki Salmão",      categoryName: "Temaki",     price: 32, sortOrder: 5 },
  { id: "yakisoba",  name: "Yakisoba Frango",    categoryName: "Quentes",    price: 42, sortOrder: 6 },
  // Combos / group (servingSize drives shareable)
  { id: "combofam",  name: "Combo Família",      categoryName: "Combos",     price: 120, sortOrder: 7, servingSize: 4 },
  { id: "combocasal",name: "Combo Casal",        categoryName: "Combos",     price: 75,  sortOrder: 8, servingSize: 2 },
  // Porções
  { id: "gyoza",     name: "Porção Gyoza",       categoryName: "Porções",    price: 28, sortOrder: 9 },
  { id: "harumaki",  name: "Porção Harumaki",    categoryName: "Porções",    price: 26, sortOrder: 10 },
  // Bebidas
  { id: "coca",      name: "Coca-Cola",          categoryName: "Bebidas",    price: 8,  sortOrder: 11 },
  { id: "suco",      name: "Suco Natural",       categoryName: "Bebidas",    price: 12, sortOrder: 12 },
  // Sobremesas
  { id: "gateau",    name: "Petit Gateau",       categoryName: "Sobremesas", price: 24, sortOrder: 13 },
  { id: "mochi",     name: "Mochi",              categoryName: "Sobremesas", price: 18, sortOrder: 14 },
];

describe("W4 — full Test Center suite on synthetic sushi catalog", () => {
  it("every scenario (existing + W4) passes", () => {
    const report = evaluateAll(WAITER_TEST_CASES, CATALOG, "rest_test", "Sushi Cazza (synthetic)", new Date());

    const failures = report.results
      .filter((r) => !r.pass)
      .map((r) => ({
        id:      r.id,
        message: r.message,
        out:     r.aiResponse,
        failed:  r.checks.filter((c) => !c.pass).map((c) => `${c.type}: ${c.detail}`),
      }));

    if (failures.length > 0) {
      // Surface details in the assertion message for fast debugging.
      throw new Error(`Failures:\n${JSON.stringify(failures, null, 2)}`);
    }

    expect(report.summary.score).toBe(100);
    expect(report.summary.passed).toBe(WAITER_TEST_CASES.length);
  });

  it("includes the W4 consultative_close group with 8 scenarios", () => {
    const w4 = WAITER_TEST_CASES.filter((tc) => tc.group === "consultative_close");
    expect(w4.length).toBe(8);
  });
});

// ── Targeted behavioral assertions (consultative selling primitives) ──────────

describe("W4 — consultative selling primitives", () => {
  const base = {
    event:       "ON_USER_MESSAGE" as const,
    cartValue:   0,
    catalog:     CATALOG,
  };

  it("recommendation closes with a CTA (👇 or a closing question)", () => {
    const out = decide({ ...base, cartItemIds: [], message: "me sugere algo" });
    expect(out.cards.length).toBeGreaterThan(0);
    expect(/👇|\?/.test(out.message)).toBe(true);
  });

  it("respects a drink refusal — no drink card re-pushed", () => {
    const out = decide({ ...base, cartItemIds: ["uramaki"], message: "não quero bebida" });
    const drinkCards = out.cards.filter((id) => /coca|suco/.test(id));
    expect(drinkCards).toHaveLength(0);
    expect(out.memoryPatch?.declinedSuggestionTypes).toContain("drink_upsell");
  });

  it("declined drink is not re-offered at checkout", () => {
    const mem = { ...createWaiterMemory(), declinedSuggestionTypes: ["drink_upsell"] };
    const out = decide({ ...base, event: "ON_CHECKOUT_STARTED", cartItemIds: ["uramaki"], memory: mem });
    // Should skip the drink stage entirely (offer dessert/extras or proceed) — never a drink card.
    const drinkCards = out.cards.filter((id) => /coca|suco/.test(id));
    expect(drinkCards).toHaveLength(0);
  });

  it("typed 'quero finalizar' guides to checkout without a fresh upsell dump", () => {
    const out = decide({ ...base, cartItemIds: ["uramaki"], message: "quero finalizar" });
    expect(out.mode).toBe("CHECKOUT_SUPPORT");
    expect(out.cards).toHaveLength(0);
  });

  it("acceptance with prior suggestions re-surfaces them with a tap-to-add CTA", () => {
    const mem = { ...createWaiterMemory(), suggestedProductIds: ["uramaki", "hotroll"] };
    const out = decide({ ...base, cartItemIds: [], message: "gostei, pode colocar", memory: mem });
    expect(out.cards.length).toBeGreaterThan(0);
    expect(/👇|adicion/i.test(out.message)).toBe(true);
  });

  it("acceptance without prior suggestions asks which item (no hallucinated cards)", () => {
    const out = decide({ ...base, cartItemIds: [], message: "gostei, pode colocar" });
    expect(out.cards).toHaveLength(0);
    expect(out.message).toContain("?");
  });

  it("'o que combina com esse combo?' returns contextual complements, not more combos", () => {
    const out = decide({ ...base, cartItemIds: ["combofam"], message: "o que combina com esse combo?" });
    expect(out.cards.length).toBeGreaterThan(0);
    // Pairing should surface complements (drinks/desserts/other categories), not the combo itself.
    expect(out.cards).not.toContain("combofam");
  });

  it("never dumps more than 6 cards", () => {
    const out = decide({ ...base, cartItemIds: [], message: "me mostra todas as opções de sushi" });
    expect(out.cards.length).toBeLessThanOrEqual(6);
  });

  it("'somos em 3 e queremos algo completo' → shareable recommendation", () => {
    const out = decide({ ...base, cartItemIds: [], message: "somos em 3 e queremos algo completo" });
    const shareable = out.cards.filter((id) => id === "combofam" || id === "combocasal");
    expect(shareable.length).toBeGreaterThan(0);
  });
});

// Ensure evaluateScenario respects cartSeedPattern resolution.
describe("W4 — evaluator cart seeding", () => {
  it("resolves cartSeedPattern to a real catalog id", () => {
    const tc = WAITER_TEST_CASES.find((t) => t.id === "vc-08")!;
    const res = evaluateScenario(tc, CATALOG);
    expect(res.pass).toBe(true);
  });
});
