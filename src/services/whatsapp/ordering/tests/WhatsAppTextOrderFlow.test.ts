/**
 * WhatsApp text-order flow — anotador de pedido (footer `0. menu`, menu return,
 * configured payment options, declared payment confirm, saved address, entities,
 * diagnostic safety). Complements the existing W1–W9 suites.
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} })); // hermetic — nothing here touches DB

import { advanceSession } from "../WhatsAppOrderStateMachine";
import type { WaMenuItem, WaPersistedSession } from "../types";
import { withMenuFooter, isMenuReturn, MENU_FOOTER } from "../menuFooter";
import { renderPaymentQuestion } from "../checkoutBridge";
import { reasonWhatsAppMessage, extractOrderEntities } from "../../brain/WhatsAppBrainReasoningAdapter";
import { runWhatsAppTextOrderDiagnostic } from "../../brain/WhatsAppTextOrderDiagnostic";

const mk = (over: Partial<WaMenuItem> & Pick<WaMenuItem, "id" | "name" | "price">): WaMenuItem => ({
  priceDelivery: null, isActive: true, isAvailable: true, showInDelivery: true,
  hasVariants: false, variants: [], optionGroups: [], extras: [], ...over,
} as WaMenuItem);

const MENU: WaMenuItem[] = [
  mk({ id: "m1", name: "Yakisoba Frango", price: 39.9 }),
  mk({ id: "m2", name: "Yakisoba Carne e Frango", price: 44.9 }),
  mk({ id: "m3", name: "Yakisoba Legumes", price: 36.9 }),
  mk({ id: "m4", name: "Coca-Cola lata", price: 7 }),
  mk({ id: "m5", name: "Guaraná lata", price: 6.5 }),
];

function fresh(meta: Record<string, unknown> | null = null): WaPersistedSession {
  const now = new Date();
  return {
    id: "s1", restaurantId: "r1", customerId: null, conversationId: null, phone: "+5511999990000",
    status: "ACTIVE", stage: "IDLE", selectedItems: [], unresolvedItems: [], missingQuestions: [],
    deliveryType: null, address: null, deliveryQuote: null, paymentMethod: null, paymentStatus: null,
    orderDraftId: null, orderId: null, pixPaymentId: null, mode: "DRY_RUN_ONLY", source: "admin_test",
    metadata: meta, lastMessageAt: now, expiresAt: null, createdAt: now, updatedAt: now,
  } as WaPersistedSession;
}

describe("Brain adapter — pedido por texto livre", () => {
  const req = (messageText: string) => reasonWhatsAppMessage({
    restaurantId: "r1", conversationId: "c1", phone: "+5511999999999",
    messageText, currentConversationStatus: "OPEN", isRestaurantOpen: true, source: "WHATSAPP",
  });

  it("(1) pedido livre identifica ORDER_BY_TEXT + START_TEXT_ORDER_DRAFT", () => {
    const r = req("Quero um yakisoba de frango e um refrigerante. Vou pagar em dinheiro na entrega.");
    expect(r.primaryIntent).toBe("ORDER_BY_TEXT");
    expect(r.recommendedAction).toBe("START_TEXT_ORDER_DRAFT");
    expect(r.runtimeTouched).toBe(false);
  });

  it("(2/3) extrai yakisoba de frango e refrigerante", () => {
    const e = extractOrderEntities("Quero um yakisoba de frango e um refrigerante. Vou pagar em dinheiro na entrega.");
    expect(e.items.join(" | ").toLowerCase()).toContain("yakisoba");
    expect(e.items.join(" | ").toLowerCase()).toContain("refrigerante");
  });

  it("(4/5) dinheiro vira paymentMentioned e entrega é detectada", () => {
    const e = extractOrderEntities("Quero um yakisoba. Vou pagar em dinheiro na entrega.");
    expect(e.paymentMentioned).toBe("dinheiro");
    expect(e.deliveryMentioned).toBe("entrega");
  });

  it("'Quero fazer um pedido' (sem itens) continua START_ORDER → link", () => {
    const r = req("Quero fazer um pedido");
    expect(r.primaryIntent).toBe("START_ORDER");
  });
});

describe("Máquina de estados — ambiguidade, footer e `0. menu`", () => {
  it("(6) produto ambíguo gera opções numeradas", () => {
    const r = advanceSession(fresh(), "quero 1 yakisoba", MENU);
    expect(r.suggestedReply).toMatch(/1\s*[—.-]/);
    expect(r.suggestedReply).toMatch(/2\s*[—.-]/);
    expect(r.suggestedReply.toLowerCase()).toContain("yakisoba");
  });

  it("(7) produto inexistente não é inventado", () => {
    const r = advanceSession(fresh(), "quero 1 lasanha", MENU);
    expect(r.suggestedReply).toMatch(/n[ãa]o encontrei/i);
    expect(r.suggestedReply).not.toMatch(/lasanha\s*[—-]\s*R\$/i);
  });

  it("(8) toda mensagem ativa termina com `0. menu` (e exatamente esse texto)", () => {
    const replies = [
      advanceSession(fresh(), "quero 1 yakisoba", MENU).suggestedReply,
      advanceSession(fresh(), "quero 1 coca-cola lata", MENU).suggestedReply,
      advanceSession(fresh(), "quero 1 lasanha", MENU).suggestedReply,
    ];
    for (const reply of replies) {
      expect(reply.trimEnd().endsWith(MENU_FOOTER)).toBe(true);
      expect(reply).not.toMatch(/0\.\s*voltar/i);
    }
    // helper é idempotente e normaliza variantes
    expect(withMenuFooter("Oi\n\n0. voltar ao menu principal")).toBe("Oi\n\n0. menu");
    expect(withMenuFooter(withMenuFooter("Oi"))).toBe("Oi\n\n0. menu");
  });

  it("(9) `0` sem comanda volta ao menu", () => {
    expect(isMenuReturn("0")).toBe(true);
    expect(isMenuReturn("00")).toBe(false);
    const r = advanceSession(fresh(), "0", MENU);
    expect(r.intent).toBe("MENU_RETURN");
    expect(r.suggestedReply).toMatch(/menu principal/i);
  });

  it("(10) `0` com comanda pergunta continuar/descartar; 1 continua, 2 descarta", () => {
    const s1 = advanceSession(fresh(), "quero 1 coca-cola lata", MENU);
    const ask = advanceSession(s1.session, "0", MENU);
    expect(ask.suggestedReply).toMatch(/pedido em andamento/i);
    expect(ask.suggestedReply).toMatch(/1\. Continuar pedido/);
    expect(ask.suggestedReply).toMatch(/2\. Descartar pedido/);
    // 1 → continua (comanda preservada)
    const cont = advanceSession(ask.session, "1", MENU);
    expect(cont.session.stage).not.toBe("CANCELLED");
    // 2 → descarta
    const ask2 = advanceSession(cont.session, "0", MENU);
    const discard = advanceSession(ask2.session, "2", MENU);
    expect(discard.session.stage).toBe("CANCELLED");
    expect(discard.intent).toBe("MENU_RETURN");
  });

  it("(21) fallback para atendente funciona (3 na pergunta do menu)", () => {
    const s1 = advanceSession(fresh(), "quero 1 coca-cola lata", MENU);
    const ask = advanceSession(s1.session, "0", MENU);
    const human = advanceSession(ask.session, "3", MENU);
    expect(human.handoff).toBe(true);
  });
});

describe("Pagamento — opções oficiais do Fute, declarado e troco", () => {
  it("(11) renderiza opções numeradas a partir das formas configuradas", () => {
    const q = renderPaymentQuestion(["PIX", "CASH"]);
    expect(q).toContain("1. Pix");
    expect(q).toContain("2. Dinheiro na entrega");
    expect(q).not.toContain("Cartão");
  });

  it("número mapeia para a opção oficial (paymentOptionOrder)", () => {
    const s = fresh({ paymentOptionOrder: ["PIX", "CARD", "CASH"] });
    s.stage = "COLLECTING_PAYMENT_METHOD";
    (s as { selectedItems: unknown[] }).selectedItems = [{ menuItemId: "m4", name: "Coca-Cola lata", quantity: 1, unitPrice: 7, options: [], extras: [] }];
    (s as { deliveryType: string | null }).deliveryType = "PICKUP";
    const r = advanceSession(s, "3", MENU); // 3 = CASH
    expect(r.session.paymentMethod).toBe("CASH");
  });

  it("(12) dinheiro pergunta troco", () => {
    const s = fresh({ paymentOptionOrder: ["PIX", "CARD", "CASH"] });
    s.stage = "COLLECTING_PAYMENT_METHOD";
    (s as { selectedItems: unknown[] }).selectedItems = [{ menuItemId: "m4", name: "Coca-Cola lata", quantity: 1, unitPrice: 7, options: [], extras: [] }];
    (s as { deliveryType: string | null }).deliveryType = "PICKUP";
    const r = advanceSession(s, "3", MENU);
    expect(r.suggestedReply).toMatch(/troco/i);
  });

  it("pagamento declarado pede confirmação oficial (1. Sim / 2. Outra)", () => {
    const s = fresh({ declaredPayment: "CASH" });
    s.stage = "COLLECTING_PAYMENT_METHOD";
    (s as { selectedItems: unknown[] }).selectedItems = [{ menuItemId: "m4", name: "Coca-Cola lata", quantity: 1, unitPrice: 7, options: [], extras: [] }];
    (s as { deliveryType: string | null }).deliveryType = "PICKUP";
    // resposta qualquer sem método → re-pergunta com a variante de confirmação
    const ask = advanceSession(s, "ok", MENU);
    expect(ask.suggestedReply).toMatch(/Você informou dinheiro/i);
    expect(ask.suggestedReply).toMatch(/1\. Sim/);
    // 1 → adota o declarado e segue para troco (dinheiro)
    const confirmed = advanceSession(ask.session, "1", MENU);
    expect(confirmed.session.paymentMethod).toBe("CASH");
    expect(confirmed.suggestedReply).toMatch(/troco/i);
  });

  it("(13/16) Pix usa o bridge existente (CREATE_ORDER + GENERATE_PIX, mesmo fluxo do Fute)", () => {
    const s = fresh({ paymentOptionOrder: ["PIX", "CARD", "CASH"] });
    s.stage = "COLLECTING_PAYMENT_METHOD";
    (s as { selectedItems: unknown[] }).selectedItems = [{ menuItemId: "m4", name: "Coca-Cola lata", quantity: 1, unitPrice: 7, options: [], extras: [] }];
    (s as { deliveryType: string | null }).deliveryType = "PICKUP";
    const r = advanceSession(s, "1", MENU); // 1 = PIX
    expect(r.actions).toEqual(expect.arrayContaining(["CREATE_ORDER", "GENERATE_PIX"]));
  });

  it("(14/15) pedido só finaliza após confirmação — anotação inicial nunca cria pedido", () => {
    const r = advanceSession(fresh(), "quero 1 coca-cola lata", MENU);
    expect(r.actions).not.toContain("CREATE_ORDER");
    expect(r.actions).not.toContain("GENERATE_PIX");
  });
});

describe("Endereço salvo", () => {
  it("oferece o endereço salvo e 1 adota / 2 pede outro", () => {
    const saved = { street: "Rua das Flores", number: "123", neighborhood: "Centro", formatted: "Rua das Flores, 123 — Centro" };
    const s = fresh({ savedAddress: saved });
    s.stage = "COLLECTING_ADDRESS";
    (s as { selectedItems: unknown[] }).selectedItems = [{ menuItemId: "m4", name: "Coca-Cola lata", quantity: 1, unitPrice: 7, options: [], extras: [] }];
    (s as { deliveryType: string | null }).deliveryType = "DELIVERY";
    const yes = advanceSession(s, "1", MENU);
    expect(yes.session.address?.street).toBe("Rua das Flores");
    expect(yes.actions).toContain("QUOTE_DELIVERY");

    const s2 = fresh({ savedAddress: saved });
    s2.stage = "COLLECTING_ADDRESS";
    (s2 as { selectedItems: unknown[] }).selectedItems = [{ menuItemId: "m4", name: "Coca-Cola lata", quantity: 1, unitPrice: 7, options: [], extras: [] }];
    (s2 as { deliveryType: string | null }).deliveryType = "DELIVERY";
    const other = advanceSession(s2, "2", MENU);
    expect(other.suggestedReply).toMatch(/rua, número e bairro/i);
  });
});

describe("Diagnóstico (17–20)", () => {
  it("PASS, sem pedido real, sem Evolution, sem Pix, runtimeTouched=false", () => {
    const r = runWhatsAppTextOrderDiagnostic();
    expect(r.status).toBe("PASS");
    expect(r.p0).toBe(0);
    expect(r.noOrder && r.noEvolution && r.noPix && r.noSend).toBe(true);
    expect(r.runtimeTouched).toBe(false);
  });
});
