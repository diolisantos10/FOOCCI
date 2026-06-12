/**
 * WhatsApp Text Ordering — W8 regression tests.
 *
 * Closes the false-positive gaps found after W7:
 *  - mixed one-line orders must capture items + delivery + payment (never return
 *    to "what would you like to order?")
 *  - menu questions must be classified as QUESTION and never run the whole
 *    sentence through the product matcher
 *  - "carne e frango" must resolve Yakisoba Carne e Frango directly, even when a
 *    separate "Frango Empanado" exists (no bogus "Frango" ambiguity)
 *  - add / change-item / change-quantity flows mutate the draft correctly
 *  - the evaluator FAILS weak behavior instead of passing it
 *
 * Pure tests — menu fixtures injected, no DB, no network, no side effects.
 */

import { describe, it, expect } from "vitest";
import { advanceSession } from "../WhatsAppOrderStateMachine";
import {
  runScenario,
  runScenarioSuite,
  evaluateScenario,
  type WaScenarioStep,
} from "../WhatsAppOrderingScenarioRunner";
import {
  WHATSAPP_ORDERING_SCENARIOS,
  type WaOrderingScenario,
} from "../testing/whatsappOrderingScenarios";
import type { WaMenuItem, WaPersistedSession } from "../types";

// ── Menu fixture: includes a separate "Frango Empanado" to reproduce the bug ────
const mk = (over: Partial<WaMenuItem> & Pick<WaMenuItem, "id" | "name" | "price">): WaMenuItem => ({
  priceDelivery: null, isActive: true, isAvailable: true, showInDelivery: true,
  hasVariants: false, variants: [], optionGroups: [], extras: [], ...over,
});

const MENU: WaMenuItem[] = [
  mk({ id: "yaki-cf",  name: "Yakisoba Carne e Frango", price: 32, priceDelivery: 34 }),
  mk({ id: "yaki-cam", name: "Yakisoba de Camarão",     price: 38, priceDelivery: 40 }),
  mk({ id: "frango",   name: "Frango Empanado",         price: 20, priceDelivery: 22 }),
  mk({ id: "coca",     name: "Coca-Cola",               price: 6,  priceDelivery: 6.5 }),
  mk({ id: "coca-z",   name: "Coca Zero",               price: 6,  priceDelivery: 6.5 }),
];

const CTX = { restaurantId: "r1", restaurantSlug: "test", menu: MENU };

function freshSession(over: Partial<WaPersistedSession> = {}): WaPersistedSession {
  const now = new Date();
  return {
    id: "s1", restaurantId: "r1", customerId: null, conversationId: null, phone: "+5511999990000",
    status: "ACTIVE", stage: "IDLE", selectedItems: [], unresolvedItems: [], missingQuestions: [],
    deliveryType: null, address: null, deliveryQuote: null, paymentMethod: null, paymentStatus: null,
    orderDraftId: null, orderId: null, pixPaymentId: null, mode: "DRY_RUN_ONLY", source: "admin_test",
    metadata: null, lastMessageAt: now, expiresAt: null, createdAt: now, updatedAt: now, ...over,
  };
}

const byId = (id: string) => WHATSAPP_ORDERING_SCENARIOS.find(s => s.id === id)!;

// ── A/B — mixed one-line order ──────────────────────────────────────────────────
describe("W8 — mixed one-line order", () => {
  it("A — does NOT return to IDLE asking what to order", async () => {
    const r = await runScenario(byId("edge-mixed-order-one-line"), CTX);
    expect(r.finalStage).not.toBe("IDLE");
    expect(r.finalStage).toBe("COLLECTING_ADDRESS");
    expect(r.steps[0]!.suggestedReply.toLowerCase()).not.toMatch(/me diz o que (vai|quer)/);
    expect(r.steps[0]!.suggestedReply.toLowerCase()).toMatch(/cep|endereço/);
  });

  it("B — captures products, delivery type and payment method", async () => {
    const r = await runScenario(byId("edge-mixed-order-one-line"), CTX);
    const names = r.finalItems.map(i => i.name.toLowerCase());
    expect(names.some(n => n.includes("yakisoba"))).toBe(true);
    expect(names.some(n => n.includes("coca"))).toBe(true);
    const last = r.steps[r.steps.length - 1]!;
    expect(last.deliveryType).toBe("DELIVERY");
    expect(last.paymentMethod).toBe("PIX");
    expect(r.verdict).not.toBe("FAIL");
  });
});

