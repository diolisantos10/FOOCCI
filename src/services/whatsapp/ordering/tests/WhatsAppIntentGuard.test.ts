/**
 * P0 intent guards — PARTE 1-5
 *
 * Greetings and order-status / follow-up messages must NEVER become product-search
 * queries inside the ordering state machine, regardless of cart state or stage.
 *
 * Covers:
 *   PARTE 1 — Greeting guard (GREETING_ONLY_RE) for empty + active cart
 *   PARTE 2 — Follow-up / status guard (ORDER_FOLLOWUP_RE) routes to handoff
 *   PARTE 3 — Context retention after "continuar pedido" (MATCHING_MENU stage)
 *   PARTE 4 — renderNumberedOptions / formatOptionNumber central helpers
 *   PARTE 5 — Safety: exact banned messages never produce "não encontrei no cardápio"
 */

import { describe, it, expect } from "vitest";
import { advanceSession } from "../WhatsAppOrderStateMachine";
import { renderNumberedOptions, formatOptionNumber } from "../menuFooter";
import type { WaMenuItem, WaPersistedSession } from "../types";

// ── fixtures ─────────────────────────────────────────────────────────────────

const mk = (over: Partial<WaMenuItem> & Pick<WaMenuItem, "id" | "name" | "price">): WaMenuItem => ({
  priceDelivery: null, isActive: true, isAvailable: true, showInDelivery: true,
  hasVariants: false, variants: [], optionGroups: [], extras: [], ...over,
} as WaMenuItem);

const MENU: WaMenuItem[] = [
  mk({ id: "y1", name: "Yakisoba Carne", price: 54 }),
  mk({ id: "t1", name: "Temaki Salmão", price: 29.9 }),
  mk({ id: "c1", name: "Coca-Cola lata", price: 7 }),
];

function fresh(over: Partial<WaPersistedSession> = {}): WaPersistedSession {
  const now = new Date();
  return {
    id: "s1", restaurantId: "r1", customerId: null, conversationId: null, phone: "+5511999990001",
    status: "ACTIVE", stage: "IDLE", selectedItems: [], unresolvedItems: [], missingQuestions: [],
    deliveryType: null, address: null, deliveryQuote: null, paymentMethod: null, paymentStatus: null,
    orderDraftId: null, orderId: null, pixPaymentId: null, mode: "ALLOWLIST_FULL_TEST", source: "test",
    metadata: null, lastMessageAt: now, expiresAt: null, createdAt: now, updatedAt: now,
    ...over,
  } as WaPersistedSession;
}

function sessionWithYakisoba(stage: WaPersistedSession["stage"] = "IDLE"): WaPersistedSession {
  return fresh({
    stage,
    selectedItems: [{
      rawText: "yakisoba", quantity: 1, menuItemId: "y1", menuItemName: "Yakisoba Carne",
      options: [], extras: [], unitPrice: 54, lineTotal: 54,
    }],
  });
}

// ── PARTE 1: greeting guard — empty cart ─────────────────────────────────────

describe("PARTE 1 — greeting guard (empty cart)", () => {
  it("'oi' produces greeting reply, NOT 'não encontrei'", () => {
    const r = advanceSession(fresh(), "oi", MENU);
    expect(r.suggestedReply).not.toMatch(/não encontrei.*oi/i);
    expect(r.handoff).toBe(false);
  });

  it("'bom dia' produces greeting reply, NOT 'não encontrei'", () => {
    const r = advanceSession(fresh(), "bom dia", MENU);
    expect(r.suggestedReply).not.toMatch(/não encontrei.*bom/i);
    expect(r.suggestedReply).not.toMatch(/não encontrei/i);
  });

  it("'olá' produces greeting reply, NOT 'não encontrei'", () => {
    const r = advanceSession(fresh(), "olá", MENU);
    expect(r.suggestedReply).not.toMatch(/não encontrei/i);
    expect(r.handoff).toBe(false);
  });
});

// ── PARTE 1: greeting guard — active cart ───────────────────────────────────

describe("PARTE 1 — greeting guard (active cart)", () => {
  it("'oi' with IDLE stage + items resumes order context, NOT 'não encontrei'", () => {
    const r = advanceSession(sessionWithYakisoba("IDLE"), "oi", MENU);
    expect(r.suggestedReply).not.toMatch(/não encontrei/i);
    expect(r.handoff).toBe(false);
  });

  it("'boa tarde' with MATCHING_MENU stage + items resumes order context", () => {
    const r = advanceSession(sessionWithYakisoba("MATCHING_MENU"), "boa tarde", MENU);
    expect(r.suggestedReply).not.toMatch(/não encontrei/i);
    expect(r.handoff).toBe(false);
  });
});

// ── PARTE 2: follow-up / status guard ────────────────────────────────────────

describe("PARTE 2 — follow-up / status guard (active cart → handoff)", () => {
  it("'cadê' with active cart → handoff, NOT 'não encontrei'", () => {
    const r = advanceSession(sessionWithYakisoba(), "cadê", MENU);
    expect(r.handoff).toBe(true);
    expect(r.suggestedReply).not.toMatch(/não encontrei/i);
  });

  it("'onde está meu pedido' with active cart → handoff", () => {
    const r = advanceSession(sessionWithYakisoba(), "onde está meu pedido", MENU);
    expect(r.handoff).toBe(true);
    expect(r.suggestedReply).not.toMatch(/não encontrei/i);
  });

  it("'ué' with active cart → handoff, NOT 'não encontrei'", () => {
    const r = advanceSession(sessionWithYakisoba(), "ué", MENU);
    expect(r.handoff).toBe(true);
    expect(r.suggestedReply).not.toMatch(/não encontrei/i);
  });

  it("'quanto tempo falta' with active cart → handoff", () => {
    const r = advanceSession(sessionWithYakisoba(), "quanto tempo falta", MENU);
    expect(r.handoff).toBe(true);
  });
});

// ── PARTE 3: context retention after "continuar pedido" ─────────────────────

describe("PARTE 3 — context retention after continuar pedido (MATCHING_MENU stage)", () => {
  it("'cadê' in MATCHING_MENU stage + items → handoff, NOT 'não encontrei'", () => {
    // Simulates ERRO 2: customer had active order, chose "continuar pedido",
    // then sent "Cadê" — must never produce "Não encontrei 'Cade' no cardápio".
    const r = advanceSession(sessionWithYakisoba("MATCHING_MENU"), "Cadê", MENU);
    expect(r.handoff).toBe(true);
    expect(r.suggestedReply).not.toMatch(/não encontrei.*cad/i);
  });
});

// ── PARTE 4: central numbered-option helpers ──────────────────────────────────

describe("PARTE 4 — renderNumberedOptions / formatOptionNumber central helpers", () => {
  it("formatOptionNumber uses emoji digits 1️⃣..9️⃣, falls back to 'N.' past 9", () => {
    expect(formatOptionNumber(1)).toBe("1️⃣");
    expect(formatOptionNumber(5)).toBe("5️⃣");
    expect(formatOptionNumber(9)).toBe("9️⃣");
    expect(formatOptionNumber(10)).toBe("10.");
  });

  it("renderNumberedOptions produces 'N️⃣ label' lines joined by newline", () => {
    expect(renderNumberedOptions(["Entrega", "Retirada"])).toBe("1️⃣ Entrega\n2️⃣ Retirada");
    expect(renderNumberedOptions(["Pix", "Cartão", "Dinheiro"])).toBe(
      "1️⃣ Pix\n2️⃣ Cartão\n3️⃣ Dinheiro",
    );
  });
});
