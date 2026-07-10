/**
 * CheckoutFinalizationService — shared inner checkout engine.
 *
 * Single source of truth for customer upsert + address creation + order
 * record creation. Used by:
 *   - /api/pedido/[slug]/finalize route  (visual checkout)
 *   - WhatsApp Text Ordering full-test path  (conversational checkout)
 *
 * Payment creation (Pix via MP, Stone, offline) lives in each caller because
 * the finalize route also needs a Stone fallback, which WhatsApp does not.
 * Both callers already use createPixPayment() from @/lib/mercadopago — that
 * sharing is proven in WhatsAppOrderingPixReuse.test.ts.
 *
 * HTTP concerns (rate-limiting, request parsing, restaurant lookup,
 * business-hours guards, coupon validation, delivery fee calculation) stay
 * in their respective callers — only the core DB-level transaction lives here.
 */
import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";
import { toE164 } from "@/lib/phone";
import { isGuestIdentifier } from "@/lib/guest";
import { assignOrderNumber } from "@/lib/order-number";
import { resolveItemUpsell } from "@/lib/upsell-attribution";
import { invalidateMenuBestSellers } from "@/services/menu/menuBestSellers";

export interface CreateOrderAddress {
  street:       string;
  number:       string;
  neighborhood: string;
  city:         string;
  state:        string;
  cep:          string;
  complement?:  string | null;
}

export interface CreateOrderItem {
  menuItemId:    string;
  name:          string;
  /** Server-validated price per unit (base + options + extras). */
  price:         number;
  qty:           number;
  notes?:        string | null;
  variantName?:  string | null;
  categoryId?:   string | null;
  categoryName?: string | null;
  isUpsell?:     boolean;
  selectedOptions?: {
    groupId:         string;
    groupName:       string;
    optionId:        string;
    optionName:      string;
    qty:             number;
    priceAdjustment: number;
  }[];
  selectedExtras?: {
    extraId:   string;
    name:      string;
    unitPrice: number;
    qty:       number;
  }[];
}

export interface CreateOrderInput {
  restaurantId:          string;
  customerName:          string;
  /** Raw phone — normalised to E.164 inside the service. */
  phone:                 string;
  customerId?:           string | null;
  deliveryType:          "DELIVERY" | "PICKUP";
  address?:              CreateOrderAddress | null;
  items:                 CreateOrderItem[];
  subtotal:              number;
  deliveryFee:           number;
  discount:              number;
  total:                 number;
  /** "pay_now" → AWAITING_PAYMENT; others → PENDING (confirmed below by caller). */
  paymentMode:           "pay_now" | "pay_on_delivery" | "pay_on_pickup";
  couponCode?:           string | null;
  promotionId?:          string | null;
  promoOneTimePerUser?:  boolean;
  /** Wallet coupon (CustomerCoupon) redeemed on this order, if any. */
  customerCouponId?:     string | null;
  idempotencyKey?:       string | null;
  source:                string;
  trackingLinkId?:       string | null;
  trafficSource?:        string | null;
  trafficMedium?:        string | null;
  trafficCampaign?:      string | null;
  trafficContent?:       string | null;
}

export interface CreateOrderResult {
  orderId:    string;
  customerId: string;
}

/**
 * Creates the customer, address (if delivery), and order inside a single
 * Prisma transaction. The caller is responsible for creating the Payment record
 * and (for offline payments) updating the order status to CONFIRMED.
 */
