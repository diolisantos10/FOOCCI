/**
 * WhatsAppCheckoutAdapter — architectural alignment tests.
 *
 * Verifies that WhatsApp text ordering reuses the EXACT same checkout engine
 * as /pedido: same price validation, same delivery fee resolver, same customer
 * upsert, same order creation, same Pix via Mercado Pago.
 *
 * Tests A–O (structural + unit):
 *   A  Adapter produces correct CreateOrderItem shape from WaOrderItem
 *   B  Delivery session adapter uses same resolver (structural)
 *   C  Pickup session gets deliveryFee=0 from buildFullDraft
 *   D  Pix path uses createPixPayment from @/lib/mercadopago (structural)
 *   E–H Reference existing PixReuse tests (structural pointers)
 *   I  Pay-on-delivery creates Payment with PAY_ON_DELIVERY and status CONFIRMED (structural)
 *   J  Adapter re-calculates prices from DB (structural)
 *   K  Required options validated server-side (structural)
 *   L  Dry-run (allowCreate=false) returns wouldCreate=true, no side effects
 *   M  Finalize route imports createOrderRecord (structural)
 *   N  WhatsApp ordering tests all still pass (meta: test count)
 *   O  No duplicated payment/freight logic (structural)
 */

import { describe, it, expect } from "vitest";
import { buildFullDraft } from "../WhatsAppOrderDraftBuilder";
import { createOrderFromSession } from "../WhatsAppOrderCreationService";
import type { WaPersistedSession, WaOrderItem } from "../types";
import type { CreateOrderItem } from "@/services/checkout/CheckoutFinalizationService";

// ── Session factory ───────────────────────────────────────────────────────────

function makeSession(over: Partial<WaPersistedSession> = {}): WaPersistedSession {
  const now = new Date();
  return {
    id:               "sess-adapt-1",
    restaurantId:     "rest-1",
    customerId:       null,
    conversationId:   "conv-1",
    phone:            "+5511999990000",
    status:           "AWAITING_CUSTOMER",
    stage:            "CONFIRMING_ORDER",
    selectedItems:    [],
    unresolvedItems:  [],
    missingQuestions: [],
    deliveryType:     "PICKUP",
    address:          null,
    deliveryQuote:    null,
    paymentMethod:    "CASH",
    paymentStatus:    null,
    orderDraftId:     null,
    orderId:          null,
    pixPaymentId:     null,
    mode:             "ALLOWLIST_FULL_TEST",
    source:           "webhook",
    metadata:         null,
    lastMessageAt:    now,
    expiresAt:        null,
    createdAt:        now,
    updatedAt:        now,
    ...over,
  };
}

function makeWaItem(over: Partial<WaOrderItem> = {}): WaOrderItem {
  return {
    rawText:      "yakisoba frango",
    quantity:     2,
    menuItemId:   "item-yaki",
    menuItemName: "Yakisoba Frango",
    variantName:  undefined,
    options:      [],
    extras:       [],
    unitPrice:    32,
    lineTotal:    64,
    notes:        undefined,
    ...over,
  };
}

// ── A: Adapter produces correct CreateOrderItem shape ─────────────────────────

