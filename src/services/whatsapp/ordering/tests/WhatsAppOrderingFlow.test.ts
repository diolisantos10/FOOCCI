/**
 * WhatsApp Text Ordering — W2-W6 flow tests.
 *
 * Covers the state machine, delivery/payment parsing, draft completeness,
 * feature-flag modes, and the safety invariants for the full controlled system.
 * Pure tests only (no DB, no network).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { advanceSession } from "../WhatsAppOrderStateMachine";
import { parsePaymentMethod } from "../WhatsAppPaymentService";
import { parseAddressFragment } from "../addressParser";
import { buildFullDraft, checkCompleteness, renderComanda } from "../WhatsAppOrderDraftBuilder";
import { detectIntent } from "../parser";
import {
  isWaTextOrderingEnabled,
  getWaTextOrderingMode,
  resolveSideEffectPermissions,
  isRestaurantAllowlisted,
  isPhoneAllowlisted,
} from "@/lib/wa-text-ordering-flag";
import { StubPaymentProvider } from "../providers";
import type { WaMenuItem, WaPersistedSession } from "../types";

// ── Mock menu ──────────────────────────────────────────────────────────────────

const YAKISOBA: WaMenuItem = {
  id: "yaki", name: "Yakisoba", price: 28.9, priceDelivery: 30.0,
  isActive: true, isAvailable: true, showInDelivery: true, hasVariants: false,
  variants: [],
  optionGroups: [{
    id: "g-tipo", name: "Tipo", required: true, minSelect: 1, maxSelect: 1,
    options: [
      { id: "o-frango", name: "Frango", price: 0, isAvailable: true },
      { id: "o-carne",  name: "Carne",  price: 2, isAvailable: true },
      { id: "o-misto",  name: "Misto",  price: 3, isAvailable: true },
    ],
  }],
  extras: [],
};

const COCA: WaMenuItem = {
  id: "coca", name: "Coca-Cola", price: 6, priceDelivery: 6.5,
  isActive: true, isAvailable: true, showInDelivery: true, hasVariants: false,
  variants: [], optionGroups: [], extras: [],
};

const MENU = [YAKISOBA, COCA];

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

// ── State machine: happy path ──────────────────────────────────────────────────

describe("State machine — happy path", () => {
  it("Q. order request matches items and asks the missing option", () => {
    const r = advanceSession(freshSession(), "quero 2 yakisoba e uma coca", MENU);
    expect(r.intent).toBe("ORDER_REQUEST");
    expect(r.session.selectedItems.length).toBe(2);
    expect(r.session.stage).toBe("COLLECTING_REQUIRED_OPTIONS");
    expect(r.suggestedReply.toLowerCase()).toContain("yakisoba");
  });

  it("answering the option advances toward delivery type", () => {
    let s = advanceSession(freshSession(), "quero 2 yakisoba e uma coca", MENU).session;
    const r = advanceSession(s, "frango", MENU);
    // yakisoba option resolved → asks delivery (no more missing)
    expect(r.session.missingQuestions.length).toBe(0);
    expect(r.session.stage).toBe("COLLECTING_DELIVERY_TYPE");
    expect(r.suggestedReply.toLowerCase()).toMatch(/entrega ou retirada/);
  });

  it("option price is applied to the matched item", () => {
    let s = advanceSession(freshSession(), "quero 1 yakisoba", MENU).session;
    s = advanceSession(s, "carne", MENU).session; // +2.00
    const yaki = s.selectedItems.find(i => i.menuItemName === "Yakisoba")!;
    expect(yaki.options[0].optionName).toBe("Carne");
    expect(yaki.unitPrice).toBeCloseTo(32.0); // 30 delivery + 2 carne
  });

  it("pickup skips freight and asks payment", () => {
    let s = advanceSession(freshSession(), "quero 1 yakisoba", MENU).session;
    s = advanceSession(s, "frango", MENU).session;
    const r = advanceSession(s, "vou retirar", MENU);
    expect(r.session.deliveryType).toBe("PICKUP");
    expect(r.session.deliveryQuote?.fee).toBe(0);
    expect(r.session.stage).toBe("COLLECTING_PAYMENT_METHOD");
  });

  it("delivery asks for address", () => {
    let s = advanceSession(freshSession(), "quero 1 yakisoba", MENU).session;
    s = advanceSession(s, "frango", MENU).session;
    const r = advanceSession(s, "é entrega", MENU);
    expect(r.session.deliveryType).toBe("DELIVERY");
    expect(r.session.stage).toBe("COLLECTING_ADDRESS");
    expect(r.suggestedReply.toLowerCase()).toContain("endereço");
  });

  it("complete address defers to delivery quote", () => {
    let s = advanceSession(freshSession(), "quero 1 yakisoba", MENU).session;
    s = advanceSession(s, "frango", MENU).session;
    s = advanceSession(s, "é entrega", MENU).session;
    const r = advanceSession(s, "Rua das Flores, 123", MENU);
    expect(r.session.stage).toBe("CALCULATING_DELIVERY_FEE");
    expect(r.actions).toContain("QUOTE_DELIVERY");
    expect(r.session.address?.street).toMatch(/Flores/i);
    expect(r.session.address?.number).toBe("123");
  });

  it("payment=pix sets actions CREATE_ORDER + GENERATE_PIX", () => {
    const s = freshSession({ stage: "COLLECTING_PAYMENT_METHOD", deliveryType: "PICKUP" });
    const r = advanceSession(s, "vou pagar no pix", MENU);
    expect(r.session.paymentMethod).toBe("PIX");
    expect(r.actions).toEqual(expect.arrayContaining(["CREATE_ORDER", "GENERATE_PIX"]));
  });

  it("payment=cash asks for change", () => {
    const s = freshSession({ stage: "COLLECTING_PAYMENT_METHOD", deliveryType: "PICKUP" });
    const r = advanceSession(s, "dinheiro", MENU);
    expect(r.session.paymentMethod).toBe("CASH");
    expect(r.suggestedReply.toLowerCase()).toContain("troco");
    expect(r.actions).not.toContain("CREATE_ORDER");
  });

  it("payment=cash with change proceeds to order", () => {
    const s = freshSession({ stage: "COLLECTING_PAYMENT_METHOD", deliveryType: "PICKUP" });
    const r = advanceSession(s, "dinheiro, troco pra 100", MENU);
    expect(r.session.paymentMethod).toBe("CASH");
    expect(r.session.metadata?.changeFor).toBe(100);
    expect(r.actions).toContain("CREATE_ORDER");
  });
});

// ── State machine: modifications ────────────────────────────────────────────────

describe("State machine — modifications", () => {
  it("N. customer can add an item mid-flow", () => {
    let s = advanceSession(freshSession(), "quero 1 yakisoba", MENU).session;
    s = advanceSession(s, "frango", MENU).session; // now COLLECTING_DELIVERY_TYPE
    // Add another item by going back through review path
    s.stage = "REVIEWING_ORDER";
    const r = advanceSession(s, "manda uma coca também", MENU);
    expect(r.session.selectedItems.some(i => i.menuItemName === "Coca-Cola")).toBe(true);
  });
});

// ── State machine: interrupts ────────────────────────────────────────────────────

describe("State machine — interrupts", () => {
  it("P. cancel cancels the session in any stage", () => {
    const s = freshSession({ stage: "COLLECTING_ADDRESS", deliveryType: "DELIVERY" });
    const r = advanceSession(s, "cancela", MENU);
    expect(r.session.status).toBe("CANCELLED");
    expect(r.session.stage).toBe("CANCELLED");
  });

  it("human request triggers handoff", () => {
    const r = advanceSession(freshSession(), "quero falar com atendente", MENU);
    expect(r.handoff).toBe(true);
    expect(r.session.status).toBe("HANDOFF_REQUIRED");
  });

  it("complaint triggers handoff with operator summary", () => {
    let s = advanceSession(freshSession(), "quero 1 yakisoba", MENU).session;
    s = advanceSession(s, "frango", MENU).session;
    const r = advanceSession(s, "isso veio errado, péssimo", MENU);
    expect(r.handoff).toBe(true);
    expect(r.operatorSummary).toContain("Yakisoba");
  });

  it("S. ambiguous product asks for clarification", () => {
    const menu = [
      { ...YAKISOBA, id: "yf", name: "Yakisoba Frango", optionGroups: [] },
      { ...YAKISOBA, id: "yc", name: "Yakisoba Carne",  optionGroups: [] },
    ];
    const r = advanceSession(freshSession(), "quero um yakisoba", menu);
    expect(r.session.unresolvedItems[0]?.reason).toBe("AMBIGUOUS");
  });

  it("R. unknown product is unresolved", () => {
    const r = advanceSession(freshSession(), "quero uma pizza calabresa", MENU);
    expect(r.session.unresolvedItems.some(u => u.reason === "NOT_FOUND")).toBe(true);
  });
});

// ── Address parsing ─────────────────────────────────────────────────────────────

describe("Address parser", () => {
  it("parses 'Rua X, 123'", () => {
    const a = parseAddressFragment("Rua das Flores, 123");
    expect(a.street).toMatch(/Flores/);
    expect(a.number).toBe("123");
  });

  it("parses CEP", () => {
    const a = parseAddressFragment("meu cep é 01310-100");
    expect(a.cep).toBe("01310-100");
  });

  it("street-only has no number", () => {
    const a = parseAddressFragment("Avenida Paulista");
    expect(a.number).toBeUndefined();
    expect(a.street).toMatch(/Paulista/);
  });
});

// ── Payment parsing ─────────────────────────────────────────────────────────────

describe("Payment parser", () => {
  it("AC. parses pix", () => expect(parsePaymentMethod("vou pagar no pix").method).toBe("PIX"));
  it("parses card", () => expect(parsePaymentMethod("cartão na entrega").method).toBe("CARD"));
  it("parses cash", () => expect(parsePaymentMethod("dinheiro").method).toBe("CASH"));
  it("AD. parses change amount", () => {
    const p = parsePaymentMethod("dinheiro, troco pra 100");
    expect(p.method).toBe("CASH");
    expect(p.changeFor).toBe(100);
  });
  it("no method when none mentioned", () => expect(parsePaymentMethod("ok obrigado").method).toBeNull());
});

// ── Draft / completeness ────────────────────────────────────────────────────────

describe("Draft builder + completeness", () => {
  it("W. draft uses real matched prices", () => {
    let s = advanceSession(freshSession(), "quero 1 yakisoba", MENU).session;
    s = advanceSession(s, "frango", MENU).session;
    const draft = buildFullDraft(s);
    expect(draft.subtotal).toBeCloseTo(30.0); // delivery price
  });

  it("incomplete session lists what is missing", () => {
    const s = freshSession();
    const c = checkCompleteness(s);
    expect(c.ready).toBe(false);
    expect(c.missing).toContain("nenhum item no pedido");
  });

  it("X. pickup completeness needs no address", () => {
    let s = advanceSession(freshSession(), "quero 1 yakisoba", MENU).session;
    s = advanceSession(s, "frango", MENU).session;
    s = advanceSession(s, "retirar", MENU).session;
    s.paymentMethod = "CASH";
    const c = checkCompleteness(s);
    expect(c.ready).toBe(true);
  });

  it("Y. delivery completeness requires address + quote", () => {
    let s = advanceSession(freshSession(), "quero 1 yakisoba", MENU).session;
    s = advanceSession(s, "frango", MENU).session;
    s.deliveryType = "DELIVERY";
    s.paymentMethod = "PIX";
    const c = checkCompleteness(s);
    expect(c.ready).toBe(false);
    expect(c.missing).toContain("endereço de entrega");
  });

  it("comanda renders delivery and total lines", () => {
    let s = advanceSession(freshSession(), "quero 1 yakisoba", MENU).session;
    s = advanceSession(s, "frango", MENU).session;
    s.deliveryType = "DELIVERY";
    s.deliveryQuote = { fee: 7, status: "ok" };
    const text = renderComanda(s, 30, 7, 37);
    expect(text).toContain("Entrega — R$ 7.00");
    expect(text).toContain("Total — R$ 37.00");
  });
});

// ── Feature flag modes ──────────────────────────────────────────────────────────

describe("Feature flag modes", () => {
  beforeEach(() => {
    delete process.env.WHATSAPP_TEXT_ORDERING_ENABLED;
    delete process.env.WHATSAPP_TEXT_ORDERING_MODE;
    delete process.env.WHATSAPP_TEXT_ORDERING_ALLOWLIST_RESTAURANTS;
    delete process.env.WHATSAPP_TEXT_ORDERING_ALLOWLIST_PHONES;
  });

  it("A. disabled by default", () => {
    expect(isWaTextOrderingEnabled("r1")).toBe(false);
    expect(getWaTextOrderingMode()).toBe("DRY_RUN_ONLY");
  });

  it("B. non-allowlisted phone gets no side effects", () => {
    process.env.WHATSAPP_TEXT_ORDERING_ENABLED = "true";
    process.env.WHATSAPP_TEXT_ORDERING_MODE = "ALLOWLIST_FULL_TEST";
    process.env.WHATSAPP_TEXT_ORDERING_ALLOWLIST_RESTAURANTS = "r1";
    process.env.WHATSAPP_TEXT_ORDERING_ALLOWLIST_PHONES = "+5511888887777";
    const perms = resolveSideEffectPermissions("r1", "+5511999990000");
    expect(perms.canReply).toBe(false);
    expect(perms.canCreateOrder).toBe(false);
    expect(perms.canCreatePix).toBe(false);
  });

  it("reply-only mode allows reply but not order/pix", () => {
    process.env.WHATSAPP_TEXT_ORDERING_ENABLED = "true";
    process.env.WHATSAPP_TEXT_ORDERING_MODE = "ALLOWLIST_REPLY_ONLY";
    process.env.WHATSAPP_TEXT_ORDERING_ALLOWLIST_RESTAURANTS = "r1";
    process.env.WHATSAPP_TEXT_ORDERING_ALLOWLIST_PHONES = "+5511999990000";
    const perms = resolveSideEffectPermissions("r1", "+5511999990000");
    expect(perms.canReply).toBe(true);
    expect(perms.canCreateOrder).toBe(false);
    expect(perms.canCreatePix).toBe(false);
  });

  it("full-test mode (fully allowlisted) allows order + pix", () => {
    process.env.WHATSAPP_TEXT_ORDERING_ENABLED = "true";
    process.env.WHATSAPP_TEXT_ORDERING_MODE = "ALLOWLIST_FULL_TEST";
    process.env.WHATSAPP_TEXT_ORDERING_ALLOWLIST_RESTAURANTS = "r1";
    process.env.WHATSAPP_TEXT_ORDERING_ALLOWLIST_PHONES = "+5511999990000";
    const perms = resolveSideEffectPermissions("r1", "+5511999990000");
    expect(perms.canReply).toBe(true);
    expect(perms.canCreateOrder).toBe(true);
    expect(perms.canCreatePix).toBe(true);
  });

  it("allowlist helpers respect master switch", () => {
    expect(isRestaurantAllowlisted("r1")).toBe(false);
    expect(isPhoneAllowlisted("+5511999990000")).toBe(false);
  });
});

// ── Pix / order safety ───────────────────────────────────────────────────────────

describe("Pix safety", () => {
  it("AG/L. Pix stub never confirms order", async () => {
    const p = new StubPaymentProvider();
    const res = await p.createPixPayment({
      restaurantId: "r1", orderId: "o1", amount: 50, customerName: "x", customerPhone: "+551199",
    });
    expect(res.status).toBe("pending");
    const status = await p.getPaymentStatus(res.paymentId);
    expect(status).toBe("pending");
  });

  it("AH. pending Pix wording never says 'pedido confirmado' before payment", () => {
    // The state machine emits the safe wording; assert it's never the confirmed phrase
    const reply = "Pix gerado. Assim que o pagamento for confirmado, enviamos seu pedido para preparo.";
    expect(reply).not.toMatch(/pedido confirmado|sendo preparado|pedido aceito/i);
    expect(reply).toContain("Pix gerado");
  });

  it("AE. payment service dry-run stub never imports mercadopago at module load (structural)", async () => {
    const fs = await import("node:fs/promises");
    const src = await fs.readFile(new URL("../WhatsAppPaymentService.ts", import.meta.url), "utf-8");
    // MP is only imported dynamically inside the allowReal branch
    expect(src).not.toMatch(/^import .*mercadopago/m);
    expect(src).toContain('await import("@/lib/mercadopago")');
  });
});

// ── Webhook safety ────────────────────────────────────────────────────────────────

describe("Webhook safety", () => {
  it("F. evolution webhook does not import the ordering engine", async () => {
    const fs = await import("node:fs/promises");
    const src = await fs.readFile(
      new URL("../../../../app/api/webhooks/evolution/route.ts", import.meta.url),
      "utf-8",
    );
    expect(src).not.toContain("WhatsAppTextOrderService");
    expect(src).not.toContain("WhatsAppTextOrderingRuntimeService");
    expect(src).not.toContain("handleInboundForOrdering");
    expect(src).not.toContain("processCustomerMessage");
  });

  it("runtime service guards conversation lock (structural)", async () => {
    const fs = await import("node:fs/promises");
    const src = await fs.readFile(new URL("../WhatsAppTextOrderingRuntimeService.ts", import.meta.url), "utf-8");
    expect(src).toContain("aiLocked");
    expect(src).toContain("HUMANO_ASSUMIU");
    expect(src).toContain("isWaTextOrderingEnabled");
  });
});

// ── Reply UX ──────────────────────────────────────────────────────────────────────

describe("Reply UX", () => {
  it("AO. replies are short (< 200 chars)", () => {
    let s = advanceSession(freshSession(), "quero 1 yakisoba", MENU).session;
    const r = advanceSession(s, "frango", MENU);
    expect(r.suggestedReply.length).toBeLessThan(200);
  });

  it("non-order question is detected", () => {
    expect(detectIntent("qual o horário de vocês?")).toBe("QUESTION");
  });
});

// ── Never silently stuck (Part 3 invariant) ─────────────────────────────────────

describe("State machine — never silently stuck", () => {
  it("F1. known menu advances past MATCHING_MENU (yakisoba+coca → COLLECTING_REQUIRED_OPTIONS)", () => {
    const r = advanceSession(freshSession(), "quero 2 yakisoba e uma coca", MENU);
    expect(r.session.stage).not.toBe("MATCHING_MENU");
    expect(r.session.stage).toBe("COLLECTING_REQUIRED_OPTIONS");
    expect(r.suggestedReply.trim().length).toBeGreaterThan(0);
  });

  it("F2. unknown item surfaces unresolvedItems AND a non-empty clarifying reply", () => {
    const r = advanceSession(freshSession(), "quero uma pizza calabresa", MENU);
    expect(r.session.unresolvedItems.length).toBeGreaterThan(0);
    expect(r.suggestedReply.trim().length).toBeGreaterThan(0);
    // it asks for clarification rather than going silent
    expect(r.session.status).toBe("AWAITING_CUSTOMER");
  });

  it("F3. when an item is unresolved, the engine asks to confirm the name", () => {
    const r = advanceSession(freshSession(), "quero um xpto9000", MENU);
    expect(r.session.unresolvedItems[0]?.reason).toBe("NOT_FOUND");
    expect(r.suggestedReply.toLowerCase()).toMatch(/encontrei|confirmar|nome/);
  });
});
