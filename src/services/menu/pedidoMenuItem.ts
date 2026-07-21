/**
 * pedidoMenuItem — the single source of truth for how a menu item is shaped and
 * mapped for the /pedido customer flow.
 *
 * WHY THIS EXISTS
 * The customer store renders each product as a full card (variants, extras,
 * option groups) that opens a detail sheet. Two places need that identical
 * shape:
 *   1. the /pedido page (real categories + the virtual "Comprar novamente" pool);
 *   2. the repeat-order API (/api/pedido/[slug]/repeat-order), which augments the
 *      "Comprar novamente" section on the client.
 *
 * The repeat-order services (getRepeatableOrder / getRepeatableItemsForCustomer)
 * validate the ITEM's own flags (isActive/isAvailable/showInDelivery) but NOT the
 * visibility of the item's home CATEGORY. The page's `categories` only include
 * items whose category is itself visible — so a repeat item whose home category
 * is hidden used to reach the client only through a cross-category placement.
 * Once placements stopped bleeding into categories, those items had no full shape
 * to render from and the whole "Comprar novamente" section vanished. Resolving
 * the repeat pool through this shared select — restaurant-scoped, item-visible,
 * category-visibility-agnostic — fixes that regardless of how the customer is
 * identified (SSR or client fetch).
 */

import { Prisma } from "@prisma/client";
import { channelPrice, resolveVariantPrice } from "./MenuPricingService";
import type { ResolvedPromotion } from "@/services/promotions/productPromotionResolver";

/**
 * Prisma select for a /pedido menu item — the FULL shape the client renders.
 * Kept byte-for-byte identical to the inline select used by the page's category
 * query so the two row types are interchangeable.
 */
export const PEDIDO_ITEM_SELECT = {
  id: true, name: true, price: true,
  priceDelivery: true, priceDineIn: true, priceIfood: true,
  description: true, imageUrl: true,
  hasVariants: true, ingredients: true, servingSize: true, portionInfo: true,
  variants: {
    where: { isAvailable: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true, price: true, priceDelivery: true, priceDineIn: true, portion: true },
  },
  extras: {
    where: { isAvailable: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, price: true, portion: true, quantity: true },
  },
  optionGroups: {
    orderBy: { sortOrder: "asc" },
    include: {
      options: {
        where: { isAvailable: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: { id: true, name: true, price: true, portion: true },
      },
    },
  },
} satisfies Prisma.MenuItemSelect;

/** A menu-item row selected with {@link PEDIDO_ITEM_SELECT}. */
export type PedidoItemRow = Prisma.MenuItemGetPayload<{ select: typeof PEDIDO_ITEM_SELECT }>;

/**
 * Maps a full menu-item row to the client's MenuItem shape (DELIVERY channel).
 * `promo` is the resolved promotion for this item (or null) — the caller owns
 * the promotion map so this stays a pure, DB-free transform.
 */
export function mapPedidoItem(i: PedidoItemRow, promo: ResolvedPromotion | null) {
  return {
    id: i.id,
    name: i.name,
    // Delivery channel: use priceDelivery when set, else base price.
    price: channelPrice(i, "DELIVERY"),
    description: i.description ?? null,
    imageUrl: i.imageUrl ?? null,
    hasVariants: i.hasVariants,
    ingredients: i.ingredients ?? null,
    servingSize: i.servingSize ?? null,
    portionInfo: i.portionInfo ?? null,
    promotion: promo,
    variants: i.variants.map((v) => ({ id: v.id, name: v.name, price: resolveVariantPrice(i, v, "DELIVERY"), portion: v.portion ?? null })),
    extras: i.extras.map((e) => ({ id: e.id, name: e.name, price: Number(e.price), portion: e.portion ?? null, quantity: e.quantity })),
    optionGroups: i.optionGroups.map((g) => ({
      id: g.id, name: g.name, required: g.required, minSelect: g.minSelect, maxSelect: g.maxSelect,
      options: g.options.map((o) => ({ id: o.id, name: o.name, price: Number(o.price), portion: o.portion ?? null })),
    })),
  };
}

/** The client-facing menu item — exactly what {@link mapPedidoItem} produces. */
export type PedidoMenuItem = ReturnType<typeof mapPedidoItem>;
