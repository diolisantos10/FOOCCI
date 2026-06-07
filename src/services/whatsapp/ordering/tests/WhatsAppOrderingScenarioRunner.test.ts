import { describe, it, expect } from "vitest";
import {
  runScenario,
  runScenarioSuite,
  evaluateScenario,
  type WaScenarioStep,
} from "../WhatsAppOrderingScenarioRunner";
import {
  WHATSAPP_ORDERING_SCENARIOS,
  scenariosForSuite,
  type WaOrderingScenario,
} from "../testing/whatsappOrderingScenarios";
import { buildScenarioRunnerReport } from "@/lib/admin/waScenarioReport";
import type { WaMenuItem } from "../types";

// ── Menu fixture (ambiguous yakisoba + ambiguous coca) ──────────────────────────
const mk = (over: Partial<WaMenuItem> & Pick<WaMenuItem, "id" | "name" | "price">): WaMenuItem => ({
  priceDelivery: null, isActive: true, isAvailable: true, showInDelivery: true,
  hasVariants: false, variants: [], optionGroups: [], extras: [], ...over,
});

const MENU: WaMenuItem[] = [
  mk({ id: "yaki-cf",  name: "Yakisoba Carne e Frango", price: 32, priceDelivery: 34 }),
  mk({ id: "yaki-cam", name: "Yakisoba de Camarão",     price: 38, priceDelivery: 40 }),
  mk({ id: "coca",     name: "Coca-Cola",               price: 6,  priceDelivery: 6.5 }),
  mk({ id: "coca-z",   name: "Coca Zero",               price: 6,  priceDelivery: 6.5 }),
];

const CTX = { restaurantId: "r1", restaurantSlug: "test", menu: MENU };

const SMOKE_AMBIGUITY = WHATSAPP_ORDERING_SCENARIOS.find(s => s.id === "smoke-yakisoba-coca-ambiguity")!;

// ── A — session continuity ──────────────────────────────────────────────────────
describe("Scenario Runner — session continuity", () => {
  it("A — preserves session across messages (each step's previousStage = prior final stage)", async () => {
    const r = await runScenario(SMOKE_AMBIGUITY, CTX);
    expect(r.steps).toHaveLength(3);
    expect(r.steps[1]!.previousStage).toBe(r.steps[0]!.stage);
    expect(r.steps[2]!.previousStage).toBe(r.steps[1]!.stage);
    // None of the follow-ups restarted from IDLE
    expect(r.steps[1]!.previousStage).not.toBe("IDLE");
    const continuity = r.checks.find(c => c.label === "continuidade de sessão");
    expect(continuity?.severity).toBe("PASS");
  });
});

// ── B/C/D/E — yakisoba + coca scenario ──────────────────────────────────────────
describe("Scenario Runner — yakisoba + coca ambiguity", () => {
  it("B — resolves both items (yakisoba + coca present in final draft)", async () => {
    const r = await runScenario(SMOKE_AMBIGUITY, CTX);
    const names = r.finalItems.map(i => i.name.toLowerCase());
    expect(names.some(n => n.includes("yakisoba"))).toBe(true);
    expect(names.some(n => n.includes("coca"))).toBe(true);
    expect(r.verdict).not.toBe("FAIL");
  });

  it("C — 'carne e frango' is NOT parsed as new standalone items", async () => {
    const r = await runScenario(SMOKE_AMBIGUITY, CTX);
    const reparse = r.checks.find(c => c.label === "resposta não reinterpretada");
    expect(reparse?.severity).toBe("PASS");
    // No unresolved item literally named "carne" or "frango"
    const lastUnresolved = r.steps[r.steps.length - 1]!.unresolvedItems.map(u => u.rawText.toLowerCase());
    expect(lastUnresolved).not.toContain("carne");
    expect(lastUnresolved).not.toContain("frango");
  });

  it("D — quantity 2 is preserved on the resolved yakisoba", async () => {
    const r = await runScenario(SMOKE_AMBIGUITY, CTX);
    const yaki = r.finalItems.find(i => i.name.toLowerCase().includes("yakisoba"));
    expect(yaki?.quantity).toBe(2);
  });

  it("E — 'normal' resolves coca to the non-zero candidate (Coca-Cola)", async () => {
    const r = await runScenario(SMOKE_AMBIGUITY, CTX);
    const coca = r.finalItems.find(i => i.name.toLowerCase().includes("coca"));
    expect(coca?.name).toBe("Coca-Cola");
  });
});

// ── F — duplicate detection ──────────────────────────────────────────────────────
describe("Scenario Runner — evaluator: duplicate detection", () => {
  it("F — flags duplicate item lines as FAIL", () => {
    const dupStep: WaScenarioStep = {
      index: 0, message: "x", previousStage: "IDLE", stage: "COLLECTING_DELIVERY_TYPE",
      status: "AWAITING_CUSTOMER", intent: "ORDER_REQUEST", suggestedReply: "ok",
      matchedItems: [
        { name: "Coca-Cola", quantity: 1, lineTotal: 6 },
        { name: "Coca-Cola", quantity: 1, lineTotal: 6 },
      ],
      unresolvedItems: [], missingQuestions: [], actions: [],
      sideEffectsPerformed: [], order: null, paymentStub: false, paymentRealPix: false, estimatedTotal: 12,
    };
    const scenario = { menuDependent: false } as WaOrderingScenario;
    const checks = evaluateScenario(scenario, [dupStep]);
    const dup = checks.find(c => c.label === "sem itens duplicados");
    expect(dup?.severity).toBe("FAIL");
  });
});

