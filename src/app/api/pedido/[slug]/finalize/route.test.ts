/**
 * /api/pedido/[slug]/finalize — server-side price guard for VARIANT lines.
 *
 * Bug de dinheiro (04/08): o verifiedCart recalculava toda linha como
 * channelPrice(item base) e ignorava a variante escolhida — Quatro Queijos
 * Grande (R$ 64,90 na tela) era gravado pelo preço base + soma errada.
 *
 * These tests prove the guard now:
 *   (a) prices a variant line from the DB variant (resolveVariantPrice);
 *   (b) overrides a tampered client price with the DB variant price;
 *   (c) rejects a variant that belongs to another item (or doesn't exist) → 400;
 *   (d) rejects an unavailable variant → 400;
 *   (e) sums variant + options + extras with DB prices;
 *   (f) keeps plain (non-variant) lines exactly as before (regression);
 *   (g) mirrors the client promotion rule: promo applies to plain lines only,
 *       NEVER to variant lines (PedidoClient/ProductModal charge the plain
 *       variant price);
 *   (h) resolves the variant from the `${baseItemId}_${variantId}` line-id
 *       convention when variantId is missing (older cached clients);
 *   (i) pickup charges the DELIVERY-channel price/promotion the screen showed
 *       ("cobra-se o que a tela mostrou" — decisão do CEO 04/08), delivery
 *       unchanged.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const db = vi.hoisted(() => {
  const d = {
    restaurant:      { findUnique: vi.fn(), update: vi.fn() },
    menuItem:        { findMany: vi.fn() },
    menuItemVariant: { findMany: vi.fn() },
    optionGroupItem: { findMany: vi.fn() },
    menuItemExtra:   { findMany: vi.fn() },
    order:           { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
    orderDraft:      { updateMany: vi.fn() },
    payment:         { create: vi.fn() },
    deliveryConfig:  { findUnique: vi.fn() },
    promotion:       { findFirst: vi.fn() },
    integrationConfig: { findUnique: vi.fn() },
    $transaction:    vi.fn(),
  };
  d.$transaction.mockImplementation(async (ops: unknown) =>
    Array.isArray(ops) ? Promise.all(ops) : (ops as (tx: unknown) => unknown)(d),
  );
  return d;
});
vi.mock("@/lib/prisma", () => ({ prisma: db }));

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => ({ limited: false }),
  getClientIp: () => "1.1.1.1",
  rateLimitResponse: () => new Response(null, { status: 429 }),
}));
vi.mock("@/lib/business-hours", () => ({ isRestaurantOpenNow: vi.fn(async () => true) }));
vi.mock("@/lib/mercadopago", () => ({ createPixPayment: vi.fn() }));
vi.mock("@/lib/stone", () => ({ createPaymentLink: vi.fn() }));
vi.mock("@/lib/crypto", () => ({ decrypt: vi.fn(() => "{}") }));
vi.mock("@/services/payment/PaymentRouter", () => ({
  resolveCardProvider: vi.fn(),
  resolveCardOperator: vi.fn(),
}));
vi.mock("@/lib/delivery-fee-resolver", () => ({ resolveDeliveryFee: vi.fn() }));
vi.mock("@/services/crm/CustomerMetricsSyncService", () => ({
  CustomerMetricsSyncService: { syncOrderToCustomerMetrics: vi.fn(async () => null) },
}));
vi.mock("@/services/crm/CustomerCouponService", () => ({
  CustomerCouponService: { findRedeemable: vi.fn() },
}));
vi.mock("@/services/print/PrintQueueService", () => ({
  PrintQueueService: { maybeEnqueueOrder: vi.fn(async () => null) },
}));
vi.mock("@/services/fiscal/FiscalEmissionService", () => ({
  FiscalEmissionService: { maybeEmitForOrder: vi.fn(async () => null) },
}));

const createOrderRecord = vi.hoisted(() =>
  vi.fn(async () => ({ orderId: "ord_1", customerId: "cust_1" })),
);
vi.mock("@/services/checkout/CheckoutFinalizationService", () => ({ createOrderRecord }));

// getActiveMenuPromotions is mocked (controlled per test); resolveMenuItemPromotion
// stays REAL so the guard's promo math is the production one.
const promos = vi.hoisted(() => ({ current: [] as unknown[] }));
vi.mock("@/services/promotions/productPromotionResolver", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/promotions/productPromotionResolver")>();
  return { ...actual, getActiveMenuPromotions: vi.fn(async () => promos.current) };
});

import { POST } from "./route";
import { getActiveMenuPromotions } from "@/services/promotions/productPromotionResolver";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ITEM_1 = {
  id: "item_1", price: 52.9, priceDelivery: null, priceDineIn: null, priceIfood: null,
  categoryId: "cat_1", category: { name: "Pizzas" },
};
const ITEM_2 = {
  id: "item_2", price: 10, priceDelivery: null, priceDineIn: null, priceIfood: null,
  categoryId: "cat_1", category: { name: "Bebidas" },
};
const VARIANTS = [
  { id: "var_g",   menuItemId: "item_1", name: "Grande",  isAvailable: true,  price: 64.9, priceDelivery: null, priceDineIn: null, priceIfood: null },
  { id: "var_p",   menuItemId: "item_1", name: "Pequena", isAvailable: true,  price: 52.9, priceDelivery: null, priceDineIn: null, priceIfood: null },
  { id: "var_off", menuItemId: "item_1", name: "Família", isAvailable: false, price: 89.9, priceDelivery: null, priceDineIn: null, priceIfood: null },
  { id: "var_i2",  menuItemId: "item_2", name: "2L",      isAvailable: true,  price: 14,   priceDelivery: null, priceDineIn: null, priceIfood: null },
];

const params = Promise.resolve({ slug: "sushi" });

function postReq(body: unknown) {
  return new NextRequest("https://foocci.com.br/api/pedido/sushi/finalize", {
    method: "POST",
    body:   JSON.stringify(body),
  });
}

function baseBody(cart: unknown[]) {
  return {
    cart,
    customerName:     "Diego",
    deliveryMethod:   "pickup",
    address:          {},
    paymentMode:      "pay_on_pickup",
    paymentMethodSub: "cash",
  };
}

/** The items array the route handed to createOrderRecord. */
function recordedItems() {
  expect(createOrderRecord).toHaveBeenCalledTimes(1);
  return (createOrderRecord.mock.calls[0] as unknown[])[0] as {
    subtotal: number;
    total: number;
    items: Array<{
      menuItemId: string; name: string; price: number; qty: number;
      variantName: string | null;
      selectedOptions?: Array<{ optionId: string; priceAdjustment: number }>;
      selectedExtras?: Array<{ extraId: string; unitPrice: number }>;
    }>;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  promos.current = [];
  db.restaurant.findUnique.mockImplementation(async (args: { select?: Record<string, unknown> }) =>
    args?.select && "isOrderingPaused" in args.select
      ? { isOrderingPaused: false, orderingPausedUntil: null, orderingPausedReason: null }
      : { id: "rest_1", name: "Sushi do Teste", storeProfile: null },
  );
  db.menuItem.findMany.mockResolvedValue([ITEM_1, ITEM_2]);
  db.menuItemVariant.findMany.mockResolvedValue(VARIANTS);
  db.optionGroupItem.findMany.mockResolvedValue([{ id: "opt_1", price: 3 }]);
  db.menuItemExtra.findMany.mockResolvedValue([{ id: "ext_1", price: 5 }]);
  db.order.findUnique.mockResolvedValue(null); // no idempotent duplicate
  db.orderDraft.updateMany.mockResolvedValue({ count: 0 });
  db.payment.create.mockResolvedValue({});
  db.order.update.mockResolvedValue({});
  createOrderRecord.mockResolvedValue({ orderId: "ord_1", customerId: "cust_1" });
});

