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

// ── PARTE 5: Thanks / closing guard ──────────────────────────────────────────

describe("PARTE 5 — thanks / closing guard (must never hit product matcher)", () => {
  it("'obrigada' alone → friendly ack, NOT 'não encontrei'", () => {
    const r = advanceSession(fresh(), "obrigada", MENU);
    expect(r.suggestedReply).not.toMatch(/não encontrei/i);
    expect(r.handoff).toBe(false);
    expect(r.suggestedReply).toMatch(/imagina|qualquer coisa/i);
  });

  it("'Entendi, muitoooo obrigada' → friendly ack (real failure case)", () => {
    const r = advanceSession(fresh(), "Entendi, muitoooo obrigada", MENU);
    expect(r.suggestedReply).not.toMatch(/não encontrei/i);
    expect(r.suggestedReply).toMatch(/imagina|qualquer coisa/i);
  });

  it("'valeu!' → friendly ack, NOT 'não encontrei'", () => {
    const r = advanceSession(fresh(), "valeu!", MENU);
    expect(r.suggestedReply).not.toMatch(/não encontrei/i);
    expect(r.suggestedReply).toMatch(/imagina|qualquer coisa/i);
  });

  it("'perfeito' alone → friendly ack, NOT 'não encontrei'", () => {
    const r = advanceSession(fresh(), "perfeito", MENU);
    expect(r.suggestedReply).not.toMatch(/não encontrei/i);
    expect(r.handoff).toBe(false);
  });

  it("thanks reply contains '0. menu' footer", () => {
    const r = advanceSession(fresh(), "obrigada", MENU);
    expect(r.suggestedReply).toContain("0. menu");
  });
});

// ── PARTE 6: Praise guard ─────────────────────────────────────────────────────

describe("PARTE 6 — praise guard (must never hit product matcher)", () => {
  it("'Tudo aí é maravilhoso, obrigada' → praise ack (real failure case)", () => {
    const r = advanceSession(fresh(), "Tudo aí é maravilhoso, obrigada", MENU);
    expect(r.suggestedReply).not.toMatch(/não encontrei/i);
    expect(r.handoff).toBe(false);
  });

  it("praise reply contains '0. menu' footer", () => {
    const r = advanceSession(fresh(), "Tudo aí é maravilhoso, obrigada", MENU);
    expect(r.suggestedReply).toContain("0. menu");
  });
});

// ── PARTE 7: Payment / voucher guard ─────────────────────────────────────────

describe("PARTE 7 — payment / voucher guard (must never hit product matcher)", () => {
  it("'aceita voucher?' → payment info, NOT 'não encontrei'", () => {
    const r = advanceSession(fresh(), "aceita voucher?", MENU);
    expect(r.suggestedReply).not.toMatch(/não encontrei/i);
    expect(r.handoff).toBe(false);
  });

  it("'vocês aceitam vale-refeição?' → payment info (real failure case)", () => {
    const r = advanceSession(fresh(), "vocês aceitam vale-refeição?", MENU);
    expect(r.suggestedReply).not.toMatch(/não encontrei/i);
    expect(r.suggestedReply).toMatch(/pix|cart[aã]o|dinheiro/i);
  });

  it("'aceitam VR?' → payment info", () => {
    const r = advanceSession(fresh(), "aceitam VR?", MENU);
    expect(r.suggestedReply).not.toMatch(/não encontrei/i);
    expect(r.suggestedReply).toMatch(/pix|cart[aã]o|dinheiro/i);
  });

  it("'aceita alelo?' → payment info", () => {
    const r = advanceSession(fresh(), "aceita alelo?", MENU);
    expect(r.suggestedReply).not.toMatch(/não encontrei/i);
    expect(r.suggestedReply).not.toMatch(/não encontrei.*alelo/i);
  });

  it("voucher reply includes short menu options and '0. menu' footer", () => {
    const r = advanceSession(fresh(), "aceita voucher?", MENU);
    expect(r.suggestedReply).toContain("0. menu");
    expect(r.suggestedReply).toMatch(/1️⃣.*pedir|fazer.*pedido/i);
  });
});

// ── PARTE 8: Contextual personal message guard ───────────────────────────────

describe("PARTE 8 — contextual personal message guard (must never hit product matcher)", () => {
  it("'kely eu achei o sushi' → contextual ack, NOT 'não encontrei'", () => {
    const r = advanceSession(fresh(), "kely eu achei o sushi", MENU);
    expect(r.suggestedReply).not.toMatch(/não encontrei/i);
    expect(r.handoff).toBe(false);
  });

  it("'vou confirmar com ela' → contextual ack, NOT 'não encontrei'", () => {
    const r = advanceSession(fresh(), "vou confirmar com ela", MENU);
    expect(r.suggestedReply).not.toMatch(/não encontrei/i);
    expect(r.suggestedReply).toContain("0. menu");
  });

  it("'será que é esse?' → contextual ack", () => {
    const r = advanceSession(fresh(), "será que é esse?", MENU);
    expect(r.suggestedReply).not.toMatch(/não encontrei/i);
    expect(r.handoff).toBe(false);
  });
});

// ── PARTE 9: Real products must still work after new guards ──────────────────

describe("PARTE 9 — real products still resolved after intent guards", () => {
  it("'1 yakisoba carne' → matched, NOT a guard reply", () => {
    const r = advanceSession(fresh(), "1 yakisoba carne", MENU);
    expect(r.suggestedReply).not.toMatch(/imagina|qualquer coisa/i);
    expect(r.suggestedReply).not.toMatch(/obrigado|carinho/i);
    expect(r.session.selectedItems.length + r.session.unresolvedItems.length).toBeGreaterThan(0);
  });

  it("'temaki salmão e coca-cola lata' → at least one item resolved", () => {
    const r = advanceSession(fresh(), "temaki salmão e coca-cola lata", MENU);
    expect(r.suggestedReply).not.toMatch(/imagina|qualquer coisa/i);
    expect(r.session.selectedItems.length + r.session.unresolvedItems.length).toBeGreaterThan(0);
  });

  it("'quero 2 temaki' → product resolution (NOT a guard)", () => {
    const r = advanceSession(fresh(), "quero 2 temaki", MENU);
    expect(r.suggestedReply).not.toMatch(/imagina|qualquer coisa/i);
    expect(r.session.selectedItems.length + r.session.unresolvedItems.length).toBeGreaterThan(0);
  });
});
