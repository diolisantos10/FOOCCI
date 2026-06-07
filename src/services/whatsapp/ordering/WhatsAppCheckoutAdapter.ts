/**
 * WhatsAppCheckoutAdapter — converts a WhatsApp ordering session into the
 * standard CheckoutFinalizationService input.
 *
 * Responsibilities:
 *   - Re-validate item availability against the live menu (anti-staleness).
 *   - Re-calculate server-side prices from DB using the same channelPrice()
 *     logic the /pedido finalize route uses — WhatsApp session prices are
 *     never trusted directly.
 *   - Check business hours and ordering-pause state before order creation.
 *   - Map WaOrderItem → CreateOrderItem (options/extras shape alignment).
 *   - Build the CreateOrderInput for CheckoutFinalizationService.createOrderRecord().
 *
 * Does NOT perform payment; that remains in WhatsAppPaymentService / finalize.
 */

import type { WaPersistedSession, WaOrderItem } from "./types";
import type { CreateOrderInput, CreateOrderItem, CreateOrderAddress } from "@/services/checkout/CheckoutFinalizationService";

export interface AdaptResult {
  ok:       boolean;
  reason?:  string;
  replyText?: string;  // when ok=false, the customer-facing message
  input?:   CreateOrderInput;
  items?:   CreateOrderItem[];
}

/** Converts the session into validated checkout items with DB-fresh prices. */
export async function validateAndPriceItems(
  session: WaPersistedSession,
): Promise<{ ok: boolean; reason?: string; items?: CreateOrderItem[] }> {
  const { prisma }       = await import("@/lib/prisma");
  const { channelPrice } = await import("@/services/menu/MenuPricingService");

  const menuItemIds = [...new Set(session.selectedItems.map(i => i.menuItemId))];
  const pricingChannel = session.deliveryType === "DELIVERY" ? "DELIVERY" : "DINE_IN";

  // Load base items with channel pricing columns
  const dbItems = await prisma.menuItem.findMany({
    where: {
      id:          { in: menuItemIds },
      isActive:    true,
      isAvailable: true,
      category:    { restaurantId: session.restaurantId, isActive: true },
    },
    select: {
      id:            true,
      price:         true,
      priceDelivery: true,
      priceDineIn:   true,
      priceIfood:    true,
      categoryId:    true,
      category:      { select: { name: true } },
    },
  });
  const dbItemMap = new Map(dbItems.map(i => [i.id, i]));

  // Collect all option and extra IDs to look up prices in bulk
  const allOptionIds = [...new Set(
    session.selectedItems.flatMap(item => item.options.map(o => o.optionId)),
  )];
  const allExtraIds = [...new Set(
    session.selectedItems.flatMap(item => item.extras.map(e => e.extraId)),
  )];

  const [dbOptions, dbExtras] = await Promise.all([
    allOptionIds.length > 0
      ? prisma.optionGroupItem.findMany({ where: { id: { in: allOptionIds } }, select: { id: true, price: true } })
      : Promise.resolve([]),
    allExtraIds.length > 0
      ? prisma.menuItemExtra.findMany({ where: { id: { in: allExtraIds } }, select: { id: true, price: true } })
      : Promise.resolve([]),
  ]);
  const dbOptionPriceMap = new Map(dbOptions.map(o => [o.id, Number(o.price)]));
  const dbExtraPriceMap  = new Map(dbExtras.map(e => [e.id, Number(e.price)]));

  const items: CreateOrderItem[] = [];
  for (const waItem of session.selectedItems) {
    const dbEntry = dbItemMap.get(waItem.menuItemId);
    if (!dbEntry) {
      return { ok: false, reason: `item indisponível: ${waItem.menuItemName}` };
    }

    // Recalculate price using DB values (same as finalize's verifiedCart logic)
    const basePrice = channelPrice(dbEntry, pricingChannel);
    const optionsExtra = waItem.options.reduce((sum, o) => {
      return sum + (dbOptionPriceMap.get(o.optionId) ?? 0);  // each option qty=1
    }, 0);
    const extrasExtra = waItem.extras.reduce((sum, e) => {
      return sum + (dbExtraPriceMap.get(e.extraId) ?? 0) * e.quantity;
    }, 0);
    const computedPrice = Math.round((basePrice + optionsExtra + extrasExtra) * 100) / 100;

    items.push({
      menuItemId:    waItem.menuItemId,
      name:          waItem.menuItemName,
      price:         computedPrice,
      qty:           waItem.quantity,
      notes:         waItem.notes ?? null,
      variantName:   waItem.variantName ?? null,
      categoryId:    dbEntry.categoryId ?? null,
      categoryName:  dbEntry.category?.name ?? null,
      isUpsell:      false,
      selectedOptions: waItem.options.map(o => ({
        groupId:         o.groupId,
        groupName:       o.groupName,
        optionId:        o.optionId,
        optionName:      o.optionName,
        qty:             1,
        priceAdjustment: dbOptionPriceMap.get(o.optionId) ?? 0,
      })),
      selectedExtras: waItem.extras.map(e => ({
        extraId:   e.extraId,
        name:      e.extraName,
        unitPrice: dbExtraPriceMap.get(e.extraId) ?? 0,
        qty:       e.quantity,
      })),
    });
  }

  return { ok: true, items };
}

