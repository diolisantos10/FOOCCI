/**
 * getRepeatableItemsForCustomer — "Pedir novamente" item list.
 *
 * Pure-ish service test: prisma is mocked, channelPrice/phone are real. Proves:
 *  - anonymous customer → [] (never invents history);
 *  - identified customer → repeatable items, last order first;
 *  - inactive/removed items are excluded;
 *  - price is the CURRENT DELIVERY price (not the historical order price);
 *  - variants matched by name; required-option items dropped (safe one-tap);
 *  - capped at 12.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const customerFindFirst = vi.fn();
const orderFindMany = vi.fn();
const menuItemFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    customer:  { findFirst: (...a: unknown[]) => customerFindFirst(...a) },
    order:     { findMany: (...a: unknown[]) => orderFindMany(...a) },
    menuItem:  { findMany: (...a: unknown[]) => menuItemFindMany(...a) },
  },
}));

import { getRepeatableItemsForCustomer } from "../RepeatOrderService";

beforeEach(() => {
  vi.clearAllMocks();
  customerFindFirst.mockResolvedValue({ id: "cus_1" });
});

describe("getRepeatableItemsForCustomer", () => {
  it("returns [] for an anonymous customer (no id, no phone)", async () => {
    const out = await getRepeatableItemsForCustomer({ restaurantId: "r1" });
    expect(out).toEqual([]);
    expect(orderFindMany).not.toHaveBeenCalled();
  });

  it("returns [] when the customer has no repeatable orders", async () => {
    orderFindMany.mockResolvedValue([]);
    const out = await getRepeatableItemsForCustomer({ restaurantId: "r1", customerId: "cus_1" });
    expect(out).toEqual([]);
  });

  it("lists last-order items first and uses the CURRENT delivery price", async () => {
    orderFindMany.mockResolvedValue([
      // most recent order (idx 0)
      { createdAt: new Date("2026-02-01"), items: [{ menuItemId: "m1", name: "Combo", quantity: 1, variantName: null }] },
      // older order (idx 1) — m2 more frequent overall
      { createdAt: new Date("2026-01-01"), items: [
        { menuItemId: "m2", name: "Temaki", quantity: 2, variantName: null },
        { menuItemId: "m2", name: "Temaki", quantity: 1, variantName: null },
      ] },
    ]);
    menuItemFindMany.mockResolvedValue([
      { id: "m1", name: "Combo", imageUrl: null, price: 100, priceDelivery: 90, priceDineIn: null, priceIfood: null, hasVariants: false, variants: [], optionGroups: [] },
      { id: "m2", name: "Temaki", imageUrl: "img.jpg", price: 25, priceDelivery: 22, priceDineIn: null, priceIfood: null, hasVariants: false, variants: [], optionGroups: [] },
    ]);

    const out = await getRepeatableItemsForCustomer({ restaurantId: "r1", customerId: "cus_1" });

    expect(out.map((i) => i.menuItemId)).toEqual(["m1", "m2"]); // last-order item first
    expect(out[0]).toMatchObject({ menuItemId: "m1", price: 90, lastQty: 1 }); // current DELIVERY price
    expect(out[1]).toMatchObject({ menuItemId: "m2", price: 22, frequency: 3, lastQty: 0 });
  });

  it("excludes items that are inactive/removed today", async () => {
    orderFindMany.mockResolvedValue([
      { createdAt: new Date(), items: [
        { menuItemId: "active", name: "A", quantity: 1, variantName: null },
        { menuItemId: "gone",   name: "G", quantity: 1, variantName: null },
      ] },
    ]);
    // live query only returns the active one (filter applied in the query)
    menuItemFindMany.mockResolvedValue([
      { id: "active", name: "A", imageUrl: null, price: 10, priceDelivery: null, priceDineIn: null, priceIfood: null, hasVariants: false, variants: [], optionGroups: [] },
    ]);
    const out = await getRepeatableItemsForCustomer({ restaurantId: "r1", customerId: "cus_1" });
    expect(out.map((i) => i.menuItemId)).toEqual(["active"]);
    expect(out[0].price).toBe(10); // base fallback when no channel price
  });

  it("matches variant by name and drops required-option items", async () => {
    orderFindMany.mockResolvedValue([
      { createdAt: new Date(), items: [
        { menuItemId: "v1", name: "Pizza", quantity: 1, variantName: "Grande" },
        { menuItemId: "req", name: "Monte", quantity: 1, variantName: null },
      ] },
    ]);
    menuItemFindMany.mockResolvedValue([
      { id: "v1", name: "Pizza", imageUrl: null, price: 50, priceDelivery: 55, priceDineIn: null, priceIfood: null, hasVariants: true,
        variants: [{ id: "vg", name: "Grande", price: 60, priceDelivery: 58, priceDineIn: null, priceIfood: null }], optionGroups: [] },
      { id: "req", name: "Monte", imageUrl: null, price: 40, priceDelivery: null, priceDineIn: null, priceIfood: null, hasVariants: false,
        variants: [], optionGroups: [{ id: "g1" }] }, // required option group → dropped
    ]);
    const out = await getRepeatableItemsForCustomer({ restaurantId: "r1", customerId: "cus_1" });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ menuItemId: "v1", variantName: "Grande", price: 58, name: "Pizza — Grande" });
  });

  it("caps the list at 12 items", async () => {
    const items = Array.from({ length: 20 }, (_, i) => ({ menuItemId: `m${i}`, name: `I${i}`, quantity: 1, variantName: null }));
    orderFindMany.mockResolvedValue([{ createdAt: new Date(), items }]);
    menuItemFindMany.mockResolvedValue(
      items.map((it) => ({ id: it.menuItemId, name: it.name, imageUrl: null, price: 10, priceDelivery: 9, priceDineIn: null, priceIfood: null, hasVariants: false, variants: [], optionGroups: [] })),
    );
    const out = await getRepeatableItemsForCustomer({ restaurantId: "r1", customerId: "cus_1" });
    expect(out.length).toBe(12);
  });
});
