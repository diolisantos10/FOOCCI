/**
 * WhatsApp Text Ordering — Interrupt, item-cancel, and format-mismatch tests.
 * Tests A–K from "Fix live order flow" (WhatsApp REPLY_ONLY real test).
 *
 * Pure state-machine tests only (no DB, no network).
 */

import { describe, it, expect } from "vitest";
import { advanceSession } from "../WhatsAppOrderStateMachine";
import type { WaMenuItem, WaPersistedSession, WaOrderItem, WaUnresolvedItem } from "../types";

// ── Test menu ──────────────────────────────────────────────────────────────────
// Two Coca variants → "coca" triggers AMBIGUOUS with candidates [2L, Zero].
// No "lata" variant → "Coca lata" triggers format-mismatch message.

const YAKISOBA: WaMenuItem = {
  id: "yaki", name: "Yakisoba", price: 28.9, priceDelivery: 30.0,
  isActive: true, isAvailable: true, showInDelivery: true, hasVariants: false,
  variants: [],
  optionGroups: [{
    id: "g-tipo", name: "Tipo", required: true, minSelect: 1, maxSelect: 1,
    options: [
      { id: "o-frango", name: "Frango", price: 0, isAvailable: true },
      { id: "o-carne",  name: "Carne",  price: 2, isAvailable: true },
    ],
  }],
  extras: [],
};

const COCA_2L: WaMenuItem = {
  id: "coca2l", name: "Coca-Cola 2L", price: 12.0, priceDelivery: 12.0,
  isActive: true, isAvailable: true, showInDelivery: true, hasVariants: false,
  variants: [], optionGroups: [], extras: [],
};

const COCA_ZERO: WaMenuItem = {
  id: "cocazero", name: "Coca-Cola Zero", price: 8.0, priceDelivery: 8.0,
  isActive: true, isAvailable: true, showInDelivery: true, hasVariants: false,
  variants: [], optionGroups: [], extras: [],
};

const MENU = [YAKISOBA, COCA_2L, COCA_ZERO];

// ── Pre-built fixtures ─────────────────────────────────────────────────────────

const YAKI_ITEM: WaOrderItem = {
  rawText: "yakisoba", quantity: 1,
  menuItemId: "yaki", menuItemName: "Yakisoba",
  options: [{ groupId: "g-tipo", groupName: "Tipo", optionId: "o-frango", optionName: "Frango", price: 0 }],
  extras: [], unitPrice: 30.0, lineTotal: 30.0,
};

const COCA_UNRESOLVED: WaUnresolvedItem = {
  rawText: "coca", quantity: 1,
  reason: "AMBIGUOUS",
  candidates: ["Coca-Cola 2L", "Coca-Cola Zero"],
};

const FULL_ADDRESS = {
  street: "Rua das Flores", number: "123", neighborhood: "Centro",
  raw: "Rua das Flores 123 Centro",
};

const DELIVERY_QUOTE = { fee: 5.0, status: "ok" as const, reason: "calculated" };

function freshSession(over: Partial<WaPersistedSession> = {}): WaPersistedSession {
  const now = new Date();
  return {
    id: "s1", restaurantId: "r1", customerId: null, conversationId: null,
    phone: "+5511999990000",
    status: "ACTIVE", stage: "IDLE",
    selectedItems: [], unresolvedItems: [], missingQuestions: [],
    deliveryType: null, address: null, deliveryQuote: null,
    paymentMethod: null, paymentStatus: null,
    orderDraftId: null, orderId: null, pixPaymentId: null,
    mode: "ALLOWLIST_REPLY_ONLY", source: "webhook",
    metadata: null, lastMessageAt: now, expiresAt: null,
    createdAt: now, updatedAt: now, ...over,
  };
}

// ── A — COLLECTING_ADDRESS interrupted by add-item ──────────────────────────────