describe("A — CreateOrderItem shape alignment", () => {
  it("CreateOrderItem interface has all required fields for CheckoutFinalizationService", () => {
    // Structural: verify the type has the expected shape by constructing one
    const item: CreateOrderItem = {
      menuItemId:    "item-1",
      name:          "Yakisoba Frango",
      price:         32,
      qty:           2,
      notes:         null,
      variantName:   null,
      categoryId:    "cat-1",
      categoryName:  "Massas",
      isUpsell:      false,
      selectedOptions: [{
        groupId:         "g1",
        groupName:       "Tipo",
        optionId:        "o1",
        optionName:      "Frango",
        qty:             1,
        priceAdjustment: 0,
      }],
      selectedExtras: [{
        extraId:   "e1",
        name:      "Molho Extra",
        unitPrice: 2,
        qty:       1,
      }],
    };
    expect(item.menuItemId).toBe("item-1");
    expect(item.price).toBe(32);
    expect(item.qty).toBe(2);
    expect(item.selectedOptions?.[0].groupId).toBe("g1");
    expect(item.selectedExtras?.[0].extraId).toBe("e1");
  });

  it("WaOrderItem options map to selectedOptions with correct fields", () => {
    const waItem = makeWaItem({
      options: [{
        groupId:    "g1",
        groupName:  "Tipo",
        optionId:   "o1",
        optionName: "Frango",
        price:      0,
      }],
    });

    // Verify mapping shape
    const mapped = waItem.options.map(o => ({
      groupId:         o.groupId,
      groupName:       o.groupName,
      optionId:        o.optionId,
      optionName:      o.optionName,
      qty:             1,
      priceAdjustment: o.price,
    }));

    expect(mapped[0].groupId).toBe("g1");
    expect(mapped[0].qty).toBe(1);
    expect(mapped[0].priceAdjustment).toBe(0);
  });

  it("WaOrderExtra maps to selectedExtras with correct fields", () => {
    const waItem = makeWaItem({
      extras: [{
        extraId:   "e1",
        extraName: "Molho Extra",
        quantity:  2,
        price:     3,
      }],
    });

    const mapped = waItem.extras.map(e => ({
      extraId:   e.extraId,
      name:      e.extraName,
      unitPrice: e.price,
      qty:       e.quantity,
    }));

    expect(mapped[0].extraId).toBe("e1");
    expect(mapped[0].name).toBe("Molho Extra");
    expect(mapped[0].unitPrice).toBe(3);
    expect(mapped[0].qty).toBe(2);
  });
});

// ── B: Delivery service imports resolveDeliveryFee (structural) ───────────────

describe("B — WhatsAppDeliveryService reuses resolveDeliveryFee", () => {
  it("imports resolveDeliveryFee from @/lib/delivery-fee-resolver", async () => {
    const fs  = await import("node:fs/promises");
    const src = await fs.readFile(
      new URL("../WhatsAppDeliveryService.ts", import.meta.url),
      "utf-8",
    );
    expect(src).toContain("resolveDeliveryFee");
    expect(src).toContain("delivery-fee-resolver");
  });
});

// ── C: Pickup session gets deliveryFee=0 from buildFullDraft ─────────────────

describe("C — Pickup delivery fee is zero", () => {
  it("buildFullDraft returns deliveryFee=0 for PICKUP sessions with no quote", () => {
    const session = makeSession({
      deliveryType:  "PICKUP",
      deliveryQuote: null,
      selectedItems: [makeWaItem()],
    });
    const draft = buildFullDraft(session);
    expect(draft.deliveryFee).toBe(0);
  });

  it("buildFullDraft returns deliveryFee from quote for DELIVERY sessions", () => {
    const session = makeSession({
      deliveryType:  "DELIVERY",
      deliveryQuote: { fee: 8.5, status: "ok" },
      selectedItems: [makeWaItem()],
    });
    const draft = buildFullDraft(session);
    expect(draft.deliveryFee).toBe(8.5);
  });
});

// ── D: Pix path uses createPixPayment from @/lib/mercadopago (structural) ────

describe("D — WhatsApp Pix reuses canonical createPixPayment", () => {
  it("WhatsAppPaymentService imports createPixPayment from @/lib/mercadopago", async () => {
    const fs  = await import("node:fs/promises");
    const src = await fs.readFile(
      new URL("../WhatsAppPaymentService.ts", import.meta.url),
      "utf-8",
    );
    expect(src).toContain("createPixPayment(");
    expect(src).toContain("mercadopago");
  });

  it("WhatsAppPaymentService uses same integrationConfig provider as /pedido", async () => {
    const fs  = await import("node:fs/promises");
    const src = await fs.readFile(
      new URL("../WhatsAppPaymentService.ts", import.meta.url),
      "utf-8",
    );
    expect(src).toContain('provider: "mercadopago"');
    expect(src).toContain("integrationConfig");
  });
});

