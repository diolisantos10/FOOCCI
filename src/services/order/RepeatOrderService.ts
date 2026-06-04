/**
 * RepeatOrderService — "Pedir novamente" (repeat last order) for /pedido.
 *
 * Finds an identified returning customer's most recent repeatable order and
 * rebuilds a SAFE, finalizable cart payload validated against the live menu.
 *
 * Guarantees (W3):
 *   • Only real order history — never invents an order.
 *   • Only confirmed/paid/in-progress/delivered orders are repeatable.
 *   • Every returned item is currently available (isActive/isAvailable/showInDelivery).
 *   • CURRENT prices are used (not the historical order price).
 *   • Items that cannot be safely reconstructed (deleted, unavailable, require
 *     a variant we can't match, or have required option groups) are dropped and
 *     counted in `unavailableCount` — keeping the resulting cart always valid.
 *
 * No order is ever created here — this is read-only cart hydration data.
 */

import { prisma } from "@/lib/prisma";
import { channelPrice } from "@/services/menu/MenuPricingService";

// Statuses that represent a real, confirmed order worth repeating.
// Excludes PENDING (not yet confirmed), AWAITING_PAYMENT (pending Pix),
// and CANCELLED (Part 2 eligibility rules).
const REPEATABLE_STATUSES = [
  "CONFIRMED",
  "PREPARING",
  "READY",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
] as const;

export interface RepeatOrderItem {
  menuItemId:   string;
  name:         string;   // current display name (includes "— Variant" when applicable)
  price:        number;   // CURRENT unit price
  qty:          number;
  variantId?:   string;
  variantName?: string;
}

export interface RepeatOrderPayload {
  orderId:          string;
  orderNumber:      number | null;
  createdAt:        string;            // ISO timestamp of the original order
  summary:          string;            // compact: "Combo Ayane + Coca-Cola" or "3 itens do último pedido"
  itemCount:        number;            // total quantity of available items
  items:            RepeatOrderItem[]; // validated, finalizable items only
  unavailableCount: number;           // items dropped (deleted / unavailable / unreconstructable)
  priceChanged:     boolean;          // true when any current price differs from the historical price
  allUnavailable:   boolean;          // true when an order exists but nothing is available today
}

/** Builds a compact human summary from the available repeat items. */
function buildSummary(items: RepeatOrderItem[]): string {
  if (items.length === 0) return "";
  if (items.length <= 2) {
    return items.map((i) => i.name).join(" + ");
  }
  const totalQty = items.reduce((sum, i) => sum + i.qty, 0);
  return `${totalQty} itens do último pedido`;
}

/**
 * Returns the most recent repeatable order for a customer, hydrated and
 * validated against the current menu. Returns null when the customer has no
 * repeatable order at all (no hallucination).
 *
 * When an order exists but none of its items are available today, the payload
 * is still returned with `allUnavailable: true` and `items: []` so callers can
 * offer a graceful "not available — let me suggest something" response.
 */
