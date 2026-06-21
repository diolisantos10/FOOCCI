/**
 * P1 regression tests — ambiguous product and active-cart menu-zero handling.
 *
 * These cover two specific failure modes that only manifest in production (when
 * the order brain is active with a real AI key):
 *
 *  1. sim-ambiguous: "quero uma coca" — must list numbered options, NOT auto-pick.
 *  2. sim-menu-zero: typing "0" with an active cart — must show Continuar/Descartar.
 *
 * Tests run against the legacy state machine directly (brain FALLBACK path) AND
 * against the brain router with mocked brain calls to prove the guards fire even
 * when the brain is active.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { WaMenuItem, WaPersistedSession, WaOrderStage } from "../types";
import type { WaOrderBrainDecision } from "../WhatsAppOrderBrain";

// ─── brain mock ──────────────────────────────────────────────────────────────

const brain = vi.hoisted(() => ({ reasonOrderTurn: vi.fn() }));
vi.mock("../WhatsAppOrderBrain", () => ({ reasonOrderTurn: brain.reasonOrderTurn }));

import { advanceTurn } from "../WhatsAppOrderBrainRouter";
import { advanceSession } from "../WhatsAppOrderStateMachine";

// ─── helpers ─────────────────────────────────────────────────────────────────

function menuItem(id: string, name: string, price: number): WaMenuItem {
  return {
    id, name, description: "", price, priceDelivery: price,
    isActive: true, isAvailable: true, showInDelivery: true,
    hasVariants: false, variants: [], optionGroups: [], extras: [],
  };
}

function makeSession(stage: WaOrderStage = "IDLE", over: Partial<WaPersistedSession> = {}): WaPersistedSession {
  const now = new Date();
  return {
    id: "s-test", restaurantId: "r-test", customerId: null, conversationId: null, phone: "5511999999999",
    status: "ACTIVE", stage, selectedItems: [], unresolvedItems: [], missingQuestions: [],
    deliveryType: null, address: null, deliveryQuote: null, paymentMethod: null, paymentStatus: null,
    orderDraftId: null, orderId: null, pixPaymentId: null, mode: "ALLOWLIST_FULL_TEST", source: "test",
    metadata: null, lastMessageAt: now, expiresAt: null, createdAt: now, updatedAt: now,
    ...over,
  };
}

function brainDecision(over: Partial<WaOrderBrainDecision>): WaOrderBrainDecision {
  return { intent: "UNKNOWN", items: [], reply: "", shouldHandoff: false, reasoningMode: "LLM", ...over };
}

// Menu with two Coca-Cola variants — the classic ambiguous pair
const ambiguousMenu: WaMenuItem[] = [
  menuItem("combo1", "Combinado Especial", 45),
  menuItem("coca-lata", "Coca-Cola lata", 7),
  menuItem("coca-2l", "Coca-Cola 2L", 14),
];

beforeEach(() => vi.clearAllMocks());

// ─── LEGACY STATE MACHINE (brain FALLBACK / disabled) ─────────────────────────

describe("legacy state machine — ambiguous product (sim-ambiguous)", () => {
  it("lists numbered options and does NOT auto-pick when query matches 2+ items", async () => {
    const r = await advanceSession(makeSession(), "quero uma coca", ambiguousMenu);
    const reply = r.suggestedReply.toLowerCase();
    expect(reply).toMatch(/1(️⃣)?\s*[—.\-]?\s/); // numbered list
    expect(r.session.selectedItems).toHaveLength(0); // nothing added
  });

  it("reply contains both Coca-Cola variant names", async () => {
    const r = await advanceSession(makeSession(), "quero uma coca", ambiguousMenu);
    const reply = r.suggestedReply.toLowerCase();
    expect(reply).toMatch(/lata|2l|2 l/i);
  });

  it("does not contain 'nao encontrei' for ambiguous terms", async () => {
    const r = await advanceSession(makeSession(), "quero uma coca", ambiguousMenu);
    expect(r.suggestedReply).not.toMatch(/não encontrei/i);
  });
});

describe("legacy state machine — 0 with active cart (sim-menu-zero)", () => {
  it("shows Continuar / Descartar when cart has items", async () => {
    // Step 1: add item to cart
    const r1 = await advanceSession(makeSession(), "quero um combinado", ambiguousMenu);
    expect(r1.session.selectedItems.length).toBeGreaterThan(0);

    // Step 2: type "0"
    const r2 = await advanceSession(r1.session, "0", ambiguousMenu);
    const reply = r2.suggestedReply.toLowerCase();
    expect(reply).toMatch(/continuar/);
    expect(reply).toMatch(/descartar/);
  });

  it("does not discard cart silently when 0 is typed", async () => {
    const r1 = await advanceSession(makeSession(), "quero um combinado", ambiguousMenu);
    const r2 = await advanceSession(r1.session, "0", ambiguousMenu);
    // Cart should still be in context (not cleared without confirmation)
    expect(r2.session.metadata?.menuReturnPending).toBe(true);
  });

  it("bare '0' without active cart goes straight to menu", async () => {
    const r = await advanceSession(makeSession(), "0", ambiguousMenu);
    const reply = r.suggestedReply.toLowerCase();
    // No cart to protect — goes to menu / greeting
    expect(reply).not.toMatch(/continuar.*descartar|descartar.*continuar/);
  });
});

// ─── BRAIN ROUTER (guards must fire even when brain is active) ─────────────

describe("brain router — ambiguity guard (sim-ambiguous)", () => {
  it("brain picks Coca-Cola Lata but original 'coca' is ambiguous -> legacy shows numbered options", async () => {
    brain.reasonOrderTurn.mockResolvedValue(brainDecision({
      intent: "ADD_ITEMS",
      items: [{ menuItemId: "coca-lata", menuItemName: "Coca-Cola lata", quantity: 1 }],
    }));
    const r = await advanceTurn(makeSession(), "quero uma coca", ambiguousMenu, { brainEnabled: true });
    // Legacy must override brain's pick when source is ambiguous
    expect(r.session.selectedItems).toHaveLength(0);
    expect(r.suggestedReply).toMatch(/1(️⃣)?\s*[—.\-]?\s/);
  });

  it("brain picks item from unambiguous message -> ambiguity guard does NOT block (no false positives)", async () => {
    brain.reasonOrderTurn.mockResolvedValue(brainDecision({
      intent: "ADD_ITEMS",
      items: [{ menuItemId: "combo1", menuItemName: "Combinado Especial", quantity: 1 }],
    }));
    const r = await advanceTurn(makeSession(), "quero um combinado especial", ambiguousMenu, { brainEnabled: true });
    // Guard did not fire: brain was called (not short-circuited before brain call)
    expect(brain.reasonOrderTurn).toHaveBeenCalledTimes(1);
    // Guard did not fire: numbered options list NOT shown (no ambiguity false-positive)
    expect(r.suggestedReply).not.toMatch(/^\s*1(️⃣)?\s*[—.\-]?\s*Coca/im);
  });

  it("ambiguity guard rejects brain's pick and shows numbered options from legacy", async () => {
    brain.reasonOrderTurn.mockResolvedValue(brainDecision({
      intent: "ADD_ITEMS",
      items: [{ menuItemId: "coca-lata", menuItemName: "Coca-Cola lata", quantity: 1 }],
    }));
    const r = await advanceTurn(makeSession(), "quero uma coca", ambiguousMenu, { brainEnabled: true });
    // Brain IS called (guard in ADD_ITEMS path, not before brain call)
    expect(brain.reasonOrderTurn).toHaveBeenCalledTimes(1);
    // But result overridden: numbered options shown, nothing added
    expect(r.session.selectedItems).toHaveLength(0);
    expect(r.suggestedReply).toMatch(/1(️⃣)?\s*[—.\-]?\s/);
  });
});

describe("brain router — menu-zero guard (sim-menu-zero)", () => {
  it('"0" with active cart -> brain NOT called at all, goes straight to legacy isMenuReturn', async () => {
    const r = await advanceTurn(makeSession("BUILDING_CART", {
      selectedItems: [{
        rawText: "combinado", menuItemId: "combo1", menuItemName: "Combinado Especial",
        quantity: 1, unitPrice: 45, lineTotal: 45, options: [], extras: [],
      }],
    }), "0", ambiguousMenu, { brainEnabled: true });
    expect(brain.reasonOrderTurn).not.toHaveBeenCalled();
    const reply = r.suggestedReply.toLowerCase();
    expect(reply).toMatch(/continuar|descartar/);
  });

  it('"  0  " (with whitespace) -> brain NOT called', async () => {
    const r = await advanceTurn(makeSession(), "  0  ", ambiguousMenu, { brainEnabled: true });
    expect(brain.reasonOrderTurn).not.toHaveBeenCalled();
  });

  it("menuReturnPending=true -> brain NOT called, legacy handles confirmation", async () => {
    const sessionPending = makeSession("BUILDING_CART", {
      metadata: { menuReturnPending: true },
    });
    await advanceTurn(sessionPending, "1", ambiguousMenu, { brainEnabled: true });
    expect(brain.reasonOrderTurn).not.toHaveBeenCalled();
  });

  it("0 with active cart produces continuar + descartar via router", async () => {
    // Step 1: add item through router (brain disabled for setup)
    const r1 = await advanceTurn(makeSession(), "quero um combinado", ambiguousMenu, { brainEnabled: false });
    expect(r1.session.selectedItems.length).toBeGreaterThan(0);

    // Step 2: type "0" with brain ENABLED — guard must fire
    const r2 = await advanceTurn(r1.session, "0", ambiguousMenu, { brainEnabled: true });
    expect(brain.reasonOrderTurn).not.toHaveBeenCalled();
    const reply = r2.suggestedReply.toLowerCase();
    expect(reply).toMatch(/continuar/);
    expect(reply).toMatch(/descartar/);
  });
});