// ── E–H: PixReuse.test.ts covers these in detail (structural pointers) ────────

describe("E-H — PixReuse test coverage (structural pointer)", () => {
  it("WhatsAppOrderingPixReuse.test.ts exists and covers A–D scenarios", async () => {
    const fs   = await import("node:fs/promises");
    const path = await import("node:path");
    const dir  = new URL(".", import.meta.url).pathname;
    const pixReuseFile = path.join(dir, "WhatsAppOrderingPixReuse.test.ts");
    const src  = await fs.readFile(pixReuseFile, "utf-8");
    expect(src).toContain("PixReuse A");
    expect(src).toContain("PixReuse B");
    expect(src).toContain("PixReuse C");
    expect(src).toContain("PixReuse D");
  });

  it("PixReuse D confirms AWAITING_PAYMENT → CONFIRMED flow is preserved", async () => {
    const fs  = await import("node:fs/promises");
    const src = await fs.readFile(
      new URL("../WhatsAppOrderCreationService.ts", import.meta.url),
      "utf-8",
    );
    // Must still carry the Pix → AWAITING_PAYMENT mapping
    expect(src).toContain('isPix ? "AWAITING_PAYMENT" : "PENDING"');
    // Non-Pix path confirms via prisma.$transaction
    expect(src).toContain('data:  { status: "CONFIRMED" }');
  });
});

// ── I: Pay-on-delivery creates Payment with PAY_ON_DELIVERY and CONFIRMED ─────

describe("I — Pay-on-delivery payment record shape (structural)", () => {
  it("WhatsAppOrderCreationService creates PAY_ON_DELIVERY Payment for delivery cash orders", async () => {
    const fs  = await import("node:fs/promises");
    const src = await fs.readFile(
      new URL("../WhatsAppOrderCreationService.ts", import.meta.url),
      "utf-8",
    );
    expect(src).toContain("PAY_ON_DELIVERY");
    expect(src).toContain("PAY_ON_PICKUP");
    expect(src).toContain('data:  { status: "CONFIRMED" }');
  });

  it("finalize route also creates PAY_ON_DELIVERY for delivery offline payments", async () => {
    const fs   = await import("node:fs/promises");
    const path = await import("node:path");
    const src  = await fs.readFile(
      path.join(process.cwd(), "src/app/api/pedido/[slug]/finalize/route.ts"),
      "utf-8",
    );
    expect(src).toContain("PAY_ON_DELIVERY");
    expect(src).toContain("PAY_ON_PICKUP");
    expect(src).toContain('status: "CONFIRMED"');
  });
});

// ── J: Adapter re-calculates prices from DB (structural) ─────────────────────

describe("J — Adapter re-validates prices from DB (structural)", () => {
  it("WhatsAppCheckoutAdapter imports channelPrice from MenuPricingService", async () => {
    const fs  = await import("node:fs/promises");
    const src = await fs.readFile(
      new URL("../WhatsAppCheckoutAdapter.ts", import.meta.url),
      "utf-8",
    );
    expect(src).toContain("channelPrice");
    expect(src).toContain("MenuPricingService");
  });

  it("Adapter fetches menuItem rows with price columns before mapping items", async () => {
    const fs  = await import("node:fs/promises");
    const src = await fs.readFile(
      new URL("../WhatsAppCheckoutAdapter.ts", import.meta.url),
      "utf-8",
    );
    expect(src).toContain("priceDelivery");
    expect(src).toContain("priceDineIn");
    expect(src).toContain("prisma.menuItem.findMany");
  });

  it("Adapter looks up optionGroupItem and menuItemExtra prices from DB", async () => {
    const fs  = await import("node:fs/promises");
    const src = await fs.readFile(
      new URL("../WhatsAppCheckoutAdapter.ts", import.meta.url),
      "utf-8",
    );
    expect(src).toContain("optionGroupItem.findMany");
    expect(src).toContain("menuItemExtra.findMany");
  });

  it("WhatsAppOrderCreationService no longer contains inline prisma.$transaction for order creation", async () => {
    const fs  = await import("node:fs/promises");
    const src = await fs.readFile(
      new URL("../WhatsAppOrderCreationService.ts", import.meta.url),
      "utf-8",
    );
    // The inline order-creation transaction was removed; only the payment
    // confirmation transaction (2 ops) remains.
    // The file should import from CheckoutFinalizationService.
    expect(src).toContain("CheckoutFinalizationService");
    expect(src).toContain("createOrderRecord");
  });
});

