/**
 * MenuPricingService — pure resolver tests (P0-B).
 *
 * Covers the channel-price fallback matrix using resolveChannelPrice().
 * No DB, no network — hand-built ChannelPriceable fixtures.
 *
 *   A — no channel prices → base price for every channel
 *   B — DELIVERY channel uses delivery price
 *   C — DINE_IN channel uses dine-in price
 *   D — IFOOD channel uses ifood price
 *   K — variant-shaped object with channel fallback
 *   M — Decimal-like (string / toString) inputs work
 *   + priceSource correctness and DEFAULT channel
 */

import { describe, it, expect } from "vitest";
import {
  resolveChannelPrice,
  channelPrice,
  resolveVariantPrice,
  resolveVariantPriceDetailed,
  type ChannelPriceable,
  type VariantPriceable,
} from "./MenuPricingService";

// ─── A. No channel prices → base everywhere ───────────────────────────────────

describe("A — no channel prices fall back to base", () => {
  const item: ChannelPriceable = { price: 50 };

  it("uses base for DELIVERY / DINE_IN / IFOOD / DEFAULT", () => {
    for (const ch of ["DELIVERY", "DINE_IN", "IFOOD", "DEFAULT"] as const) {
      const r = resolveChannelPrice(item, ch);
      expect(r.finalUnitPrice).toBe(50);
      expect(r.priceSource).toBe("BASE_FALLBACK");
      expect(r.channelPriceUsed).toBeNull();
      expect(r.basePriceUsed).toBe(50);
    }
  });
});

// ─── B/C/D. Channel-specific prices ───────────────────────────────────────────

describe("B/C/D — channel-specific prices", () => {
  const item: ChannelPriceable = {
    price:         50,
    priceDelivery: 55,
    priceDineIn:   45,
    priceIfood:    70,
  };

  it("B — DELIVERY uses delivery price", () => {
    const r = resolveChannelPrice(item, "DELIVERY");
    expect(r.finalUnitPrice).toBe(55);
    expect(r.priceSource).toBe("CHANNEL_DELIVERY");
    expect(r.channelPriceUsed).toBe(55);
  });

  it("C — DINE_IN uses dine-in price", () => {
    const r = resolveChannelPrice(item, "DINE_IN");
    expect(r.finalUnitPrice).toBe(45);
    expect(r.priceSource).toBe("CHANNEL_DINE_IN");
  });

  it("D — IFOOD uses ifood price (higher, accounts for commission)", () => {
    const r = resolveChannelPrice(item, "IFOOD");
    expect(r.finalUnitPrice).toBe(70);
    expect(r.priceSource).toBe("CHANNEL_IFOOD");
  });

  it("DEFAULT always uses base even when channel prices exist", () => {
    const r = resolveChannelPrice(item, "DEFAULT");
    expect(r.finalUnitPrice).toBe(50);
    expect(r.priceSource).toBe("BASE_FALLBACK");
  });
});

// ─── Partial channel prices fall back per-channel ─────────────────────────────

describe("partial channel prices", () => {
  it("only delivery set → dine-in and ifood fall back to base", () => {
    const item: ChannelPriceable = { price: 30, priceDelivery: 35 };
    expect(channelPrice(item, "DELIVERY")).toBe(35);
    expect(channelPrice(item, "DINE_IN")).toBe(30);
    expect(channelPrice(item, "IFOOD")).toBe(30);
  });

  it("null channel value falls back to base (not 0)", () => {
    const item: ChannelPriceable = { price: 30, priceDelivery: null, priceDineIn: null };
    expect(channelPrice(item, "DELIVERY")).toBe(30);
    expect(channelPrice(item, "DINE_IN")).toBe(30);
  });
});

// ─── K. Variant-shaped object ─────────────────────────────────────────────────

describe("K — variant channel fallback", () => {
  it("variant with its own delivery price uses it; else base variant price", () => {
    const variantWithChannel: ChannelPriceable = { price: 20, priceDelivery: 24 };
    const variantPlain:       ChannelPriceable = { price: 20 };
    expect(channelPrice(variantWithChannel, "DELIVERY")).toBe(24);
    expect(channelPrice(variantPlain, "DELIVERY")).toBe(20);
  });
});

// ─── Variant price inheritance (optional variant price) ───────────────────────

