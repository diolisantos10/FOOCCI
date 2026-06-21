import { describe, it, expect, beforeEach, vi } from "vitest";
import type { WaMenuItem, WaPersistedSession, WaOrderStage } from "./types";
import type { WaOrderBrainDecision } from "./WhatsAppOrderBrain";

const brain = vi.hoisted(() => ({ reasonOrderTurn: vi.fn() }));
vi.mock("./WhatsAppOrderBrain", () => ({ reasonOrderTurn: brain.reasonOrderTurn }));

import { advanceTurn } from "./WhatsAppOrderBrainRouter";

function menuItem(id: string, name: string, price: number): WaMenuItem {
  return {
    id, name, description: "", price, priceDelivery: price,
    isActive: true, isAvailable: true, showInDelivery: true,
    hasVariants: false, variants: [], optionGroups: [], extras: [],
  };
}
const menu: WaMenuItem[] = [menuItem("yaki1", "Yakisoba de Frango", 39.9), menuItem("coca1", "Coca-Cola Lata", 7)];

function makeSession(stage: WaOrderStage = "IDLE", over: Partial<WaPersistedSession> = {}): WaPersistedSession {
  const now = new Date();
  return {
    id: "s1", restaurantId: "r1", customerId: null, conversationId: null, phone: "55119",
    status: "ACTIVE", stage, selectedItems: [], unresolvedItems: [], missingQuestions: [],
    deliveryType: null, address: null, deliveryQuote: null, paymentMethod: null, paymentStatus: null,
    orderDraftId: null, orderId: null, pixPaymentId: null, mode: "ALLOWLIST_FULL_TEST", source: "test",
    metadata: null, lastMessageAt: now, expiresAt: null, createdAt: now, updatedAt: now,
    ...over,
  };
}

function decision(over: Partial<WaOrderBrainDecision>): WaOrderBrainDecision {
  return { intent: "UNKNOWN", items: [], reply: "", shouldHandoff: false, reasoningMode: "LLM", ...over };
}

beforeEach(() => vi.clearAllMocks());

describe("advanceTurn — brain-aware router", () => {
  it("brain OFF → delegates to the legacy machine (brain never called)", async () => {
    const r = await advanceTurn(makeSession(), "oi", menu, { brainEnabled: false });
    expect(brain.reasonOrderTurn).not.toHaveBeenCalled();
    expect(r.suggestedReply).toBeTruthy();
  });

  it("legacy stage (payment) → legacy machine, brain not consulted", async () => {
    await advanceTurn(makeSession("COLLECTING_PAYMENT_METHOD"), "pix", menu, { brainEnabled: true });
    expect(brain.reasonOrderTurn).not.toHaveBeenCalled();
  });

  it("FALLBACK (no pilot) → delegates to the legacy machine", async () => {
    brain.reasonOrderTurn.mockResolvedValue(decision({ reasoningMode: "FALLBACK" }));
    const r = await advanceTurn(makeSession(), "quero um yakisoba", menu, { brainEnabled: true });
    expect(r.suggestedReply).toBeTruthy(); // legacy produced the reply
  });

  it("ADD_ITEMS → cleans to exact names and the legacy machine builds the comanda", async () => {
    brain.reasonOrderTurn.mockResolvedValue(decision({
      intent: "ADD_ITEMS",
      items: [{ menuItemId: "yaki1", menuItemName: "Yakisoba de Frango", quantity: 2 }],
    }));
    const r = await advanceTurn(makeSession(), "quero dois yaksoba", menu, { brainEnabled: true });
    // The legacy machine actually added the real item to the comanda.
    expect(r.session.selectedItems.map((i) => i.menuItemId)).toContain("yaki1");
    expect(r.suggestedReply).not.toMatch(/não encontrei/i);
  });

  it("MENU_BROWSE → Brain answers (redirect to 1), regex matcher never runs", async () => {
    brain.reasonOrderTurn.mockResolvedValue(decision({
      intent: "MENU_BROWSE", reply: "Pra ver tudo é só apertar 1 😉",
    }));
    const r = await advanceTurn(makeSession(), "cardápio", menu, { brainEnabled: true });
    expect(r.suggestedReply).toMatch(/apertar 1|aperte 1|apertar o 1/i);
    expect(r.handoff).toBe(false);
    expect(r.session.selectedItems).toHaveLength(0);
  });

  it("INFO_QUESTION → Brain answers from knowledge (no 'não encontrei')", async () => {
    brain.reasonOrderTurn.mockResolvedValue(decision({
      intent: "INFO_QUESTION", reply: "Funcionamos das 18h às 23h 😊",
    }));
    const r = await advanceTurn(makeSession(), "que horas abre?", menu, { brainEnabled: true });
    expect(r.suggestedReply).toMatch(/18h/);
    expect(r.suggestedReply).not.toMatch(/não encontrei/i);
  });

  it("HUMAN → handoff (complaint / order status never becomes a menu lookup)", async () => {
    brain.reasonOrderTurn.mockResolvedValue(decision({
      intent: "HUMAN", reply: "Vou chamar um atendente. 🤝", shouldHandoff: true,
    }));
    const r = await advanceTurn(makeSession(), "não recebi o pedido", menu, { brainEnabled: true });
    expect(r.handoff).toBe(true);
    expect(r.session.stage).toBe("HANDOFF_REQUIRED");
    expect(r.suggestedReply).not.toMatch(/não encontrei/i);
  });
});