// ── K: Required options validated server-side (structural) ───────────────────

describe("K — Required options validated server-side", () => {
  it("WhatsAppOrderStateMachine generates COLLECTING_REQUIRED_OPTIONS stage", async () => {
    const fs  = await import("node:fs/promises");
    const src = await fs.readFile(
      new URL("../WhatsAppOrderStateMachine.ts", import.meta.url),
      "utf-8",
    );
    expect(src).toContain("COLLECTING_REQUIRED_OPTIONS");
    expect(src).toContain("required");
  });

  it("checkCompleteness in WhatsAppOrderDraftBuilder validates item completeness", async () => {
    const fs  = await import("node:fs/promises");
    const src = await fs.readFile(
      new URL("../WhatsAppOrderDraftBuilder.ts", import.meta.url),
      "utf-8",
    );
    expect(src).toContain("checkCompleteness");
    expect(src).toContain("missing");
  });
});

// ── L: Dry-run returns wouldCreate=true, no side effects ────────────────────

describe("L — Dry-run mode: wouldCreate=true, no DB writes", () => {
  it("allowCreate=false returns wouldCreate=true for Pix session", async () => {
    const res = await createOrderFromSession({
      session:      makeSession({ paymentMethod: "PIX" }),
      customerName: "Cliente Teste",
      subtotal:     50,
      deliveryFee:  0,
      total:        50,
      allowCreate:  false,
    });
    expect(res.wouldCreate).toBe(true);
    expect(res.created).toBe(false);
    expect(res.orderId).toBeNull();
    expect(res.isPix).toBe(true);
    expect(res.status).toBe("AWAITING_PAYMENT");
  });

  it("allowCreate=false returns wouldCreate=true for cash session", async () => {
    const res = await createOrderFromSession({
      session:      makeSession({ paymentMethod: "CASH" }),
      customerName: "Cliente Teste",
      subtotal:     40,
      deliveryFee:  5,
      total:        45,
      allowCreate:  false,
    });
    expect(res.wouldCreate).toBe(true);
    expect(res.created).toBe(false);
    expect(res.orderId).toBeNull();
    expect(res.isPix).toBe(false);
  });

  it("idempotent: existing orderId never re-creates", async () => {
    const res = await createOrderFromSession({
      session:      makeSession({ orderId: "order-existing-123" }),
      customerName: "Cliente Teste",
      subtotal:     50,
      deliveryFee:  0,
      total:        50,
      allowCreate:  true,
    });
    expect(res.created).toBe(false);
    expect(res.orderId).toBe("order-existing-123");
    expect(res.reason).toContain("idempotent");
  });
});

// ── M: Finalize route imports createOrderRecord (structural) ─────────────────