describe("resolveVariantPrice — optional variant price inheritance", () => {
  // Product: Refrigerante — Delivery R$8, Salão/QR R$7.
  const product: ChannelPriceable = { price: 8, priceDelivery: 8, priceDineIn: 7 };

  it("E — null variant price inherits the product BASE price (DEFAULT channel)", () => {
    const variant: VariantPriceable = { price: null };
    expect(resolveVariantPrice(product, variant, "DEFAULT")).toBe(8);
    expect(resolveVariantPriceDetailed(product, variant, "DEFAULT").source).toBe("INHERITED_PRODUCT");
  });

  it("F — null variant price inherits the product CHANNEL price", () => {
    const variant: VariantPriceable = { price: null }; // e.g. Coca-Cola / Sprite (blank)
    expect(resolveVariantPrice(product, variant, "DELIVERY")).toBe(8); // product delivery
    expect(resolveVariantPrice(product, variant, "DINE_IN")).toBe(7);  // product salão/QR
  });

  it("undefined (omitted) variant price also inherits", () => {
    const variant: VariantPriceable = {};
    expect(resolveVariantPrice(product, variant, "DELIVERY")).toBe(8);
    expect(resolveVariantPrice(product, variant, "DINE_IN")).toBe(7);
  });

  it("G — explicit variant price OVERRIDES the product/channel price everywhere", () => {
    const variant: VariantPriceable = { price: 14 }; // e.g. Coca 2L
    expect(resolveVariantPrice(product, variant, "DELIVERY")).toBe(14);
    expect(resolveVariantPrice(product, variant, "DINE_IN")).toBe(14);
    expect(resolveVariantPrice(product, variant, "DEFAULT")).toBe(14);
    expect(resolveVariantPriceDetailed(product, variant, "DELIVERY").source).toBe("VARIANT_BASE");
  });

  it("variant channel override beats variant base and product", () => {
    const variant: VariantPriceable = { price: 14, priceDelivery: 13 };
    expect(resolveVariantPrice(product, variant, "DELIVERY")).toBe(13); // variant channel
    expect(resolveVariantPrice(product, variant, "DINE_IN")).toBe(14);  // variant base
    expect(resolveVariantPriceDetailed(product, variant, "DELIVERY").source).toBe("VARIANT_CHANNEL");
  });

  it("variant with a channel override but null base inherits product on other channels", () => {
    const variant: VariantPriceable = { price: null, priceDelivery: 9 };
    expect(resolveVariantPrice(product, variant, "DELIVERY")).toBe(9); // variant delivery override
    expect(resolveVariantPrice(product, variant, "DINE_IN")).toBe(7);  // inherit product salão
  });

  it("explicit zero is a real override (not treated as blank)", () => {
    const variant: VariantPriceable = { price: 0 };
    expect(resolveVariantPrice(product, variant, "DELIVERY")).toBe(0);
  });
});

// ─── M. Decimal-like inputs ───────────────────────────────────────────────────

describe("M — Decimal-like (string / toString) inputs", () => {
  it("accepts string prices (as Prisma Decimal serializes)", () => {
    const item: ChannelPriceable = { price: "50.00", priceDelivery: "55.50" };
    const r = resolveChannelPrice(item, "DELIVERY");
    expect(r.finalUnitPrice).toBe(55.5);
    expect(r.basePriceUsed).toBe(50);
  });

  it("accepts a Decimal-like object with toString()", () => {
    const decimalLike = { toString: () => "42.25" };
    const item: ChannelPriceable = { price: decimalLike };
    expect(channelPrice(item, "DEFAULT")).toBe(42.25);
  });

  it("malformed value falls back to 0 base safely", () => {
    const item: ChannelPriceable = { price: "not-a-number" };
    expect(channelPrice(item, "DELIVERY")).toBe(0);
  });
});

// ─── Purity / determinism ─────────────────────────────────────────────────────

describe("pure & deterministic", () => {
  it("same input → same output, no mutation", () => {
    const item: ChannelPriceable = { price: 10, priceDelivery: 12 };
    const a = resolveChannelPrice(item, "DELIVERY");
    const b = resolveChannelPrice(item, "DELIVERY");
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(item.priceDelivery).toBe(12); // unchanged
  });
});