describe("POST finalize — variant price guard", () => {
  it("(a) prices a variant line from the DB variant, not the base item", async () => {
    const res = await POST(postReq(baseBody([{
      id: "item_1_var_g", baseItemId: "item_1",
      variantId: "var_g", variantName: "Grande",
      name: "Quatro Queijos — Grande", price: 64.9, qty: 1,
    }])), { params });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ orderId: "ord_1", confirmed: true });
    const input = recordedItems();
    expect(input.items[0]).toMatchObject({
      menuItemId: "item_1", price: 64.9, variantName: "Grande",
    });
    // The E2E symptom (base 52.90 charged for the Grande) can never recur:
    expect(input.items[0].price).not.toBe(52.9);
    expect(input.subtotal).toBeCloseTo(64.9, 2);
    expect(input.total).toBeCloseTo(64.9, 2);
  });

  it("(b) overrides a tampered (lower) client price with the DB variant price", async () => {
    const res = await POST(postReq(baseBody([{
      id: "item_1_var_g", baseItemId: "item_1",
      variantId: "var_g", variantName: "Grande",
      name: "Quatro Queijos — Grande", price: 1, qty: 2,
    }])), { params });

    expect(res.status).toBe(200);
    const input = recordedItems();
    expect(input.items[0].price).toBe(64.9);
    expect(input.subtotal).toBeCloseTo(129.8, 2);
  });

  it("(c) rejects a variant that belongs to ANOTHER item with a 400", async () => {
    const res = await POST(postReq(baseBody([{
      id: "item_1_var_i2", baseItemId: "item_1",
      variantId: "var_i2", variantName: "2L", // var_i2 is item_2's variant
      name: "Quatro Queijos — 2L", price: 14, qty: 1,
    }])), { params });

    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("Opção inválida");
    expect(createOrderRecord).not.toHaveBeenCalled();
  });

  it("(c') rejects a nonexistent variant with a 400", async () => {
    const res = await POST(postReq(baseBody([{
      id: "item_1_var_ghost", baseItemId: "item_1",
      variantId: "var_ghost", variantName: "Fantasma",
      name: "Quatro Queijos — Fantasma", price: 64.9, qty: 1,
    }])), { params });

    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("Opção inválida");
    expect(createOrderRecord).not.toHaveBeenCalled();
  });

  it("(d) rejects an unavailable variant with a 400", async () => {
    const res = await POST(postReq(baseBody([{
      id: "item_1_var_off", baseItemId: "item_1",
      variantId: "var_off", variantName: "Família",
      name: "Quatro Queijos — Família", price: 89.9, qty: 1,
    }])), { params });

    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("Opção indisponível");
    expect(createOrderRecord).not.toHaveBeenCalled();
  });

  it("(e) sums variant + options + extras with DB prices (tampered add-ons rebuilt)", async () => {
    const res = await POST(postReq(baseBody([{
      id: "item_1_var_g", baseItemId: "item_1",
      variantId: "var_g", variantName: "Grande",
      name: "Quatro Queijos — Grande", price: 1, qty: 1,
      selectedOptions: [{ groupId: "g1", groupName: "Borda", optionId: "opt_1", optionName: "Catupiry", qty: 1, priceAdjustment: 0 }],
      selectedExtras:  [{ extraId: "ext_1", name: "Bacon", unitPrice: 0, qty: 2 }],
    }])), { params });

    expect(res.status).toBe(200);
    const input = recordedItems();
    // 64.90 (variant, DB) + 3.00 (option, DB) + 2 × 5.00 (extra, DB) = 77.90
    expect(input.items[0].price).toBeCloseTo(77.9, 2);
    expect(input.items[0].selectedOptions?.[0]?.priceAdjustment).toBe(3);
    expect(input.items[0].selectedExtras?.[0]?.unitPrice).toBe(5);
  });

  it("(f) regression: a plain (non-variant) line still charges the DB base price", async () => {
    const res = await POST(postReq(baseBody([{
      id: "item_1", name: "Quatro Queijos", price: 1, qty: 2,
    }])), { params });

    expect(res.status).toBe(200);
    const input = recordedItems();
    expect(input.items[0]).toMatchObject({ menuItemId: "item_1", price: 52.9, variantName: null });
    expect(input.subtotal).toBeCloseTo(105.8, 2);
    // No variant intent in the cart → the variant table is never queried.
    expect(db.menuItemVariant.findMany).not.toHaveBeenCalled();
  });

  it("(g) promotion applies to the plain line only — NEVER to the variant line (client rule mirrored)", async () => {
    promos.current = [{
      id: "promo_1", target: "PRODUCT", type: "PERCENTAGE", discountValue: 50,
      targetProductIds: ["item_1"], targetCategoryIds: [], channel: "ALL",
    }];

    const res = await POST(postReq(baseBody([
      { id: "item_1", name: "Quatro Queijos", price: 26.45, qty: 1 },
      {
        id: "item_1_var_g", baseItemId: "item_1",
        variantId: "var_g", variantName: "Grande",
        name: "Quatro Queijos — Grande", price: 64.9, qty: 1,
      },
    ])), { params });

    expect(res.status).toBe(200);
    const input = recordedItems();
    expect(input.items[0].price).toBeCloseTo(26.45, 2); // plain: 52.90 − 50%
    expect(input.items[1].price).toBe(64.9);            // variant: untouched by promo
  });

  it("(i) pickup charges the DELIVERY price the screen showed — base item (CEO 04/08)", async () => {
    // priceDineIn ≠ priceDelivery: a tela do /pedido mostra o DELIVERY (55.00);
    // a retirada tem de cobrar exatamente isso, nunca o DINE_IN (45.00).
    db.menuItem.findMany.mockResolvedValue([{
      id: "item_ch", price: 50, priceDelivery: 55, priceDineIn: 45, priceIfood: null,
      categoryId: "cat_1", category: { name: "Pizzas" },
    }]);

    const res = await POST(postReq(baseBody([{
      id: "item_ch", name: "Calabresa", price: 55, qty: 1,
    }])), { params });

    expect(res.status).toBe(200);
    const input = recordedItems();
    expect(input.items[0].price).toBe(55);   // o que a tela mostrou
    expect(input.items[0].price).not.toBe(45); // nunca o DINE_IN escondido
    expect(input.subtotal).toBeCloseTo(55, 2);
  });

  it("(i') pickup charges the DELIVERY price the screen showed — variant line (CEO 04/08)", async () => {
    db.menuItem.findMany.mockResolvedValue([{
      id: "item_ch", price: 50, priceDelivery: 55, priceDineIn: 45, priceIfood: null,
      categoryId: "cat_1", category: { name: "Pizzas" },
    }]);
    db.menuItemVariant.findMany.mockResolvedValue([{
      id: "var_ch", menuItemId: "item_ch", name: "Grande", isAvailable: true,
      price: 60, priceDelivery: 70, priceDineIn: 62, priceIfood: null,
    }]);

    const res = await POST(postReq(baseBody([{
      id: "item_ch_var_ch", baseItemId: "item_ch",
      variantId: "var_ch", variantName: "Grande",
      name: "Calabresa — Grande", price: 70, qty: 1,
    }])), { params });

    expect(res.status).toBe(200);
    const input = recordedItems();
    expect(input.items[0].price).toBe(70);   // variante no canal DELIVERY (tela)
    expect(input.items[0].price).not.toBe(62); // nunca o DINE_IN da variante
  });

  it("(i'') pickup loads promotions from the DELIVERY channel and applies them on the DELIVERY price", async () => {
    db.menuItem.findMany.mockResolvedValue([{
      id: "item_ch", price: 50, priceDelivery: 55, priceDineIn: 45, priceIfood: null,
      categoryId: "cat_1", category: { name: "Pizzas" },
    }]);
    promos.current = [{
      id: "promo_d", target: "PRODUCT", type: "PERCENTAGE", discountValue: 50,
      targetProductIds: ["item_ch"], targetCategoryIds: [], channel: "DELIVERY",
    }];

    const res = await POST(postReq(baseBody([{
      id: "item_ch", name: "Calabresa", price: 27.5, qty: 1,
    }])), { params });

    expect(res.status).toBe(200);
    // A rota busca as promoções no canal que a tela usa (DELIVERY), mesmo no pickup
    expect(getActiveMenuPromotions).toHaveBeenCalledWith("rest_1", "DELIVERY");
    const input = recordedItems();
    expect(input.items[0].price).toBeCloseTo(27.5, 2); // 55.00 (DELIVERY) − 50%
  });

  it("(i''') delivery keeps charging the DELIVERY price (regression — unchanged)", async () => {
    db.menuItem.findMany.mockResolvedValue([{
      id: "item_ch", price: 50, priceDelivery: 55, priceDineIn: 45, priceIfood: null,
      categoryId: "cat_1", category: { name: "Pizzas" },
    }]);
    db.deliveryConfig.findUnique.mockResolvedValue(null); // sem config → taxa 0, não bloqueia

    const res = await POST(postReq({
      ...baseBody([{ id: "item_ch", name: "Calabresa", price: 55, qty: 1 }]),
      deliveryMethod: "delivery",
      paymentMode:    "pay_on_delivery",
      address: { street: "Rua A", number: "1", neighborhood: "Centro", city: "SP", state: "SP", cep: "01000-000" },
    }), { params });

    expect(res.status).toBe(200);
    const input = recordedItems();
    expect(input.items[0].price).toBe(55);
  });

  it("(h) resolves the variant from the line-id convention when variantId is missing", async () => {
    const res = await POST(postReq(baseBody([{
      // Older cached client: no variantId field, id carries `${baseItemId}_${variantId}`
      id: "item_1_var_g", baseItemId: "item_1", variantName: "Grande",
      name: "Quatro Queijos — Grande", price: 1, qty: 1,
    }])), { params });

    expect(res.status).toBe(200);
    const input = recordedItems();
    expect(input.items[0].price).toBe(64.9);
    expect(input.items[0].variantName).toBe("Grande");
  });
});