// ── C/D — menu question ─────────────────────────────────────────────────────────
describe("W8 — menu question", () => {
  it("C — is classified as QUESTION and builds no draft", async () => {
    const r = await runScenario(byId("edge-menu-question"), CTX);
    expect(r.steps[0]!.intent).toBe("QUESTION");
    expect(r.finalItems).toHaveLength(0);
    expect(r.verdict).not.toBe("FAIL");
  });

  it("D — reply does not quote the full sentence as a missing product", async () => {
    const r = await runScenario(byId("edge-menu-question"), CTX);
    const reply = r.steps[0]!.suggestedReply;
    expect(reply).not.toMatch(/n[ãa]o encontrei "[^"]+" no card[aá]pio/i);
    expect(reply.toLowerCase()).toContain("não encontrei yakisoba vegetariano");
    expect(reply.toLowerCase()).toContain("atendente");
  });
});

// ── E/F — "carne e frango" resolves directly (no Frango Empanado ambiguity) ─────
describe("W8 — carne e frango resolution", () => {
  it("E — 'quero um yakisoba carne e frango' resolves Yakisoba Carne e Frango", () => {
    const r = advanceSession(freshSession(), "quero um yakisoba carne e frango", MENU);
    expect(r.session.selectedItems).toHaveLength(1);
    expect(r.session.selectedItems[0]!.menuItemName).toBe("Yakisoba Carne e Frango");
    expect(r.session.unresolvedItems).toHaveLength(0);
    expect(r.session.stage).toBe("COLLECTING_DELIVERY_TYPE");
  });

  it("F — does NOT ask about 'Frango Empanado'", () => {
    const r = advanceSession(freshSession(), "quero um yakisoba carne e frango", MENU);
    expect(r.suggestedReply).not.toMatch(/frango empanado/i);
    expect(r.suggestedReply.toLowerCase()).not.toContain("qual você quer");
  });
});

// ── G — add item ─────────────────────────────────────────────────────────────────
describe("W8 — add item", () => {
  it("G — adds a second Coca without dropping the first", async () => {
    const r = await runScenario(byId("full-add-item"), CTX);
    const names = r.finalItems.map(i => i.name.toLowerCase());
    expect(r.finalItems).toHaveLength(2);
    expect(names.some(n => n.includes("coca-cola") || n === "coca cola")).toBe(true);
    expect(names.some(n => n.includes("zero"))).toBe(true);
    expect(r.steps[r.steps.length - 1]!.suggestedReply).toMatch(/Adicionei/i);
    expect(r.verdict).not.toBe("FAIL");
  });
});

// ── H — change item ──────────────────────────────────────────────────────────────
describe("W8 — change item", () => {
  it("H — replaces Yakisoba de Camarão with Yakisoba Carne e Frango", async () => {
    const r = await runScenario(byId("full-change-item"), CTX);
    expect(r.finalItems).toHaveLength(1);
    expect(r.finalItems[0]!.name).toBe("Yakisoba Carne e Frango");
    expect(r.finalItems.some(i => /camar/i.test(i.name))).toBe(false);
    expect(r.steps[r.steps.length - 1]!.suggestedReply).toMatch(/Troquei para Yakisoba Carne e Frango/i);
    expect(r.verdict).not.toBe("FAIL");
  });
});

// ── I — change quantity ──────────────────────────────────────────────────────────
describe("W8 — change quantity", () => {
  it("I — updates quantity from 2 to 1 without creating a new line", async () => {
    const r = await runScenario(byId("full-change-quantity"), CTX);
    expect(r.finalItems).toHaveLength(1);
    expect(r.finalItems[0]!.quantity).toBe(1);
    expect(r.steps[r.steps.length - 1]!.suggestedReply).toMatch(/Atualizei para 1 unidade/i);
  });
});

// ── J — cash + change parsed and stored (pickup avoids delivery I/O) ─────────────
describe("W8 — cash with change", () => {
  it("J — parses payment method CASH and change R$ 100", () => {
    let s = advanceSession(freshSession(), "quero um yakisoba carne e frango", MENU).session;
    s = advanceSession(s, "retirada", MENU).session;
    const r = advanceSession(s, "dinheiro, troco para 100", MENU);
    expect(r.session.paymentMethod).toBe("CASH");
    expect(r.session.metadata?.changeFor).toBe(100);
  });
});

