/**
 * Dietary filtering — the P1 where a wrong answer costs someone's health.
 *
 * The defect: the filter matched restriction keywords against the item name plus its
 * ingredients. An item with NO ingredients registered matched nothing, and "matched
 * nothing" was returned as "safe". So a dish whose name gives no clue — "Risoto do
 * Chef", "Prato do Dia" — was offered to a customer who had declared "sem lactose".
 *
 * It is guardrail 1 inverted: absence of information treated as information. These
 * tests lock the third state (`unknown`) that makes the difference explicit.
 */

import { describe, it, expect } from "vitest";
import { classifyDietarySafety, isBlockedByDietary } from "../ConversationGuardrails";

describe("classifyDietarySafety", () => {
  it("blocks an item whose ingredients hit the restriction", () => {
    expect(
      classifyDietarySafety("Risoto", "arroz arbóreo, queijo parmesão, manteiga", ["sem lactose"], []),
    ).toBe("blocked");
  });

  it("blocks an item whose NAME hits the restriction even with no ingredients", () => {
    expect(classifyDietarySafety("Filé de peixe", null, ["sem peixe"], [])).toBe("blocked");
  });

  it("returns UNKNOWN — not safe — when the item has no ingredients registered", () => {
    // The heart of the P1. The name says nothing and there is nothing else to read,
    // so the honest answer is "I cannot tell", never "it is fine".
    expect(classifyDietarySafety("Risoto do Chef", null, ["sem lactose"], [])).toBe("unknown");
    expect(classifyDietarySafety("Prato do Dia", "", [], ["amendoim"])).toBe("unknown");
    expect(classifyDietarySafety("Especial da Casa", "   ", ["vegano"], [])).toBe("unknown");
  });

  it("returns safe only when ingredients exist AND none conflict", () => {
    expect(
      classifyDietarySafety("Salada verde", "alface, tomate, pepino, azeite", ["vegano"], []),
    ).toBe("safe");
  });

  it("treats a customer with no restrictions as safe, even without ingredients", () => {
    // No restriction declared means there is nothing to prove — this must not become
    // a protection that hides the whole menu from ordinary customers (guardrail 5).
    expect(classifyDietarySafety("Risoto do Chef", null, [], [])).toBe("safe");
    expect(classifyDietarySafety("Risoto do Chef", null, [""], ["  "])).toBe("safe");
  });

  it("checks allergies, not only dietary preferences", () => {
    expect(classifyDietarySafety("Bolo", "farinha, ovo, leite", [], ["leite"])).toBe("blocked");
  });
});

describe("isBlockedByDietary — unknown must exclude, like blocked", () => {
  it("excludes an item that cannot be proven safe", () => {
    expect(isBlockedByDietary("Risoto do Chef", null, ["sem lactose"], [])).toBe(true);
  });

  it("still allows a proven-safe item", () => {
    expect(isBlockedByDietary("Salada verde", "alface, tomate", ["vegano"], [])).toBe(false);
  });

  it("does not exclude anything when the customer declared no restriction", () => {
    expect(isBlockedByDietary("Risoto do Chef", null, [], [])).toBe(false);
  });
});