describe("A — COLLECTING_ADDRESS: add-item interrupt", () => {
  it("'Quero uma coca' while awaiting address queues Coca for disambiguation", () => {
    const s = freshSession({
      stage: "COLLECTING_ADDRESS",
      deliveryType: "DELIVERY",
      selectedItems: [YAKI_ITEM],
      missingQuestions: [],
    });
    const r = advanceSession(s, "Quero uma coca", MENU);

    // Engine interrupted — must NOT stay in address stage
    expect(r.session.stage).toBe("MATCHING_MENU");
    // Coca queued as unresolved (both Coca variants match)
    const cocaU = r.session.unresolvedItems.find(u => u.rawText.toLowerCase().includes("coca"));
    expect(cocaU?.reason).toBe("AMBIGUOUS");
    // Yakisoba preserved in the order
    expect(r.session.selectedItems.some(i => i.menuItemName === "Yakisoba")).toBe(true);
    // Reply asks which Coca using numbered options
    expect(r.suggestedReply.toLowerCase()).toContain("coca");
    expect(r.suggestedReply).toContain("1️⃣ ");
  });
});

// ── B — After resolving Coca ambiguity → returns to COLLECTING_ADDRESS ──────────

describe("B — Resolving Coca ambiguity returns to address collection", () => {
  it("numeric '1' selects Coca-Cola 2L and resumes address question", () => {
    const s = freshSession({
      stage: "MATCHING_MENU",
      deliveryType: "DELIVERY",
      selectedItems: [YAKI_ITEM],
      unresolvedItems: [COCA_UNRESOLVED],
      missingQuestions: [],
      metadata: { cartFinalized: true },
    });
    const r = advanceSession(s, "1", MENU);

    // Coca-Cola 2L added, no more unresolved items
    expect(r.session.unresolvedItems.length).toBe(0);
    expect(r.session.selectedItems.some(i => i.menuItemName === "Yakisoba")).toBe(true);
    expect(r.session.selectedItems.some(i => i.menuItemName === "Coca-Cola 2L")).toBe(true);
    // Resumes address collection (delivery type set, no address yet)
    expect(r.session.stage).toBe("COLLECTING_ADDRESS");
    expect(r.suggestedReply.toLowerCase()).toMatch(/cep|endere/);
  });
});

// ── C — COLLECTING_PAYMENT_METHOD interrupted by add-item ─────────────────────

describe("C — COLLECTING_PAYMENT_METHOD: add-item interrupt", () => {
  it("'Quero uma coca' while awaiting payment queues Coca for disambiguation", () => {
    const s = freshSession({
      stage: "COLLECTING_PAYMENT_METHOD",
      deliveryType: "DELIVERY",
      deliveryQuote: DELIVERY_QUOTE,
      address: FULL_ADDRESS,
      selectedItems: [YAKI_ITEM],
      missingQuestions: [],
    });
    const r = advanceSession(s, "Quero uma coca", MENU);

    // Must NOT stay in payment stage
    expect(r.session.stage).toBe("MATCHING_MENU");
    const cocaU = r.session.unresolvedItems.find(u => u.rawText.toLowerCase().includes("coca"));
    expect(cocaU?.reason).toBe("AMBIGUOUS");
    // Yakisoba preserved
    expect(r.session.selectedItems.some(i => i.menuItemName === "Yakisoba")).toBe(true);
    // Reply asks which Coca
    expect(r.suggestedReply.toLowerCase()).toContain("coca");
  });
});

// ── D — "Não quero mais" during ambiguity cancels only pending item ─────────────

describe("D — 'Não quero mais' during Coca ambiguity cancels only Coca", () => {
  it("cancel phrase removes Coca from unresolvedItems; order NOT cancelled", () => {
    const s = freshSession({
      stage: "MATCHING_MENU",
      deliveryType: "DELIVERY",
      deliveryQuote: DELIVERY_QUOTE,
      address: FULL_ADDRESS,
      selectedItems: [YAKI_ITEM],
      unresolvedItems: [COCA_UNRESOLVED],
      missingQuestions: [],
      metadata: { cartFinalized: true },
    });
    const r = advanceSession(s, "Não quero mais", MENU);

    expect(r.session.unresolvedItems.length).toBe(0);
    expect(r.session.status).not.toBe("CANCELLED");
    expect(r.session.stage).not.toBe("CANCELLED");
    // Acknowledgement mentions the cancelled item
    expect(r.suggestedReply.toLowerCase()).toContain("coca");
  });
});

