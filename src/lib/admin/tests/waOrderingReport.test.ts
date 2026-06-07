import { describe, it, expect } from "vitest";
import {
  buildWaOrderingReport,
  deriveMatchStatus,
  type WaOrderingReportResult,
} from "../waOrderingReport";

// ── Fixtures ──────────────────────────────────────────────────────────────────

function baseResult(over: Partial<WaOrderingReportResult> = {}): WaOrderingReportResult {
  return {
    stage:   "MATCHING_MENU",
    intent:  "ORDER_REQUEST",
    session: {
      status: "AWAITING_CUSTOMER", stage: "MATCHING_MENU", deliveryType: null,
      paymentMethod: null, paymentStatus: null, orderId: null,
    },
    parsedItems:      [],
    matchedItems:     [],
    unresolvedItems:  [],
    missingQuestions: [],
    draft:            null,
    deliveryQuote:    null,
    payment:          null,
    estimatedTotal:   0,
    suggestedReply:   "",
    operatorSummary:  "",
    safetyNotes:      ["dry-run — nenhuma mensagem WhatsApp enviada por este serviço"],
    sideEffectsPerformed: [],
    handoff:          false,
    ...over,
  };
}

const meta = { restaurant: "Sushi Cazza", slug: "sushi-cazza", phone: "+5511940595223", mode: "DRY_RUN_ONLY", messageText: "quero 2 yakisoba e uma coca" };

// "quero 2 yakisoba e uma coca" scenario: yakisoba matched (needs flavor), coca matched
const yakisobaCocaResult = baseResult({
  parsedItems: [
    { rawText: "2 yakisoba", quantity: 2, name: "yakisoba" },
    { rawText: "uma coca",   quantity: 1, name: "coca" },
  ],
  matchedItems: [
    { quantity: 2, menuItemName: "Yakisoba", unitPrice: 32, lineTotal: 64, options: [] },
    { quantity: 1, menuItemName: "Coca-Cola", unitPrice: 7, lineTotal: 7, options: [] },
  ],
  missingQuestions: [
    { itemName: "Yakisoba", groupName: "Sabor", options: ["Frango", "Carne", "Misto"] },
  ],
  draft: {
    subtotal: 71,
    items: [
      { name: "Yakisoba", quantity: 2, options: [], lineTotal: 64 },
      { name: "Coca-Cola", quantity: 1, options: [], lineTotal: 7 },
    ],
    missingRequirements: ["Yakisoba: Sabor"],
  },
  estimatedTotal: 71,
  suggestedReply: "Perfeito. Para o Yakisoba, qual sabor? (Frango, Carne, Misto)",
  stage: "COLLECTING_REQUIRED_OPTIONS",
  session: { status: "AWAITING_CUSTOMER", stage: "COLLECTING_REQUIRED_OPTIONS", deliveryType: null, paymentMethod: null, paymentStatus: null, orderId: null },
});

// ── A — parsed items in report ─────────────────────────────────────────────────
describe("buildWaOrderingReport — parsed items", () => {
  it("A1 — includes parsed items section with quantities and names", () => {
    const txt = buildWaOrderingReport(yakisobaCocaResult, meta);
    expect(txt).toContain("ITENS INTERPRETADOS");
    expect(txt).toContain("2x yakisoba");
    expect(txt).toContain("1x coca");
  });

  it("A2 — shows empty state when no items parsed", () => {
    const txt = buildWaOrderingReport(baseResult(), meta);
    expect(txt).toContain("Sem itens interpretados");
  });
});

// ── B — menu matches in report ─────────────────────────────────────────────────
describe("buildWaOrderingReport — menu matches", () => {
  it("B1 — lists matched products with status", () => {
    const txt = buildWaOrderingReport(yakisobaCocaResult, meta);
    expect(txt).toContain("CORRESPONDÊNCIAS NO CARDÁPIO");
    expect(txt).toContain("Yakisoba");
    expect(txt).toContain("Coca-Cola");
    expect(txt).toContain("NEEDS_REQUIRED_OPTION"); // yakisoba needs flavor
    expect(txt).toContain("RESOLVED");              // coca fully resolved
  });

  it("B2 — empty state when nothing matched", () => {
    const txt = buildWaOrderingReport(baseResult(), meta);
    expect(txt).toContain("Nenhum produto encontrado");
  });

  it("B3 — unresolved items shown with reason and candidates", () => {
    const r = baseResult({
      parsedItems: [{ rawText: "coca", quantity: 1, name: "coca" }],
      unresolvedItems: [{ rawText: "coca", quantity: 1, reason: "AMBIGUOUS", candidates: ["Coca lata", "Coca 2L"] }],
    });
    const txt = buildWaOrderingReport(r, meta);
    expect(txt).toContain("AMBIGUOUS");
    expect(txt).toContain("Coca lata");
    expect(txt).toContain("Coca 2L");
  });
});

