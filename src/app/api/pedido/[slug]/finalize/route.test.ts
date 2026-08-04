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
 *       convention when variantId is missing (older cached clients).
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