// ── K/L/M — evaluator strictness ────────────────────────────────────────────────
describe("W8 — evaluator strictness", () => {
  const baseStep = (over: Partial<WaScenarioStep>): WaScenarioStep => ({
    index: 0, message: "x", previousStage: "IDLE", stage: "IDLE",
    status: "ACTIVE", intent: "ORDER_REQUEST", suggestedReply: "ok",
    matchedItems: [], unresolvedItems: [], missingQuestions: [], actions: [],
    sideEffectsPerformed: [], order: null, paymentStub: false, paymentRealPix: false,
    estimatedTotal: 0, deliveryType: null, paymentMethod: null, cashChange: null, hasAddress: false,
    ...over,
  });

  it("K — FAILS when an expected item is missing (non-menu-dependent)", () => {
    const scenario = { menuDependent: false, expectedItems: [{ name: "sushi" }] } as WaOrderingScenario;
    const checks = evaluateScenario(scenario, [baseStep({ matchedItems: [] })]);
    expect(checks.find(c => c.label === 'item "sushi"')?.severity).toBe("FAIL");
  });

  it("L — FAILS when a clear mixed order ends at IDLE asking what to order", () => {
    const scenario = { menuDependent: true } as WaOrderingScenario;
    const step = baseStep({
      message: "2 yakisoba, entrega, pix",
      stage: "IDLE",
      suggestedReply: "Certo! Me diz o que vai querer pedir.",
      matchedItems: [],
    });
    const checks = evaluateScenario(scenario, [step]);
    expect(checks.find(c => c.label === "não ignora pedido claro")?.severity).toBe("FAIL");
  });

  it("M — FAILS when real side effects appear in dry-run", () => {
    const scenario = { menuDependent: false } as WaOrderingScenario;
    const step = baseStep({
      stage: "COMPLETED", status: "COMPLETED",
      sideEffectsPerformed: ["order_created:xyz"],
      order: { orderId: "xyz", status: "PENDING", wouldCreate: true },
      paymentRealPix: true,
    });
    const checks = evaluateScenario(scenario, [step]);
    expect(checks.find(c => c.label === "sem efeitos colaterais")?.severity).toBe("FAIL");
    expect(checks.find(c => c.label === "sem pedido real")?.severity).toBe("FAIL");
    expect(checks.find(c => c.label === "sem Pix real")?.severity).toBe("FAIL");
  });

  it("also FAILS when a question is quoted as a missing product (regression guard)", () => {
    const scenario = { menuDependent: false } as WaOrderingScenario;
    const step = baseStep({
      message: "vocês têm yakisoba vegetariano?",
      suggestedReply: 'Não encontrei "vocês têm yakisoba vegetariano" no cardápio. Pode confirmar o nome?',
    });
    const checks = evaluateScenario(scenario, [step]);
    expect(checks.find(c => c.label === "pergunta não vira produto")?.severity).toBe("FAIL");
  });
});

// ── N/O — suite stays healthy and side-effect free ──────────────────────────────
// Note: the "edge" + "quick" suites cover the W8 fixes without triggering the
// delivery-quote I/O (DB) that the address-bearing "full" scenarios need; those
// are exercised against a real menu via the admin API route.
describe("W8 — suite health & safety", () => {
  it("N — edge & quick suites score high after the fixes", async () => {
    const edge  = await runScenarioSuite("edge",  { ...CTX, restaurantName: "Test" });
    const quick = await runScenarioSuite("quick", { ...CTX, restaurantName: "Test" });
    expect(edge.fail).toBe(0);
    expect(quick.fail).toBe(0);
    expect(edge.score).toBeGreaterThanOrEqual(90);
    expect(quick.score).toBeGreaterThanOrEqual(90);
  });

  it("O — no scenario performs real routing / orders / Pix", async () => {
    for (const suite of ["edge", "quick"] as const) {
      const report = await runScenarioSuite(suite, { ...CTX, restaurantName: "Test" });
      for (const r of report.results) {
        expect(r.sideEffectsPerformed).toHaveLength(0);
        for (const s of r.steps) {
          expect(s.order?.orderId ?? null).toBeNull();
          expect(s.paymentRealPix).toBe(false);
        }
      }
    }
  });
});