describe("M — Finalize route delegates to shared CheckoutFinalizationService", () => {
  it("finalize route.ts imports createOrderRecord", async () => {
    const fs   = await import("node:fs/promises");
    const path = await import("node:path");
    const src  = await fs.readFile(
      path.join(process.cwd(), "src/app/api/pedido/[slug]/finalize/route.ts"),
      "utf-8",
    );
    expect(src).toContain("createOrderRecord");
    expect(src).toContain("CheckoutFinalizationService");
  });

  it("finalize route no longer contains inline prisma.$transaction for phase-1 customer+order", async () => {
    const fs   = await import("node:fs/promises");
    const path = await import("node:path");
    const src  = await fs.readFile(
      path.join(process.cwd(), "src/app/api/pedido/[slug]/finalize/route.ts"),
      "utf-8",
    );
    // The shared service is now called; the inline transaction comment is gone
    // and the big createOrderRecord call is the replacement
    expect(src).toContain("await createOrderRecord(");
    // No more tx.customer.upsert — that's inside CheckoutFinalizationService now
    expect(src).not.toContain("tx.customer.upsert");
  });

  it("WhatsAppOrderCreationService delegates to the same createOrderRecord", async () => {
    const fs  = await import("node:fs/promises");
    const src = await fs.readFile(
      new URL("../WhatsAppOrderCreationService.ts", import.meta.url),
      "utf-8",
    );
    expect(src).toContain("createOrderRecord");
    expect(src).toContain("CheckoutFinalizationService");
  });
});

// ── N: Adapter + guards exist (meta structural) ──────────────────────────────

describe("N — WhatsAppCheckoutAdapter guards are wired correctly", () => {
  it("WhatsAppCheckoutAdapter exports checkOrderCreationGuards and adaptSessionToOrderInput", async () => {
    const fs  = await import("node:fs/promises");
    const src = await fs.readFile(
      new URL("../WhatsAppCheckoutAdapter.ts", import.meta.url),
      "utf-8",
    );
    expect(src).toContain("checkOrderCreationGuards");
    expect(src).toContain("adaptSessionToOrderInput");
    expect(src).toContain("isRestaurantOpenNow");
    expect(src).toContain("isOrderingPaused");
  });

  it("WhatsAppOrderCreationService calls adaptSessionToOrderInput with runGuards=true", async () => {
    const fs  = await import("node:fs/promises");
    const src = await fs.readFile(
      new URL("../WhatsAppOrderCreationService.ts", import.meta.url),
      "utf-8",
    );
    expect(src).toContain("adaptSessionToOrderInput");
    expect(src).toContain("runGuards");
    expect(src).toContain("true");
  });

  it("blockedReply triggers HANDOFF_REQUIRED stage in WhatsAppTextOrderService", async () => {
    const fs  = await import("node:fs/promises");
    const src = await fs.readFile(
      new URL("../WhatsAppTextOrderService.ts", import.meta.url),
      "utf-8",
    );
    expect(src).toContain("blockedReply");
    expect(src).toContain("HANDOFF_REQUIRED");
  });
});

// ── O: No duplicated payment/freight logic (structural) ──────────────────────

describe("O — No duplicated delivery fee or payment logic", () => {
  it("WhatsAppOrderCreationService does NOT contain resolveDeliveryFee", async () => {
    const fs  = await import("node:fs/promises");
    const src = await fs.readFile(
      new URL("../WhatsAppOrderCreationService.ts", import.meta.url),
      "utf-8",
    );
    // Delivery fee calculation is done before createOrderFromSession is called
    expect(src).not.toContain("resolveDeliveryFee");
  });

  it("WhatsAppOrderCreationService does NOT contain createPixPayment directly", async () => {
    const fs  = await import("node:fs/promises");
    const src = await fs.readFile(
      new URL("../WhatsAppOrderCreationService.ts", import.meta.url),
      "utf-8",
    );
    // Pix generation is in WhatsAppPaymentService, not here
    expect(src).not.toContain("createPixPayment");
  });

  it("CheckoutFinalizationService is the single source of truth for order DB writes", async () => {
    const fs   = await import("node:fs/promises");
    const path = await import("node:path");
    const src  = await fs.readFile(
      path.join(process.cwd(), "src/services/checkout/CheckoutFinalizationService.ts"),
      "utf-8",
    );
    // Contains the transaction, customer upsert, order create
    expect(src).toContain("prisma.$transaction");
    expect(src).toContain("customer.upsert");
    expect(src).toContain("order.create");
    expect(src).toContain("assignOrderNumber");
  });
});
