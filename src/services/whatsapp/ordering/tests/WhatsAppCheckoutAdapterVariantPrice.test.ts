/**
 * WhatsAppCheckoutAdapter — variant price guard (mesmo furo consertado no
 * finalize em 04/08, aplicado aqui).
 *
 * Bug: validateAndPriceItems recalculava TODA linha pelo channelPrice do item
 * BASE e só carregava o variantName — uma pizza Grande saía cobrada pelo preço
 * da base. Estes testes provam que agora o adapter:
 *   (a) precifica linha de variante pela VARIANTE do banco (resolveVariantPrice),
 *       nunca pelo item base nem pelo unitPrice da sessão;
 *   (b) rejeita variante de outro item / inexistente — falha fechada com
 *       replyText (chega ao cliente via blockedReply, sem "pedido anotado" falso);
 *   (c) rejeita variante indisponível — falha fechada com replyText;
 *   (d) regressão: linha sem variante segue no channelPrice do item base e a
 *       tabela de variantes nem é consultada;
 *   (e) fallback defensivo: variantName sem variantId resolve por nome exato
 *       dentro das variantes DO item;
 *   (f) variante + opções + extras somam com preços do banco;
 *   (g) herança de canal: variante com priceDelivery usa o override do canal;
 *   (h) retirada cobra o canal DELIVERY que a conversa mostrou ("cobra-se o que
 *       a tela mostrou" — decisão do CEO 04/08, estendida ao WhatsApp);
 *   (i) item base indisponível também falha fechada COM replyText — nunca
 *       "pedido anotado" sem pedido criado.
 *
 * Sem promoção aqui de propósito: o fluxo do WhatsApp NÃO aplica promoção de
 * cardápio em lugar nenhum (nem na exibição, nem no adapter) — não inventar.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { validateAndPriceItems } from "../WhatsAppCheckoutAdapter";
import type { WaPersistedSession, WaOrderItem } from "../types";

const db = vi.hoisted(() => ({
  menuItem:        { findMany: vi.fn() },
  menuItemVariant: { findMany: vi.fn() },
  optionGroupItem: { findMany: vi.fn() },
  menuItemExtra:   { findMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const PIZZA = {
  id: "item_pizza", price: 52.9, priceDelivery: null, priceDineIn: null, priceIfood: null,
  categoryId: "cat_1", category: { name: "Pizzas" },
};
const REFRI = {
  id: "item_refri", price: 10, priceDelivery: 12, priceDineIn: null, priceIfood: null,
  categoryId: "cat_2", category: { name: "Bebidas" },
};
const VARIANTS = [
  { id: "var_g",   menuItemId: "item_pizza", name: "Grande",  isAvailable: true,  price: 64.9, priceDelivery: null, priceDineIn: null, priceIfood: null },
  { id: "var_off", menuItemId: "item_pizza", name: "Família", isAvailable: false, price: 89.9, priceDelivery: null, priceDineIn: null, priceIfood: null },
  // Variante com override de canal: DELIVERY manda (herança testada em (g))
  { id: "var_2l",  menuItemId: "item_refri", name: "2L",      isAvailable: true,  price: 14,   priceDelivery: 16, priceDineIn: null, priceIfood: null },
];

function makeSession(items: WaOrderItem[], over: Partial<WaPersistedSession> = {}): WaPersistedSession {
  const now = new Date();
  return {
    id: "sess-1", restaurantId: "rest-1", customerId: null, conversationId: null,
    phone: "+5511999990000", status: "READY_TO_CONFIRM", stage: "REVIEWING_ORDER",
    selectedItems: items, unresolvedItems: [], missingQuestions: [],
    deliveryType: "DELIVERY", address: null, deliveryQuote: null,
    paymentMethod: "CASH", paymentStatus: null, orderDraftId: null, orderId: null,
    pixPaymentId: null, mode: "ALLOWLIST_FULL_TEST", source: "webhook",
    metadata: null, lastMessageAt: now, expiresAt: null, createdAt: now, updatedAt: now,
    ...over,
  };
}

function waItem(over: Partial<WaOrderItem> = {}): WaOrderItem {
  return {
    rawText: "pizza grande", quantity: 1,
    menuItemId: "item_pizza", menuItemName: "Quatro Queijos",
    options: [], extras: [], unitPrice: 52.9, lineTotal: 52.9,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.menuItem.findMany.mockResolvedValue([PIZZA, REFRI]);
  db.menuItemVariant.findMany.mockResolvedValue(VARIANTS);
  db.optionGroupItem.findMany.mockResolvedValue([{ id: "opt_1", price: 3 }]);
  db.menuItemExtra.findMany.mockResolvedValue([{ id: "ext_1", price: 5 }]);
});

describe("(a) variant line prices from the DB VARIANT, never the base item / session", () => {
  it("charges the variant price and records the DB variant name", async () => {
    const res = await validateAndPriceItems(makeSession([
      waItem({ variantId: "var_g", variantName: "Grande", unitPrice: 1, lineTotal: 1 }),
    ]));

    expect(res.ok).toBe(true);
    expect(res.items![0]).toMatchObject({
      menuItemId: "item_pizza", price: 64.9, variantName: "Grande",
    });
    // O sintoma do bug (base 52.90 cobrada na Grande) não pode voltar:
    expect(res.items![0].price).not.toBe(52.9);
    // E o unitPrice adulterado/defasado da sessão nunca é confiado:
    expect(res.items![0].price).not.toBe(1);
  });
});

describe("(b) invalid variant fails CLOSED with a customer-facing replyText", () => {
  it("variant of ANOTHER item → ok:false", async () => {
    const res = await validateAndPriceItems(makeSession([
      waItem({ variantId: "var_2l", variantName: "2L" }), // var_2l pertence ao refri
    ]));
    expect(res.ok).toBe(false);
    expect(res.reason).toContain("opção inválida");
    expect(res.replyText).toBeTruthy();
    expect(res.items).toBeUndefined();
  });

  it("nonexistent variantId → ok:false", async () => {
    const res = await validateAndPriceItems(makeSession([
      waItem({ variantId: "var_ghost", variantName: "Fantasma" }),
    ]));
    expect(res.ok).toBe(false);
    expect(res.reason).toContain("opção inválida");
    expect(res.replyText).toBeTruthy();
  });
});

describe("(c) unavailable variant fails CLOSED", () => {
  it("isAvailable=false → ok:false with a clear 'indisponível'", async () => {
    const res = await validateAndPriceItems(makeSession([
      waItem({ variantId: "var_off", variantName: "Família" }),
    ]));
    expect(res.ok).toBe(false);
    expect(res.reason).toContain("opção indisponível");
    expect(res.replyText).toContain("indisponível");
  });
});

describe("(d) regression — plain line (no variant)", () => {
  it("still charges the base item's channel price; variant table never queried", async () => {
    const res = await validateAndPriceItems(makeSession([
      waItem({ unitPrice: 1, lineTotal: 1 }),
    ]));
    expect(res.ok).toBe(true);
    expect(res.items![0]).toMatchObject({ price: 52.9, variantName: null });
    expect(db.menuItemVariant.findMany).not.toHaveBeenCalled();
  });
});

describe("(e) defensive fallback — variantName without variantId", () => {
  it("resolves by exact name within THIS item's variants", async () => {
    const res = await validateAndPriceItems(makeSession([
      waItem({ variantName: "Grande" }), // sessão antiga sem variantId
    ]));
    expect(res.ok).toBe(true);
    expect(res.items![0]).toMatchObject({ price: 64.9, variantName: "Grande" });
  });

  it("name that matches nothing on THIS item → fail closed", async () => {
    const res = await validateAndPriceItems(makeSession([
      waItem({ variantName: "2L" }), // "2L" existe, mas no refri — não na pizza
    ]));
    expect(res.ok).toBe(false);
    expect(res.reason).toContain("opção inválida");
  });
});

describe("(f) variant + options + extras sum with DB prices", () => {
  it("64.90 (variante) + 3.00 (opção) + 2 × 5.00 (extra) = 77.90", async () => {
    const res = await validateAndPriceItems(makeSession([
      waItem({
        variantId: "var_g", variantName: "Grande", unitPrice: 1,
        options: [{ groupId: "g1", groupName: "Borda", optionId: "opt_1", optionName: "Catupiry", price: 0 }],
        extras:  [{ extraId: "ext_1", extraName: "Bacon", quantity: 2, price: 0 }],
      }),
    ]));
    expect(res.ok).toBe(true);
    expect(res.items![0].price).toBeCloseTo(77.9, 2);
    expect(res.items![0].selectedOptions?.[0]?.priceAdjustment).toBe(3);
    expect(res.items![0].selectedExtras?.[0]?.unitPrice).toBe(5);
  });
});

describe("(g) channel inheritance via resolveVariantPrice", () => {
  it("DELIVERY session uses the variant's priceDelivery override", async () => {
    const res = await validateAndPriceItems(makeSession([
      waItem({ menuItemId: "item_refri", menuItemName: "Refrigerante", variantId: "var_2l", variantName: "2L" }),
    ]));
    expect(res.ok).toBe(true);
    expect(res.items![0].price).toBe(16); // override DELIVERY da variante, não 14
  });
});

describe("(h) pickup charges the DELIVERY price the chat showed (CEO 04/08)", () => {
  const CALZONE = {
    id: "item_cal", price: 50, priceDelivery: 55, priceDineIn: 45, priceIfood: null,
    categoryId: "cat_1", category: { name: "Pizzas" },
  };
  const CAL_VARIANTS = [{
    id: "var_cg", menuItemId: "item_cal", name: "Grande", isAvailable: true,
    price: 60, priceDelivery: 70, priceDineIn: 62, priceIfood: null,
  }];

  it("PICKUP session: base item charges priceDelivery (55), never priceDineIn (45)", async () => {
    db.menuItem.findMany.mockResolvedValue([CALZONE]);
    const res = await validateAndPriceItems(makeSession(
      [waItem({ menuItemId: "item_cal", menuItemName: "Calzone" })],
      { deliveryType: "PICKUP" },
    ));
    expect(res.ok).toBe(true);
    expect(res.items![0].price).toBe(55);      // o que a conversa mostrou (DELIVERY)
    expect(res.items![0].price).not.toBe(45);  // nunca o DINE_IN escondido
  });

  it("PICKUP session: variant line charges the variant's DELIVERY override (70), never DINE_IN (62)", async () => {
    db.menuItem.findMany.mockResolvedValue([CALZONE]);
    db.menuItemVariant.findMany.mockResolvedValue(CAL_VARIANTS);
    const res = await validateAndPriceItems(makeSession(
      [waItem({ menuItemId: "item_cal", menuItemName: "Calzone", variantId: "var_cg", variantName: "Grande" })],
      { deliveryType: "PICKUP" },
    ));
    expect(res.ok).toBe(true);
    expect(res.items![0].price).toBe(70);
    expect(res.items![0].price).not.toBe(62);
  });
});

describe("(i) unavailable BASE item fails closed with a customer-facing replyText", () => {
  it("item not in the live menu → ok:false + replyText (never a false 'pedido anotado')", async () => {
    db.menuItem.findMany.mockResolvedValue([]); // item sumiu do cardápio vivo
    const res = await validateAndPriceItems(makeSession([
      waItem({ menuItemId: "item_ghost", menuItemName: "Pizza Extinta" }),
    ]));
    expect(res.ok).toBe(false);
    expect(res.reason).toContain("item indisponível");
    expect(res.replyText).toContain("indisponível");
    expect(res.items).toBeUndefined();
  });
});
