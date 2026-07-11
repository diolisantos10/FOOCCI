/**
 * WaiterBrainV2 — Release Candidate (v1.6) behavioral guards.
 *
 * Locks in the safety/communication contract for the RC, independent of exact
 * copy wording:
 *   - never invents a product (every card id exists in the catalog);
 *   - broad recommendation intents surface REAL cards;
 *   - the reply always has a CTA / next step;
 *   - the reply is short (no "textão");
 *   - the chat opening offers exactly ONE button ("Quero uma sugestão");
 *   - the "Pedir de novo" UI stays in standby (disabled).
 *
 * Pure tests (no DB/AI/network). ConversationGuardrails is mocked to isolate the
 * prisma import (same pattern as the other V2 suites).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { vi, describe, it, expect } from "vitest";

vi.mock("../ConversationGuardrails", () => ({
  isDessertCategory: (name: string) =>
    /sobremesa|doce|sorvete|torta|bolo|brownie|pudim|mousse|dessert|sweet/i.test(name),
  isMainCategory: () => true,
}));

import { decide, type V2CatalogItem } from "../WaiterBrainV2";
import { buildOpeningOptions } from "../../order/waiterOpening";

const base = { event: "ON_USER_MESSAGE" as const, cartItemIds: [], cartValue: 0 };

function catalog(): V2CatalogItem[] {
  return [
    { id: "uramaki",  name: "Uramaki Salmão",      categoryName: "Uramakis",  price: 28, sortOrder: 1 },
    { id: "hotfila",  name: "Hot Roll Filadélfia", categoryName: "Hot Rolls", price: 30, sortOrder: 2 },
    { id: "hotcam",   name: "Hot Roll Camarão",    categoryName: "Hot Rolls", price: 38, sortOrder: 3 },
    { id: "temaki",   name: "Temaki Salmão",       categoryName: "Temakis",   price: 24, sortOrder: 4 },
    { id: "yakisoba", name: "Yakisoba de Frango",  categoryName: "Quentes",   price: 33, sortOrder: 5 },
    { id: "gyoza",    name: "Gyoza",               categoryName: "Entradas",  price: 22, sortOrder: 6 },
    { id: "combo",    name: "Combinado 40 peças",  categoryName: "Combos",    price: 120, sortOrder: 7, servingSize: 4 },
    { id: "coca",     name: "Coca-Cola",           categoryName: "Bebidas",   price: 8,  sortOrder: 8 },
  ];
}

const BROAD_INTENTS = [
  "me sugere algo",
  "quero algo barato",
  "quero algo leve",
  "to com um grupo, o que pedir?",
];

const CTA = /👇|adicion|quer|montar|revisar|pedido/i;

describe("WaiterBrainV2 RC v1.6 — never invents a product", () => {
  it("every returned card id exists in the catalog", () => {
    const ids = new Set(catalog().map((i) => i.id));
    for (const message of BROAD_INTENTS) {
      const out = decide({ ...base, catalog: catalog(), message });
      for (const c of out.cards) expect(ids.has(c)).toBe(true);
    }
  });
});

describe("WaiterBrainV2 RC v1.6 — real cards on broad intents", () => {
  it("recommendation intents surface real cards", () => {
    for (const message of BROAD_INTENTS) {
      const out = decide({ ...base, catalog: catalog(), message });
      expect(out.cards.length).toBeGreaterThan(0);
    }
  });
});

describe("WaiterBrainV2 RC v1.6 — communication contract", () => {
  it("the reply always has a CTA / next step", () => {
    for (const message of BROAD_INTENTS) {
      const out = decide({ ...base, catalog: catalog(), message });
      expect(out.message).toMatch(CTA);
    }
  });

  it("the reply is short — no 'textão'", () => {
    for (const message of BROAD_INTENTS) {
      const out = decide({ ...base, catalog: catalog(), message });
      // human, seller tone: a couple of sentences, not a wall of text.
      expect(out.message.length).toBeLessThanOrEqual(240);
      expect(out.message.split("\n").length).toBeLessThanOrEqual(4);
    }
  });
});

describe("WaiterBrainV2 RC v1.6 — frozen UI surfaces", () => {
  it("the chat opening offers exactly ONE button: 'Quero uma sugestão'", () => {
    const opts = buildOpeningOptions();
    expect(opts).toHaveLength(1);
    expect(opts[0].label).toBe("Quero uma sugestão");
  });

  it("the 'Comprar novamente' UI is ENABLED (repeat flag on, by product request)", () => {
    const src = readFileSync(
      join(process.cwd(), "src/app/pedido/[slug]/PedidoClient.tsx"),
      "utf8",
    );
    // Reativado a pedido do lojista: categoria "Comprar novamente" + botão
    // "Pedir novamente" ao lado das sugestões.
    expect(src).toMatch(/const\s+REPEAT_ORDER_UI_ENABLED\s*=\s*true\s*;/);
  });
});