// ── E — Cancelling Coca preserves Yakisoba and delivery fee ───────────────────

describe("E — After cancelling Coca, Yakisoba and delivery fee are preserved", () => {
  it("selectedItems still contains Yakisoba; deliveryQuote fee = 5; total = 35", () => {
    const s = freshSession({
      stage: "MATCHING_MENU",
      deliveryType: "DELIVERY",
      deliveryQuote: DELIVERY_QUOTE,
      address: FULL_ADDRESS,
      selectedItems: [YAKI_ITEM],
      unresolvedItems: [COCA_UNRESOLVED],
      missingQuestions: [],
      metadata: { cartFinalized: true },
    });
    const r = advanceSession(s, "Não quero mais", MENU);

    expect(r.session.selectedItems.some(i => i.menuItemName === "Yakisoba")).toBe(true);
    expect(r.session.selectedItems.some(i => i.menuItemName.toLowerCase().includes("coca"))).toBe(false);
    expect(r.session.deliveryQuote?.fee).toBe(5.0);
    // Comanda total: Yakisoba 30.00 + delivery 5.00 = 35.00
    expect(r.suggestedReply).toContain("35.00");
  });
});

// ── F — After cancelling Coca, flow resumes at payment collection ──────────────

describe("F — After cancelling Coca, flow asks for payment method", () => {
  it("stage = COLLECTING_PAYMENT_METHOD after item cancel when address + delivery already set", () => {
    const s = freshSession({
      stage: "MATCHING_MENU",
      deliveryType: "DELIVERY",
      deliveryQuote: DELIVERY_QUOTE,
      address: FULL_ADDRESS,
      selectedItems: [YAKI_ITEM],
      unresolvedItems: [COCA_UNRESOLVED],
      missingQuestions: [],
      metadata: { cartFinalized: true },
    });
    const r = advanceSession(s, "Não quero mais", MENU);

    expect(r.session.stage).toBe("COLLECTING_PAYMENT_METHOD");
    expect(r.suggestedReply.toLowerCase()).toMatch(/pix|cart[aã]o|dinheiro/);
  });
});

// ── G — Format mismatch: "Coca lata" when only 2L/Zero available ───────────────

describe("G — Format mismatch: 'Coca lata' when no lata variant exists", () => {
  it("replies with format-not-available message and shows numbered options", () => {
    const s = freshSession({
      stage: "MATCHING_MENU",
      deliveryType: "DELIVERY",
      selectedItems: [YAKI_ITEM],
      unresolvedItems: [COCA_UNRESOLVED],
      missingQuestions: [],
    });
    const r = advanceSession(s, "Coca lata", MENU);

    // Coca still unresolved (no lata variant → no resolution)
    expect(r.session.unresolvedItems.length).toBeGreaterThan(0);
    // Format-mismatch message (not generic "Não entendi")
    expect(r.suggestedReply.toLowerCase()).toContain("versão");
    // Shows numbered options
    expect(r.suggestedReply).toContain("1️⃣ ");
    expect(r.suggestedReply).toContain("2️⃣ ");
  });
});

// ── H — Numeric "Deixar sem X" option cancels pending item ────────────────────