/** Runs business-hours and ordering-pause guards. Returns { ok, replyText } */
export async function checkOrderCreationGuards(
  restaurantId: string,
): Promise<{ ok: boolean; replyText?: string }> {
  const { isRestaurantOpenNow } = await import("@/lib/business-hours");
  const isOpen = await isRestaurantOpenNow(restaurantId);
  if (!isOpen) {
    return {
      ok: false,
      replyText: "O restaurante está fechado no momento. Por favor, tente novamente durante o horário de funcionamento.",
    };
  }

  const { prisma } = await import("@/lib/prisma");
  const rest = await prisma.restaurant.findUnique({
    where:  { id: restaurantId },
    select: { isOrderingPaused: true, orderingPausedUntil: true, orderingPausedReason: true },
  });
  if (rest?.isOrderingPaused) {
    const now = new Date();
    const effectivelyPaused = rest.orderingPausedUntil === null || rest.orderingPausedUntil > now;
    if (effectivelyPaused) {
      const reasonSuffix = rest.orderingPausedReason ? ` ${rest.orderingPausedReason}.` : "";
      return {
        ok: false,
        replyText: `Os pedidos estão temporariamente pausados.${reasonSuffix} Aguarde ou fale com um atendente.`,
      };
    }
  }
  return { ok: true };
}

/**
 * Converts a WhatsApp ordering session into a CreateOrderInput.
 * Runs item validation + price refresh + order-creation guards.
 */
export async function adaptSessionToOrderInput(
  session:      WaPersistedSession,
  customerName: string,
  subtotal:     number,
  deliveryFee:  number,
  total:        number,
  /** Only true in ALLOWLIST_FULL_TEST — guards and DB writes are skipped otherwise. */
  runGuards:    boolean,
): Promise<AdaptResult> {
  // Validate + re-price items from DB
  const itemsResult = await validateAndPriceItems(session);
  if (!itemsResult.ok) {
    return { ok: false, reason: itemsResult.reason };
  }

  // Business guards (only when we'll actually create the order)
  if (runGuards) {
    const guard = await checkOrderCreationGuards(session.restaurantId);
    if (!guard.ok) {
      return { ok: false, reason: "order_guard", replyText: guard.replyText };
    }
  }

  const address: CreateOrderAddress | null =
    session.deliveryType === "DELIVERY" && session.address
      ? {
          street:       session.address.street       ?? "",
          number:       session.address.number       ?? "",
          neighborhood: session.address.neighborhood ?? "",
          city:         session.address.city         ?? "",
          state:        session.address.state        ?? "",
          cep:          session.address.cep          ?? "",
          complement:   session.address.complement   ?? null,
        }
      : null;

  const paymentMode: CreateOrderInput["paymentMode"] =
    session.paymentMethod === "PIX" ? "pay_now" :
    session.deliveryType   === "DELIVERY" ? "pay_on_delivery" : "pay_on_pickup";

  const input: CreateOrderInput = {
    restaurantId:  session.restaurantId,
    customerName,
    phone:         session.phone,
    customerId:    session.customerId ?? null,
    deliveryType:  session.deliveryType === "DELIVERY" ? "DELIVERY" : "PICKUP",
    address,
    items:         itemsResult.items!,
    subtotal,
    deliveryFee,
    discount:      0,
    total,
    paymentMode,
    source:        "whatsapp",
  };

  return { ok: true, input, items: itemsResult.items };
}