/**
 * A trava de canal — o risco NOVO criado em 05/08/2026.
 *
 * A partir do caso da Júlia (sushi-cazza), o Garçom passou a CONTAR sobre itens
 * que a casa só serve no salão: "Temos rodízio sim, R$ 99, só no salão". Falar de
 * um produto e poder vendê-lo são coisas diferentes — e antes desta data a rota
 * de finalização não olhava `showInDelivery`. Um id de rodízio presencial que
 * chegasse ao carrinho viraria um pedido de ENTREGA de um rodízio.
 *
 * Nenhum pedido legítimo se perde: a loja só renderiza `showInDelivery: true`
 * (`page.tsx:336`), então o filtro aqui é o espelho do que o cliente vê.
 */
describe("POST finalize — item de salão nunca vira pedido de entrega", () => {
  it("a consulta do carrinho exige showInDelivery — o canal é parte da validação", async () => {
    await POST(postReq(baseBody([{ id: "item_1", name: "Calabresa", price: 52.9, qty: 1 }])), { params });

    const where = (db.menuItem.findMany.mock.calls[0] as Array<{ where: Record<string, unknown> }>)[0].where;
    expect(where).toMatchObject({ isActive: true, isAvailable: true, showInDelivery: true });
  });

  it("rodízio presencial no carrinho é recusado com 400, não vira pedido", async () => {
    // O banco não devolve o item porque ele é showInDelivery=false — exatamente
    // o que o `where` acima provoca.
    db.menuItem.findMany.mockResolvedValue([]);

    const res = await POST(postReq(baseBody([{
      id: "rodizio-presencial", name: "RODIZIO PRESENCIAL", price: 99, qty: 2,
    }])), { params });

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: expect.stringContaining("indisponível") });
    expect(createOrderRecord).not.toHaveBeenCalled();
  });

  it("item normal de delivery continua finalizando (a trava não é destrutiva)", async () => {
    const res = await POST(postReq(baseBody([{ id: "item_1", name: "Calabresa", price: 52.9, qty: 1 }])), { params });
    expect(res.status).toBe(200);
    expect(createOrderRecord).toHaveBeenCalledTimes(1);
  });
});
