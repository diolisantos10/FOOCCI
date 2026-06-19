/**
 * WhatsApp cart-building stage tests.
 *
 * After all items are resolved the bot stays in BUILDING_CART mode until
 * the customer explicitly finalizes ("9" / "finalizar pedido").
 * Only then does the checkout flow (delivery/address/payment) begin.
 */

import { describe, it, expect } from "vitest";
import { advanceSession } from "../WhatsAppOrderStateMachine";
import type { WaMenuItem, WaPersistedSession } from "../types";

const YAKISOBA: WaMenuItem = {
  id: "yaki", name: "Yakisoba", price: 28.9, priceDelivery: 30.0,
  isActive: true, isAvailable: true, showInDelivery: true, hasVariants: false,
  variants: [],
  optionGroups: [{
    id: "g-tipo", name: "Tipo", required: true, minSelect: 1, maxSelect: 1,
    options: [{ id: "o-frango", name: "Frango", price: 0, isAvailable: true }],
  }],
  extras: [],
};

const COCA: WaMenuItem = {
  id: "coca", name: "Coca-Cola", price: 6.0, priceDelivery: 6.5,
  isActive: true, isAvailable: true, showInDelivery: true, hasVariants: false,
  variants: [], optionGroups: [], extras: [],
};

const SORVETE: WaMenuItem = {
  id: "sorv", name: "Sorvete de Chocolate", price: 12.0, priceDelivery: 12.0,
  isActive: true, isAvailable: true, showInDelivery: true, hasVariants: false,
  variants: [], optionGroups: [], extras: [],
};

const MENU = [YAKISOBA, COCA, SORVETE];

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

function resolveYakisoba(): ReturnType<typeof advanceSession> {
  const s = advanceSession(freshSession(), "quero 1 yakisoba", MENU).session;
  return advanceSession(s, "frango", MENU);
}

describe("BUILDING_CART — não inicia checkout automaticamente", () => {
  it("1. após escolher Yakisoba frango, NÃO pergunta endereço (stage é BUILDING_CART)", () => {
    const { session } = resolveYakisoba();
    expect(session.stage).toBe("BUILDING_CART");
    expect(session.stage).not.toBe("COLLECTING_ADDRESS");
  });

  it("2. após escolher Yakisoba frango, NÃO pergunta entrega nem pagamento", () => {
    const { session } = resolveYakisoba();
    expect(session.stage).not.toBe("COLLECTING_DELIVERY_TYPE");
    expect(session.stage).not.toBe("COLLECTING_PAYMENT_METHOD");
  });

  it("3. após resolver item, mostra comanda parcial com 'Anotei até agora:'", () => {
    const { suggestedReply } = resolveYakisoba();
    expect(suggestedReply).toMatch(/Anotei até agora/i);
    expect(suggestedReply).toContain("Yakisoba");
  });

  it("4. reply em BUILDING_CART mostra '9️⃣ Finalizar pedido'", () => {
    const { suggestedReply } = resolveYakisoba();
    expect(suggestedReply).toContain("9️⃣ Finalizar pedido");
  });
});

describe("BUILDING_CART — cliente pode adicionar itens antes de finalizar", () => {
  it("5. cliente pode adicionar Coca-Cola antes de finalizar pedido", () => {
    const { session } = resolveYakisoba();
    const r = advanceSession(session, "quero uma coca", MENU);
    expect(r.session.selectedItems.some(i => i.menuItemName === "Coca-Cola")).toBe(true);
    expect(r.session.stage).toBe("BUILDING_CART");
  });

  it("6. comanda atualiza para mostrar Yakisoba + Coca-Cola após adicionar", () => {
    const { session } = resolveYakisoba();
    const r = advanceSession(session, "quero uma coca", MENU);
    expect(r.suggestedReply).toMatch(/Yakisoba/i);
    expect(r.suggestedReply).toMatch(/Coca-Cola/i);
    expect(r.session.selectedItems).toHaveLength(2);
  });
});

describe("BUILDING_CART — finalização e checkout", () => {
  it("7. só após digitar '9' o checkout começa (entrega ou retirada)", () => {
    const { session } = resolveYakisoba();
    const r = advanceSession(session, "9", MENU);
    expect(r.session.stage).toBe("COLLECTING_DELIVERY_TYPE");
    expect(r.suggestedReply.toLowerCase()).toMatch(/entrega|retirada/);
  });

  it("8. 'finalizar pedido' em texto também inicia o checkout", () => {
    const { session } = resolveYakisoba();
    const r = advanceSession(session, "finalizar pedido", MENU);
    expect(r.session.stage).toBe("COLLECTING_DELIVERY_TYPE");
  });

  it("9. Pix não aparece enquanto pedido não está finalizado", () => {
    const { session } = resolveYakisoba();
    const r = advanceSession(session, "quero uma coca", MENU);
    expect(r.actions).not.toContain("GENERATE_PIX");
    expect(r.actions).not.toContain("CREATE_ORDER");
  });

  it("10. CREATE_ORDER e GENERATE_PIX só aparecem após confirmação final de pagamento", () => {
    let s = resolveYakisoba().session;
    s = advanceSession(s, "9", MENU).session;         // COLLECTING_DELIVERY_TYPE
    s = advanceSession(s, "retirada", MENU).session;  // COLLECTING_PAYMENT_METHOD
    const r = advanceSession(s, "pix", MENU);
    expect(r.actions).toContain("CREATE_ORDER");
    expect(r.actions).toContain("GENERATE_PIX");
    expect(r.session.stage).toBe("READY_TO_CREATE_ORDER");
  });
});

describe("BUILDING_CART — elementos de UX", () => {
  it("11. '0. menu' continua presente na resposta do BUILDING_CART", () => {
    const { suggestedReply } = resolveYakisoba();
    expect(suggestedReply).toMatch(/\b0\.\s*menu/i);
  });

  it("12. opções de upsell têm emoji correto (1️⃣ 2️⃣ 3️⃣) e botão 9️⃣", () => {
    const { suggestedReply } = resolveYakisoba();
    expect(suggestedReply).toContain("1️⃣");
    expect(suggestedReply).toContain("2️⃣");
    expect(suggestedReply).toContain("3️⃣");
    expect(suggestedReply).toContain("9️⃣");
  });

  it("13. TypeScript: 'BUILDING_CART' é um WaOrderStage válido e reconhecido no dispatch", () => {
    const s = freshSession({ stage: "BUILDING_CART" });
    expect(s.stage).toBe("BUILDING_CART");
    const r = advanceSession(s, "9", MENU);
    expect(r.session.stage).toBe("COLLECTING_DELIVERY_TYPE");
  });
});