export async function createOrderRecord(input: CreateOrderInput): Promise<CreateOrderResult> {
  const phone = toE164(input.phone) || input.phone;

  const result = await prisma.$transaction(async (tx) => {
    // ── Customer resolve ──────────────────────────────────────────────────
    let resolvedCustomerId: string;
    if (input.customerId) {
      const validated = await tx.customer.findUnique({
        where:  { id: input.customerId },
        select: { id: true, restaurantId: true },
      });
      if (validated?.restaurantId === input.restaurantId) {
        resolvedCustomerId = validated.id;
      } else {
        const fallback = await tx.customer.upsert({
          where:  { phone_restaurantId: { phone, restaurantId: input.restaurantId } },
          create: { restaurantId: input.restaurantId, name: input.customerName, phone, isGuest: isGuestIdentifier(phone) },
          update: { name: input.customerName },
          select: { id: true },
        });
        resolvedCustomerId = fallback.id;
      }
    } else {
      const upserted = await tx.customer.upsert({
        where:  { phone_restaurantId: { phone, restaurantId: input.restaurantId } },
        create: { restaurantId: input.restaurantId, name: input.customerName, phone, isGuest: isGuestIdentifier(phone) },
        update: { name: input.customerName },
        select: { id: true },
      });
      resolvedCustomerId = upserted.id;
    }

    // ── Address (delivery only) ───────────────────────────────────────────
    let deliveryAddressId: string | null = null;
    if (input.deliveryType === "DELIVERY" && input.address) {
      const addr = await tx.address.create({
        data: {
          customerId:   resolvedCustomerId,
          street:       input.address.street       || "—",
          number:       input.address.number       || "—",
          neighborhood: input.address.neighborhood || "—",
          complement:   input.address.complement   || null,
          city:         input.address.city         || "",
          state:        input.address.state        || "",
          zipCode:      input.address.cep          || "",
        },
        select: { id: true },
      });
      deliveryAddressId = addr.id;
    }

    // ── One-time-per-user coupon guard ────────────────────────────────────
    if (input.promotionId && input.promoOneTimePerUser) {
      const alreadyUsed = await tx.order.findFirst({
        where: {
          customerId:  resolvedCustomerId,
          promotionId: input.promotionId,
          status:      { notIn: ["AWAITING_PAYMENT", "CANCELLED"] },
        },
        select: { id: true },
      });
      if (alreadyUsed) throw new Error("COUPON_ALREADY_USED");
    }

    const orderNumber = await assignOrderNumber(tx, input.restaurantId);

    const order = await tx.order.create({
      data: {
        restaurantId:  input.restaurantId,
        customerId:    resolvedCustomerId,
        orderNumber,
        status:        input.paymentMode === "pay_now" ? "AWAITING_PAYMENT" : "PENDING",
        type:          input.deliveryType === "DELIVERY" ? "DELIVERY" : "PICKUP",
        source:        input.source,
        subtotal:      new Decimal(input.subtotal),
        deliveryFee:   new Decimal(input.deliveryFee),
        discount:      new Decimal(input.discount),
        total:         new Decimal(input.total),
        couponCode:    input.couponCode ?? null,
        promotionId:   input.promotionId ?? null,
        couponUsageCountedAt: (input.promotionId && input.paymentMode !== "pay_now") ? new Date() : null,
        customerCouponId: input.customerCouponId ?? null,
        deliveryAddressId,
        idempotencyKey:  input.idempotencyKey  ?? null,
        trackingLinkId:  input.trackingLinkId  ?? null,
        trafficSource:   input.trafficSource   ?? null,
        trafficMedium:   input.trafficMedium   ?? null,
        trafficCampaign: input.trafficCampaign ?? null,
        trafficContent:  input.trafficContent  ?? null,
        items: {
          create: input.items.map((item) => ({
            menuItemId:   item.menuItemId,
            name:         item.name,
            price:        new Decimal(item.price),
            quantity:     item.qty,
            total:        new Decimal(item.price * item.qty),
            categoryId:   item.categoryId   ?? null,
            categoryName: item.categoryName ?? null,
            variantName:  item.variantName  ?? null,
            notes:        item.notes        ?? null,
            isUpsell:     resolveItemUpsell(item),
            addonsJson:   (item.selectedOptions?.length || item.selectedExtras?.length)
              ? { options: item.selectedOptions ?? [], extras: item.selectedExtras ?? [] }
              : undefined,
          })),
        },
      },
      select: { id: true },
    });

    // Promotion usage (offline payments only — pay_now counted after webhook)
    if (input.promotionId && input.paymentMode !== "pay_now") {
      await tx.promotion.update({
        where: { id: input.promotionId },
        data:  { usedCount: { increment: 1 } },
      });
    }

    // Wallet coupon: consume now for offline payments (same timing as usedCount).
    // pay_now is consumed on payment approval by the webhooks. Race-safe: only an
    // ACTIVE row flips, so a returned-existing (idempotent) order can't double-consume.
    if (input.customerCouponId && input.paymentMode !== "pay_now") {
      await tx.customerCoupon.updateMany({
        where: { id: input.customerCouponId, customerId: resolvedCustomerId, status: "ACTIVE" },
        data:  { status: "USED", usedAt: new Date(), usedOrderId: order.id },
      });
    }

    return { orderId: order.id, customerId: resolvedCustomerId };
  });

  // Best-effort freshness: a new order may change the bestsellers — drop the
  // cached "Mais vendidos" so the public menu reflects it within seconds rather
  // than waiting for the TTL. Never allow this to affect the order result.
  try { invalidateMenuBestSellers(input.restaurantId); } catch { /* ignore */ }

  return result;
}