// ── G — side-effect detection ────────────────────────────────────────────────────
describe("Scenario Runner — evaluator: side effects", () => {
  it("G — flags real side effects in dry-run as FAIL", () => {
    const badStep: WaScenarioStep = {
      index: 0, message: "x", previousStage: "IDLE", stage: "COMPLETED",
      status: "COMPLETED", intent: "PAYMENT_INFO", suggestedReply: "ok",
      matchedItems: [], unresolvedItems: [], missingQuestions: [], actions: ["CREATE_ORDER"],
      sideEffectsPerformed: ["order_created:abc123"],
      order: { orderId: "abc123", status: "PENDING", wouldCreate: true },
      paymentStub: false, paymentRealPix: true, estimatedTotal: 50,
    };
    const scenario = { menuDependent: false } as WaOrderingScenario;
    const checks = evaluateScenario(scenario, [badStep]);
    expect(checks.find(c => c.label === "sem efeitos colaterais")?.severity).toBe("FAIL");
    expect(checks.find(c => c.label === "sem pedido real")?.severity).toBe("FAIL");
    expect(checks.find(c => c.label === "sem Pix real")?.severity).toBe("FAIL");
  });
});

// ── H — report includes transcript ───────────────────────────────────────────────
describe("Scenario Runner — report", () => {
  it("H — full dry-run report includes the transcript and summary", async () => {
    const report = await runScenarioSuite("quick", { ...CTX, restaurantName: "Test" });
    const txt = buildScenarioRunnerReport(report);
    expect(txt).toContain("Scenario Runner");
    expect(txt).toContain("RESUMO DA BATERIA");
    // Transcript markers (→ cliente / ← agente)
    expect(txt).toContain("cliente");
    expect(txt).toContain("agente");
    expect(txt).toContain("quero 2 yakisoba e uma coca");
  });

  it("J — report shows pass/warn/fail counts and orders failed scenarios first", () => {
    const synthetic = {
      suite: "quick" as const,
      restaurant: { id: "r1", name: "Test", slug: "test" },
      ranAt: new Date().toISOString(),
      total: 2, pass: 1, warn: 0, fail: 1, score: 50,
      results: [
        { id: "f1", name: "Falha", category: "basic", description: "", messages: ["a"],
          verdict: "FAIL" as const, checks: [], steps: [], finalStage: "IDLE" as const,
          finalStatus: "ACTIVE" as const, finalItems: [], sideEffectsPerformed: [], durationMs: 1 },
        { id: "p1", name: "Sucesso", category: "basic", description: "", messages: ["b"],
          verdict: "PASS" as const, checks: [], steps: [], finalStage: "IDLE" as const,
          finalStatus: "ACTIVE" as const, finalItems: [], sideEffectsPerformed: [], durationMs: 1 },
      ],
    };
    const txt = buildScenarioRunnerReport(synthetic);
    expect(txt).toContain("pass");
    expect(txt).toContain("fail");
    // Failed scenario section appears before the passing one (titles uppercased)
    expect(txt.indexOf("FALHA")).toBeGreaterThanOrEqual(0);
    expect(txt.indexOf("FALHA")).toBeLessThan(txt.indexOf("SUCESSO"));
  });
});

// ── I — suites expose scenarios (data behind the UI buttons) ──────────────────────
describe("Scenario library — suites", () => {
  it("I — quick/full/edge/payment/all suites each return scenarios", () => {
    expect(scenariosForSuite("quick").length).toBeGreaterThan(0);
    expect(scenariosForSuite("full").length).toBeGreaterThan(0);
    expect(scenariosForSuite("edge").length).toBeGreaterThan(0);
    expect(scenariosForSuite("payment").length).toBeGreaterThan(0);
    expect(scenariosForSuite("all").length).toBe(WHATSAPP_ORDERING_SCENARIOS.length);
  });

  it("K — manual simulation path still works (menu injection, no DB)", async () => {
    const cocaScenario = WHATSAPP_ORDERING_SCENARIOS.find(s => s.id === "smoke-coca-zero-direct")!;
    const r = await runScenario(cocaScenario, CTX);
    expect(r.steps).toHaveLength(1);
    expect(r.steps[0]!.suggestedReply.length).toBeGreaterThan(0);
    expect(r.verdict).not.toBe("FAIL");
  });
});

// ── L/M — safety: no live routing / no real order/Pix/send ───────────────────────
describe("Scenario Runner — safety invariants", () => {
  it("L/M — running the quick suite performs no real side effects, orders, or Pix", async () => {
    const report = await runScenarioSuite("quick", { ...CTX, restaurantName: "Test" });
    for (const r of report.results) {
      expect(r.sideEffectsPerformed).toHaveLength(0);
      for (const s of r.steps) {
        expect(s.order?.orderId ?? null).toBeNull();
        expect(s.paymentRealPix).toBe(false);
      }
    }
    // No scenario fails the dry-run safety checks
    expect(report.fail).toBe(0);
  });

  it("every scenario in the library declares shouldCreateOrder/Pix/Send = false", () => {
    for (const s of WHATSAPP_ORDERING_SCENARIOS) {
      expect(s.shouldCreateOrder).toBe(false);
      expect(s.shouldCreatePix).toBe(false);
      expect(s.shouldSendWhatsApp).toBe(false);
    }
  });
});
