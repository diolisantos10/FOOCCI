/**
 * WhatsAppOrderCreationService — controlled order creation from a WhatsApp session.
 *
 * Mirrors the canonical /pedido finalize transaction (server-side price guard,
 * E.164 phone, customer upsert, address, order + items, order number). Reuses the
 * existing Order/Payment state machine — does NOT invent a parallel one.
 *
 * Modes:
 *   DRY_RUN_ONLY / ALLOWLIST_REPLY_ONLY → never creates. Returns wouldCreate summary.
 *   ALLOWLIST_FULL_TEST                 → creates a real order (guards already checked
 *                                         by the runtime wrapper).
 *
 * Pix orders are created as AWAITING_PAYMENT (hidden from the operational dashboard
 * until the MP webhook approves). Pay-on-delivery orders follow finalize's flow.
 * Idempotency: if the session already has an orderId, no new order is created.
 */

import type { WaPersistedSession } from "./types";

export interface OrderCreationInput {
  session:      WaPersistedSession;
  customerName: string;
  subtotal:     number;
  deliveryFee:  number;
  total:        number;
  allowCreate:  boolean; // true only in ALLOWLIST_FULL_TEST with guards passed
}

export interface OrderCreationResult {
  orderId:     string | null;
  status:      string | null;
  wouldCreate: boolean;          // what would happen in dry-run
  isPix:       boolean;
  created:     boolean;
  reason:      string;
}

export async function createOrderFromSession(
  input: OrderCreationInput,
): Promise<OrderCreationResult> {
  const { session, customerName, subtotal, deliveryFee, total, allowCreate } = input;
  const isPix = session.paymentMethod === "PIX";

  // Idempotency: never re-create
  if (session.orderId) {
    return {
      orderId:     session.orderId,
      status:      isPix ? "AWAITING_PAYMENT" : "CONFIRMED",
      wouldCreate: false,
      isPix,
      created:     false,
      reason:      "session already has an orderId (idempotent)",
    };
  }

  if (!allowCreate) {
    return {
      orderId:     null,
      status:      isPix ? "AWAITING_PAYMENT" : "PENDING",
      wouldCreate: true,
      isPix,
      created:     false,
      reason:      "dry-run / not full-test mode — no order created",
    };
  }

  const { prisma }            = await import("@/lib/prisma");
  const { Decimal }           = await import("@prisma/client/runtime/library");
  const { toE164 }            = await import("@/lib/phone");
  const { isGuestIdentifier } = await import("@/lib/guest");
  const { assignOrderNumber } = await import("@/lib/order-number");

  const phone = toE164(session.phone) || session.phone;
  const isDelivery = session.deliveryType === "DELIVERY";

  // Re-validate item prices server-side against the live menu (anti-tampering)
  const menuItemIds = [...new Set(session.selectedItems.map(i => i.menuItemId))];
  const dbItems = await prisma.menuItem.findMany({
    where: {
      id:          { in: menuItemIds },
      isActive:    true,
      isAvailable: true,
      category:    { restaurantId: session.restaurantId, isActive: true },
    },
    select: { id: true, categoryId: true, category: { select: { name: true } } },
  });
  const dbItemMap = new Map(dbItems.map(i => [i.id, i]));
  for (const item of session.selectedItems) {
    if (!dbItemMap.has(item.menuItemId)) {
      return {
        orderId: null, status: null, wouldCreate: false, isPix, created: false,
        reason: `item indisponível: ${item.menuItemName}`,
      };
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    const customer = await tx.customer.upsert({
      where:  { phone_restaurantId: { phone, restaurantId: session.restaurantId } },
      create: { restaurantId: session.restaurantId, name: customerName, phone, isGuest: isGuestIdentifier(phone) },
      update: { name: customerName },
      select: { id: true },
    });

    let deliveryAddressId: string | null = null;
    if (isDelivery && session.address) {
      const addr = await tx.address.create({
        data: {
          customerId:   customer.id,
          street:       session.address.street       || "—",
          number:       session.address.number       || "—",
          neighborhood: session.address.neighborhood || "—",
          complement:   session.address.complement   || null,
          city:         session.address.city         || "",
          state:        session.address.state        || "",
          zipCode:      session.address.cep          || "",
        },
        select: { id: true },
      });
      deliveryAddressId = addr.id;
    }

    const orderNumber = await assignOrderNumber(tx, session.restaurantId);

    const order = await tx.order.create({
      data: {
        restaurantId:  session.restaurantId,
        customerId:    customer.id,
        orderNumber,
        // Pix → AWAITING_PAYMENT (hidden until webhook approves).
        // Pay-on-delivery → PENDING, then CONFIRMED below (mirrors finalize).
        status:        isPix ? "AWAITING_PAYMENT" : "PENDING",
        type:          isDelivery ? "DELIVERY" : "PICKUP",
        source:        "whatsapp",
        subtotal:      new Decimal(subtotal),
        deliveryFee:   new Decimal(deliveryFee),
        discount:      new Decimal(0),
        total:         new Decimal(total),
        deliveryAddressId,
        items: {
          create: session.selectedItems.map(item => ({
            menuItemId:   item.menuItemId,
            name:         item.menuItemName,
            price:        new Decimal(item.unitPrice),
            quantity:     item.quantity,
            total:        new Decimal(item.lineTotal),
            categoryId:   dbItemMap.get(item.menuItemId)?.categoryId ?? null,
            categoryName: dbItemMap.get(item.menuItemId)?.category?.name ?? null,
            variantName:  item.variantName ?? null,
            notes:        item.notes ?? null,
          })),
        },
      },
      select: { id: true },
    });

    return { orderId: order.id };
  });

  // Pay-on-delivery: create payment record + confirm (mirrors finalize offline path).
  // Pix: leave AWAITING_PAYMENT; the payment record + Pix come from WhatsAppPaymentService.
  if (!isPix) {
    const dbMethod = session.paymentMethod === "CARD" ? "CARD_MACHINE" : "CASH";
    await prisma.$transaction([
      prisma.payment.create({
        data: {
          orderId:     result.orderId,
          method:      dbMethod,
          status:      isDelivery ? "PAY_ON_DELIVERY" : "PAY_ON_PICKUP",
          amount:      new Decimal(total),
          paymentMode: isDelivery ? "PAY_ON_DELIVERY" : "PAY_ON_PICKUP",
        },
      }),
      prisma.order.update({
        where: { id: result.orderId },
        data:  { status: "CONFIRMED" },
      }),
    ]);
  }

  return {
    orderId:     result.orderId,
    status:      isPix ? "AWAITING_PAYMENT" : "CONFIRMED",
    wouldCreate: true,
    isPix,
    created:     true,
    reason:      isPix ? "order created AWAITING_PAYMENT (Pix pending webhook)" : "order created CONFIRMED (pay on delivery/pickup)",
  };
}
