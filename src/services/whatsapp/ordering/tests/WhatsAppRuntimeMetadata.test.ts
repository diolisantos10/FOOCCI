/**
 * Runtime metadata wiring — bridge → session.metadata → state machine.
 * Covers: PaymentSettings-driven options (never invented), saved address lookup,
 * once-only enrichment that never throws, and the mode permission gates.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  paymentSettings: { findUnique: vi.fn() },
  order: { findFirst: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import {
  getConfiguredPaymentOptions,
  getSavedAddressForCustomer,
  enrichSessionMetadata,
  renderPaymentQuestion,
} from "../checkoutBridge";
import { modePermissions } from "../WhatsAppTextOrderingRuntimeService";
import { advanceSession } from "../WhatsAppOrderStateMachine";
import type { WaMenuItem, WaPersistedSession } from "../types";

const mk = (over: Partial<WaMenuItem> & Pick<WaMenuItem, "id" | "name" | "price">): WaMenuItem => ({
  priceDelivery: null, isActive: true, isAvailable: true, showInDelivery: true,
  hasVariants: false, variants: [], optionGroups: [], extras: [], ...over,
} as WaMenuItem);
const MENU: WaMenuItem[] = [mk({ id: "m4", name: "Coca-Cola lata", price: 7 })];

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

beforeEach(() => {
  vi.clearAllMocks();
  db.paymentSettings.findUnique.mockResolvedValue({ acceptPix: true, acceptCard: true, acceptCash: true });
  db.order.findFirst.mockResolvedValue({
    deliveryAddress: { street: "Rua das Flores", number: "123", neighborhood: "Centro", city: "SP" },
  });
});

describe("(1/4/5) Opções de pagamento vêm do PaymentSettings — nunca inventadas", () => {
  it("todas configuradas → 3 opções na ordem estável", async () => {
    const o = await getConfiguredPaymentOptions("r1");
    expect(o.order).toEqual(["PIX", "CARD", "CASH"]);
    expect(o.question).toContain("1️⃣ Pix");
    expect(o.question).toContain("2️⃣ Cartão na entrega");
    expect(o.question).toContain("3️⃣ Dinheiro na entrega");
  });

  it("Pix desligado → Pix não aparece; cartão desligado → cartão não aparece", async () => {
    db.paymentSettings.findUnique.mockResolvedValue({ acceptPix: false, acceptCard: true, acceptCash: true });
    const o1 = await getConfiguredPaymentOptions("r1");
    expect(o1.order).toEqual(["CARD", "CASH"]);
    expect(o1.question).not.toContain("Pix");

    db.paymentSettings.findUnique.mockResolvedValue({ acceptPix: true, acceptCard: false, acceptCash: true });
    const o2 = await getConfiguredPaymentOptions("r1");
    expect(o2.order).toEqual(["PIX", "CASH"]);
    expect(o2.question).not.toContain("Cartão");
  });

  it("sem settings → fallback igual ao comportamento atual (3 opções), nunca beco sem saída", async () => {
    db.paymentSettings.findUnique.mockResolvedValue(null);
    const o = await getConfiguredPaymentOptions("r1");
    expect(o.order).toEqual(["PIX", "CARD", "CASH"]);
  });
});

describe("(6) Endereço salvo do cliente", () => {
  it("busca o último endereço de entrega e formata", async () => {
    const a = await getSavedAddressForCustomer("cust-1");
    expect(a).toMatchObject({ street: "Rua das Flores", number: "123" });
    expect(a!.formatted).toContain("Rua das Flores, 123");
  });

  it("sem pedido com endereço → null (não quebra)", async () => {
    db.order.findFirst.mockResolvedValue(null);
    expect(await getSavedAddressForCustomer("cust-1")).toBeNull();
  });
});

describe("enrichSessionMetadata — injeção única, segura e não destrutiva", () => {
  it("(1) injeta paymentQuestion/paymentOptionOrder + savedAddress quando há customer", async () => {
    const r = await enrichSessionMetadata({ restaurantId: "r1", customerId: "cust-1", currentMetadata: null, hasAddress: false });
    expect(r.changed).toBe(true);
    expect(r.paymentInjected).toBe(true);
    expect(r.savedAddressLoaded).toBe(true);
    expect(r.metadata.paymentOptionOrder).toEqual(["PIX", "CARD", "CASH"]);
    expect(String(r.metadata.paymentQuestion)).toContain("Como você quer pagar");
    expect((r.metadata.savedAddress as { street: string }).street).toBe("Rua das Flores");
    expect(r.metadata.bridgeInjectedAt).toBeTruthy();
  });

  it("não sobrescreve metadata existente (idempotente por sessão)", async () => {
    const r = await enrichSessionMetadata({
      restaurantId: "r1", customerId: "cust-1",
      currentMetadata: { paymentOptionOrder: ["CASH"], paymentQuestion: "Q", savedAddress: { street: "X", number: "1", formatted: "X, 1" } },
      hasAddress: false,
    });
    expect(r.paymentInjected).toBe(false);
    expect(r.savedAddressLoaded).toBe(false);
    expect(r.metadata.paymentOptionOrder).toEqual(["CASH"]);
  });

  it("sem customer seguro → não busca endereço; com endereço já na sessão → pula", async () => {
    const r1 = await enrichSessionMetadata({ restaurantId: "r1", customerId: null, currentMetadata: null, hasAddress: false });
    expect(r1.savedAddressLoaded).toBe(false);
    const r2 = await enrichSessionMetadata({ restaurantId: "r1", customerId: "cust-1", currentMetadata: null, hasAddress: true });
    expect(r2.savedAddressLoaded).toBe(false);
    expect(db.order.findFirst).toHaveBeenCalledTimes(0);
  });

  it("falha no DB nunca quebra o turno (fallback default)", async () => {
    db.paymentSettings.findUnique.mockRejectedValue(new Error("down"));
    db.order.findFirst.mockRejectedValue(new Error("down"));
    const r = await enrichSessionMetadata({ restaurantId: "r1", customerId: "cust-1", currentMetadata: null, hasAddress: false });
    // getConfiguredPaymentOptions tem catch interno → fallback 3 opções
    expect(r.metadata.paymentOptionOrder).toEqual(["PIX", "CARD", "CASH"]);
    expect(r.savedAddressLoaded).toBe(false);
  });
});

describe("(9–13) Gates de modo — nenhum modo burla allowlist", () => {
  it("REPLY_ONLY responde mas não cria pedido nem Pix", () => {
    const p = modePermissions("ALLOWLIST_REPLY_ONLY");
    expect(p.canReply).toBe(true);
    expect(p.canCreateOrder).toBe(false);
  });
  it("DRY_RUN não responde nem cria", () => {
    const p = modePermissions("DRY_RUN_ONLY");
    expect(p).toEqual({ canReply: false, canCreateOrder: false });
  });
  it("FULL_TEST é o único com pedido/Pix", () => {
    expect(modePermissions("ALLOWLIST_FULL_TEST")).toEqual({ canReply: true, canCreateOrder: true });
    expect(modePermissions("QUALQUER_OUTRO").canCreateOrder).toBe(false);
  });
});

describe("(2/3/11/12) Metadata injetada governa o fluxo na máquina", () => {
  it("pergunta oficial injetada aparece e o número mapeia para o método", () => {
    const q = renderPaymentQuestion(["PIX", "CASH"]);
    const s = fresh({ paymentQuestion: q, paymentOptionOrder: ["PIX", "CASH"] });
    s.stage = "COLLECTING_PAYMENT_METHOD";
    (s as { selectedItems: unknown[] }).selectedItems = [{ menuItemId: "m4", name: "Coca-Cola lata", quantity: 1, unitPrice: 7, options: [], extras: [] }];
    (s as { deliveryType: string | null }).deliveryType = "PICKUP";
    // pergunta oficial renderizada
    const ask = advanceSession(s, "como pago?", MENU);
    expect(ask.suggestedReply).toContain("Como você quer pagar");
    expect(ask.suggestedReply).not.toContain("Cartão");
    // 2 = CASH (ordem injetada) → troco
    const pick = advanceSession(ask.session, "2", MENU);
    expect(pick.session.paymentMethod).toBe("CASH");
    expect(pick.suggestedReply).toMatch(/troco/i);
  });

  it("(11/12) pedido/Pix só viram ações no fim do fluxo confirmado", () => {
    const a1 = advanceSession(fresh(), "Quero 1 coca-cola lata", MENU);
    expect(a1.actions).not.toContain("CREATE_ORDER");
    const a2 = advanceSession(a1.session, "retirada", MENU);
    const a2b = advanceSession(a2.session, "9", MENU);
    const a3 = advanceSession(a2b.session, "pix", MENU);
    expect(a3.actions).toEqual(expect.arrayContaining(["CREATE_ORDER", "GENERATE_PIX"]));
  });
});