describe("H — Numeric '3' (Deixar sem Coca) cancels pending Coca", () => {
  it("sending '3' when 2 candidates exist + draft selects Deixar sem Coca", () => {
    const s = freshSession({
      stage: "MATCHING_MENU",
      deliveryType: "DELIVERY",
      deliveryQuote: DELIVERY_QUOTE,
      address: FULL_ADDRESS,
      selectedItems: [YAKI_ITEM],
      unresolvedItems: [COCA_UNRESOLVED],
      missingQuestions: [],
      metadata: { cartFinalized: true },
    });
    const r = advanceSession(s, "3", MENU);

    // Coca removed from unresolved (option 3 = Deixar sem Coca)
    expect(r.session.unresolvedItems.length).toBe(0);
    // Whole order NOT cancelled
    expect(r.session.status).not.toBe("CANCELLED");
    // Yakisoba preserved
    expect(r.session.selectedItems.some(i => i.menuItemName === "Yakisoba")).toBe(true);
    expect(r.session.selectedItems.some(i => i.menuItemName.toLowerCase().includes("coca"))).toBe(false);
    // Flow advanced to payment
    expect(r.session.stage).toBe("COLLECTING_PAYMENT_METHOD");
  });
});

// ── I — "cancelar pedido" during ambiguity cancels whole order ────────────────

describe("I — 'cancelar' during ambiguity cancels the whole order (CANCEL_RE)", () => {
  it("'cancela' matches CANCEL_RE and cancels the entire order even during ambiguity", () => {
    const s = freshSession({
      stage: "MATCHING_MENU",
      selectedItems: [YAKI_ITEM],
      unresolvedItems: [COCA_UNRESOLVED],
      missingQuestions: [],
    });
    // "cancela" is in CANCEL_RE → global handler → whole order cancelled.
    // Item-level cancel only happens via CANCEL_ITEM_RE phrases ("não quero",
    // "não quero mais", etc.) which flow through the stage dispatch.
    const r = advanceSession(s, "cancela", MENU);

    expect(r.session.status).toBe("CANCELLED");
    expect(r.session.stage).toBe("CANCELLED");
    expect(r.intent).toBe("CANCEL");
    expect(r.suggestedReply.toLowerCase()).toContain("cancelado");
  });
});

// ── J — State machine flow completes; side-effect gating is the runtime's job ─

describe("J — Full flow: state machine schedules deferred actions; runtime gates them", () => {
  it("pix selection schedules CREATE_ORDER+GENERATE_PIX; state machine does not execute them", () => {
    // The state machine is mode-agnostic. It always schedules deferred actions.
    // WhatsAppTextOrderService.processCustomerMessage() receives allowSideEffects=false
    // in ALLOWLIST_REPLY_ONLY mode and skips CREATE_ORDER/GENERATE_PIX execution.
    let s = freshSession({ mode: "ALLOWLIST_REPLY_ONLY" });

    s = advanceSession(s, "quero yakisoba", MENU).session;
    expect(s.stage).toBe("COLLECTING_REQUIRED_OPTIONS");

    s = advanceSession(s, "frango", MENU).session;
    expect(s.stage).toBe("BUILDING_CART");

    s = advanceSession(s, "9", MENU).session;
    expect(s.stage).toBe("COLLECTING_DELIVERY_TYPE");

    s = advanceSession(s, "retirada", MENU).session;
    expect(s.stage).toBe("COLLECTING_PAYMENT_METHOD");

    const r = advanceSession(s, "pix", MENU);
    // Deferred actions are present (runtime decides whether to execute)
    expect(r.actions).toContain("CREATE_ORDER");
    expect(r.actions).toContain("GENERATE_PIX");
    // Flow reached terminal stage
    expect(r.session.stage).toBe("READY_TO_CREATE_ORDER");
  });
});

// ── K — TypeScript contract: advanceSession accepts WaMenuItem[] ──────────────

describe("K — TypeScript: advanceSession signature accepts WaMenuItem[] as third argument", () => {
  it("call compiles and returns a valid AdvanceResult", () => {
    const s = freshSession();
    const r = advanceSession(s, "quero yakisoba", MENU);
    expect(r).toBeDefined();
    expect(typeof r.suggestedReply).toBe("string");
    expect(Array.isArray(r.actions)).toBe(true);
    expect(typeof r.handoff).toBe("boolean");
  });
});