// ── C — missing questions in report ────────────────────────────────────────────
describe("buildWaOrderingReport — missing questions", () => {
  it("C1 — includes pending question and options", () => {
    const txt = buildWaOrderingReport(yakisobaCocaResult, meta);
    expect(txt).toContain("PERGUNTAS PENDENTES");
    expect(txt).toContain("Sabor");
    expect(txt).toContain("Frango");
  });

  it("C2 — empty state when no pending questions", () => {
    const txt = buildWaOrderingReport(baseResult(), meta);
    expect(txt).toContain("Nenhuma pergunta pendente");
  });
});

// ── D — suggested reply in report ──────────────────────────────────────────────
describe("buildWaOrderingReport — suggested reply", () => {
  it("D1 — includes the exact suggested reply", () => {
    const txt = buildWaOrderingReport(yakisobaCocaResult, meta);
    expect(txt).toContain("RESPOSTA SUGERIDA");
    expect(txt).toContain("Perfeito. Para o Yakisoba, qual sabor?");
  });
});

// ── E — comanda/draft in report ────────────────────────────────────────────────
describe("buildWaOrderingReport — comanda", () => {
  it("E1 — includes draft rows, subtotal and total when items matched", () => {
    const txt = buildWaOrderingReport(yakisobaCocaResult, meta);
    expect(txt).toContain("COMANDA");
    expect(txt).toContain("R$ 71.00"); // subtotal/total
    expect(txt).toContain("incompleto"); // missingRequirements present
  });

  it("E2 — no comanda section when no draft", () => {
    const txt = buildWaOrderingReport(baseResult(), meta);
    expect(txt).not.toContain("COMANDA");
  });
});

// ── G — unknown item surfaces in report ────────────────────────────────────────
describe("buildWaOrderingReport — unknown item", () => {
  it("G1 — unknown product appears as UNKNOWN with NOT_FOUND reason", () => {
    const r = baseResult({
      parsedItems: [{ rawText: "pizza", quantity: 1, name: "pizza" }],
      unresolvedItems: [{ rawText: "pizza", quantity: 1, reason: "NOT_FOUND", candidates: [] }],
      suggestedReply: 'Não encontrei "pizza" no cardápio. Pode confirmar o nome?',
    });
    const txt = buildWaOrderingReport(r, meta);
    expect(txt).toContain("UNKNOWN");
    expect(txt).toContain("Não encontrei");
  });
});

// ── H/I — safety notes & no side effects in dry-run ────────────────────────────
describe("buildWaOrderingReport — safety", () => {
  it("H1 — dry-run report states no real side effects", () => {
    const txt = buildWaOrderingReport(yakisobaCocaResult, meta);
    expect(txt).toContain("NOTAS DE SEGURANÇA");
    expect(txt).toContain("nenhum efeito colateral real executado");
  });

  it("I1 — masks phone in header", () => {
    const txt = buildWaOrderingReport(yakisobaCocaResult, meta);
    expect(txt).not.toContain("9405");
    expect(txt).toContain("5223");
  });

  it("I2 — surfaces real side effects when present", () => {
    const r = baseResult({ sideEffectsPerformed: ["order_created:abc123"] });
    const txt = buildWaOrderingReport(r, meta);
    expect(txt).toContain("efeitos reais: order_created:abc123");
  });
});

// ── deriveMatchStatus unit ─────────────────────────────────────────────────────
describe("deriveMatchStatus", () => {
  it("returns RESOLVED when no pending question", () => {
    expect(deriveMatchStatus({ menuItemName: "Coca-Cola" }, [])).toBe("RESOLVED");
  });
  it("returns NEEDS_VARIANT for a size/variant question", () => {
    expect(deriveMatchStatus({ menuItemName: "Combinado" }, [
      { itemName: "Combinado", groupName: "Tamanho/Variante", options: ["P", "G"] },
    ])).toBe("NEEDS_VARIANT");
  });
  it("returns NEEDS_REQUIRED_OPTION for a required option question", () => {
    expect(deriveMatchStatus({ menuItemName: "Yakisoba" }, [
      { itemName: "Yakisoba", groupName: "Sabor", options: ["Frango"] },
    ])).toBe("NEEDS_REQUIRED_OPTION");
  });
});