export async function getRepeatableOrder(
  restaurantId: string,
  customerId:   string,
): Promise<RepeatOrderPayload | null> {
  const order = await prisma.order.findFirst({
    where: {
      restaurantId,
      customerId,
      status: { in: [...REPEATABLE_STATUSES] },
      items:  { some: {} }, // exclude empty orders
    },
    orderBy: { createdAt: "desc" },
    select: {
      id:          true,
      orderNumber: true,
      createdAt:   true,
      items: {
        select: {
          menuItemId:  true,
          name:        true,
          price:       true,
          quantity:    true,
          variantName: true,
        },
      },
    },
  });

  if (!order) return null;

  // Resolve the live menu state for every referenced product in one query.
  const ids = [
    ...new Set(order.items.map((i) => i.menuItemId).filter((id): id is string => !!id)),
  ];
  const liveItems = ids.length > 0
    ? await prisma.menuItem.findMany({
        where: {
          id:             { in: ids },
          isActive:       true,
          isAvailable:    true,
          showInDelivery: true,
          category:       { restaurantId },
        },
        select: {
          id:            true,
          name:          true,
          price:         true,
          priceDelivery: true,
          priceDineIn:   true,
          priceIfood:    true,
          hasVariants:   true,
          variants:    {
            where:  { isAvailable: true },
            select: { id: true, name: true, price: true, priceDelivery: true, priceDineIn: true, priceIfood: true },
          },
          // Only required option groups matter for finalizability.
          optionGroups: { where: { required: true }, select: { id: true } },
        },
      })
    : [];
  const liveMap = new Map(liveItems.map((li) => [li.id, li]));

  // Merge by cart-line key (menuItemId + variantId) so duplicate order lines
  // collapse into a single quantity-summed cart line.
  const lineMap = new Map<string, RepeatOrderItem>();
  let unavailableCount = 0;
  let priceChanged     = false;

  for (const oi of order.items) {
    if (!oi.menuItemId) { unavailableCount += 1; continue; }
    const live = liveMap.get(oi.menuItemId);
    if (!live) { unavailableCount += 1; continue; }

    // Required option groups can't be safely reconstructed → skip to keep cart valid.
    if (live.optionGroups.length > 0) { unavailableCount += 1; continue; }

    let useName     = live.name;
    // Repeat order is a /pedido (delivery) flow — re-price at the current
    // DELIVERY channel price (falls back to base when no channel price set).
    let usePrice    = channelPrice(live, "DELIVERY");
    let variantId:   string | undefined;
    let variantName: string | undefined;

    if (live.hasVariants) {
      // The item requires a variant — match the historical variant by name.
      const v = oi.variantName
        ? live.variants.find((vv) => vv.name.toLowerCase() === oi.variantName!.toLowerCase())
        : undefined;
      if (!v) { unavailableCount += 1; continue; } // can't safely pick a variant → skip
      variantId   = v.id;
      variantName = v.name;
      useName     = `${live.name} — ${v.name}`;
      usePrice    = channelPrice(v, "DELIVERY");
    }

    if (Number(oi.price) !== usePrice) priceChanged = true;

    const key = `${oi.menuItemId}__${variantId ?? ""}`;
    const existing = lineMap.get(key);
    if (existing) {
      existing.qty += oi.quantity;
    } else {
      lineMap.set(key, { menuItemId: oi.menuItemId, name: useName, price: usePrice, qty: oi.quantity, variantId, variantName });
    }
  }

  const items     = [...lineMap.values()];
  const itemCount = items.reduce((sum, i) => sum + i.qty, 0);

  return {
    orderId:          order.id,
    orderNumber:      order.orderNumber ?? null,
    createdAt:        order.createdAt.toISOString(),
    summary:          buildSummary(items),
    itemCount,
    items,
    unavailableCount,
    priceChanged,
    allUnavailable:   items.length === 0,
  };
}

// ─── Waiter awareness (W3 Part 4) ───────────────────────────────────────────
// Repeat-order intent is handled in the /pedido route (not WaiterBrainV2) so the
// deterministic Waiter brain stays pure (no DB) and its test suite is unaffected.

/** Matches "quero o mesmo", "repetir pedido", "o de sempre", "meu último pedido", "pede igual da última vez". */
export const REPEAT_ORDER_INTENT_RE =
  /\b(quero|pede|pedir|faz|fazer|manda|mandar)\s+(o\s+|a\s+)?(mesm[ao]|igual)\b|repetir\s+(o\s+)?pedido|o\s+de\s+sempre|meu\s+[uú]ltimo\s+pedido|[uú]ltimo\s+pedido|igual\s+(a\s+)?(d[ao]\s+)?[uú]ltima\s+vez|pedir\s+novamente|mesma\s+coisa/i;

export interface RepeatOrderReply {
  reply:   string;
  options: Array<{ label: string; value: string }>;
}

/**
 * Builds the Waiter's spoken response when a customer asks to repeat an order.
 * Never hallucinates: if there's no history (or the customer is anonymous),
 * it answers gracefully without inventing a previous order.
 */
export async function buildRepeatOrderReply(
  restaurantId: string,
  customerId:   string | null,
): Promise<RepeatOrderReply> {
  if (!customerId) {
    return { reply: "Pra repetir seu último pedido, preciso te identificar primeiro 😊", options: [] };
  }

  const payload = await getRepeatableOrder(restaurantId, customerId);

  if (!payload) {
    return { reply: "Ainda não encontrei um pedido anterior seu por aqui. Quer que eu te sugira algo? 😊", options: [] };
  }
  if (payload.items.length === 0) {
    return { reply: "Seu último pedido não está disponível hoje, mas posso te sugerir algo parecido 😊", options: [] };
  }
  return {
    reply:   `Claro! 😊 Seu último pedido foi: ${payload.summary}. É só tocar em “Pedir novamente” que eu coloco no carrinho.`,
    options: [{ label: "Pedir novamente", value: "repeat_last_order" }],
  };
}
