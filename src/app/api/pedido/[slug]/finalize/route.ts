/**
 * POST /api/pedido/[slug]/finalize
 *
 * Finalizes a customer order from the public QR / delivery menu.
 * Creates real Order + Payment records in the DB.
 *
 * pay_now   → creates Mercado Pago preference (falls back to Stone)
 *             returns { orderId, paymentUrl, providerReference, expiresAt }
 * others    → creates payment record with PAY_ON_DELIVERY / PAY_ON_PICKUP
 *             returns { orderId, confirmed: true }
 *
 * Hardening:
 *   - Rate limited: 10 req / 60 s per IP
 *   - Cart items validated against DB (price tampering prevention)
 *   - DB prices used, not client-supplied prices
 *   - 30-second idempotency window (duplicate submit / double-click safe)
 *   - Phase-1 DB writes wrapped in a single Prisma transaction
 *   - Phone normalized to E.164 before customer upsert (prevents duplicate customers)
 *   - Anonymous orders get a unique GUEST phone (no shared WALK-IN merging)
 *   - CRM counter update routed through CustomerMetricsSyncService (idempotent)
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createPixPayment } from "@/lib/mercadopago";
import { resolveCardProvider, resolveCardOperator } from "@/services/payment/PaymentRouter";
import { paymentDescription } from "@/lib/payment-description";
import { createPaymentLink } from "@/lib/stone";
import { decrypt } from "@/lib/crypto";
import { Decimal } from "@prisma/client/runtime/library";
import { createHash, randomUUID } from "crypto";
import { rateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";
import { toE164 } from "@/lib/phone";
import { isGuestIdentifier } from "@/lib/guest";
import { CustomerMetricsSyncService } from "@/services/crm/CustomerMetricsSyncService";
import { resolveDeliveryFee } from "@/lib/delivery-fee-resolver";
import { isRestaurantOpenNow } from "@/lib/business-hours";
import { getActiveMenuPromotions, resolveMenuItemPromotion } from "@/services/promotions/productPromotionResolver";
import { channelPrice, resolveVariantPrice } from "@/services/menu/MenuPricingService";
import { getPublicSiteUrl } from "@/lib/public-url";
import { resolveItemUpsell } from "@/lib/upsell-attribution";
import { createOrderRecord } from "@/services/checkout/CheckoutFinalizationService";
import { CustomerCouponService } from "@/services/crm/CustomerCouponService";
import { runOrderConfirmedEffects } from "@/services/order/orderConfirmation";

// ── Schemas ───────────────────────────────────────────────────────────────────

const selectedOptionSchema = z.object({
  groupId:         z.string(),
  groupName:       z.string(),
  optionId:        z.string(),
  optionName:      z.string(),
  qty:             z.number().int().positive(),
  priceAdjustment: z.number(),
});

const selectedExtraSchema = z.object({
  extraId:   z.string(),
  name:      z.string(),
  unitPrice: z.number().nonnegative(),
  qty:       z.number().int().positive(),
});

const cartItemSchema = z.object({
  id:          z.string(),
  baseItemId:  z.string().optional(),
  name:        z.string(),
  price:       z.number().positive(),
  qty:         z.number().int().positive(),
  notes:       z.string().max(500).optional(),
  // Variant lines: both clients (PedidoClient.handleVariantAdd and the commerce
  // ProductModal) send variantId + variantName and build id as
  // `${baseItemId}_${variantId}` (plus optional `_c<uid>` / `__upsell` suffixes).
  // The server resolves the variant in the DB and prices from it — never from
  // the client-supplied `price`.
  variantId:   z.string().optional(),
  variantName: z.string().optional(),
  // Analytics-only: marks items the customer added from a Foocci suggestion
  // card (AI/waiter grid), not from normal menu browsing. Never affects pricing.
  isUpsell:    z.boolean().optional(),
  selectedOptions: z.array(selectedOptionSchema).optional(),
  selectedExtras:  z.array(selectedExtraSchema).optional(),
});

const addressSchema = z.object({
  cep:            z.string().default(""),
  street:         z.string().default(""),
  number:         z.string().default(""),
  neighborhood:   z.string().default(""),
  city:           z.string().default(""),
  state:          z.string().default(""),
  complement:     z.string().default(""),
  referencePoint: z.string().default(""),
});

const bodySchema = z.object({
  cart:             z.array(cartItemSchema).min(1),
  customerName:     z.string().min(1),
  deliveryMethod:   z.enum(["delivery", "pickup"]),
  address:          addressSchema,
  paymentMode:      z.enum(["pay_now", "pay_on_delivery", "pay_on_pickup"]),
  paymentMethodSub: z.enum(["card_machine", "pix_in_person", "cash"]).nullable().optional(),
  // pay_now online method: "pix" (Mercado Pago) or "card" (SumUp transparent checkout).
  // Defaults to "pix" so existing clients keep the current behaviour unchanged.
  onlineMethod:     z.enum(["pix", "card"]).optional().default("pix"),
  // Cash change: "troco para quanto?" — the bill/note the customer will pay with.
  // Only meaningful for cash; ignored (stored null) for other methods or when it
  // is not strictly greater than the order total.
  changeFor:        z.number().positive().nullable().optional(),
  customerPhone:    z.string().optional(),
  customerId:       z.string().optional(), // pre-resolved customer ID from identify flow
  clientDeliveryFee: z.number().nonnegative().optional(),
  couponCode:       z.string().max(50).optional(),
  customerCouponId: z.string().optional(), // wallet coupon (CustomerCoupon) chosen in the cart
  // UTM / channel attribution
  trackingLinkId:   z.string().optional(),
  trafficSource:    z.string().max(100).optional(),
  trafficMedium:    z.string().max(100).optional(),
  trafficCampaign:  z.string().max(100).optional(),
  trafficContent:   z.string().max(100).optional(),
  // "Indique um amigo": customerId of the referrer, captured from the ?ref link.
  referrerId:       z.string().max(64).optional(),
});

// ── Idempotency ───────────────────────────────────────────────────────────────

function makeIdempotencyKey(
  restaurantId: string,
  customerName: string,
  cart: { id: string; qty: number }[],
): string {
  const fingerprint = cart
    .map((i) => `${i.id}:${i.qty}`)
    .sort()
    .join(",");
  // 30-second window: same person, same items → same key within the window
  const window = Math.floor(Date.now() / 30_000);
  return createHash("sha256")
    .update(`${restaurantId}|${customerName.toLowerCase().trim()}|${fingerprint}|${window}`)
    .digest("hex");
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  // ── Rate limit ────────────────────────────────────────────────
  const ip = getClientIp(req);
  const rl = rateLimit({ key: `finalize:${ip}`, limit: 10, windowMs: 60_000 });
  if (rl.limited) return rateLimitResponse(rl.retryAfter);

  const { slug } = await params;

  const restaurant = await prisma.restaurant.findUnique({
    where:  { slug },
    select: {
      id: true,
      name: true,
      storeProfile: { select: { latitude: true, longitude: true } },
    },
  });
  if (!restaurant) {
    return NextResponse.json({ error: "Restaurante não encontrado" }, { status: 404 });
  }
  const restaurantId = restaurant.id;
  console.info("[finalize] restaurant resolved", { slug, restaurantId });

  // ── Emergency pause guard ─────────────────────────────────────
  const pauseCheck = await prisma.restaurant.findUnique({
    where:  { id: restaurantId },
    select: { isOrderingPaused: true, orderingPausedUntil: true, orderingPausedReason: true },
  });
  if (pauseCheck?.isOrderingPaused) {
    const now = new Date();
    const effectivelyPaused = pauseCheck.orderingPausedUntil === null || pauseCheck.orderingPausedUntil > now;
    if (effectivelyPaused) {
      const reasonSuffix = pauseCheck.orderingPausedReason
        ? ` Motivo: ${pauseCheck.orderingPausedReason}.`
        : "";
      return NextResponse.json(
        { error: `Os pedidos estão temporariamente pausados.${reasonSuffix} Por favor, tente novamente em breve.` },
        { status: 503 },
      );
    }
    // Auto-resume: pausedUntil has passed — clear the pause flag
    await prisma.restaurant.update({
      where: { id: restaurantId },
      data:  { isOrderingPaused: false, orderingPausedReason: null, orderingPausedAt: null, orderingPausedUntil: null, orderingPausedBy: null },
    });
  }

  // ── Business hours guard ──────────────────────────────────────
  const isOpen = await isRestaurantOpenNow(restaurantId);
  if (!isOpen) {
    return NextResponse.json(
      { error: "O restaurante está fechado no momento. Pedidos só são aceitos durante o horário de funcionamento." },
      { status: 503 },
    );
  }

  const raw    = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos", issues: parsed.error.issues }, { status: 400 });
  }

  const {
    cart, customerName, deliveryMethod, address,
    paymentMode, paymentMethodSub, onlineMethod, changeFor, customerPhone, customerId: incomingCustomerId,
    clientDeliveryFee, couponCode, customerCouponId,
    trackingLinkId, trafficSource, trafficMedium, trafficCampaign, trafficContent,
    referrerId,
  } = parsed.data;

  // ── Validate cart against DB (prevent price tampering) ────────
  // baseItemId is set for customized items and variants; fall back to id for plain items.
  function resolveMenuItemId(item: { id: string; baseItemId?: string }): string {
    return item.baseItemId ?? item.id;
  }

  const itemIds = [...new Set(cart.map(resolveMenuItemId))];

  // Collect option/extra IDs for DB price lookup
  const allOptionIds = [...new Set(
    cart.flatMap((i) => (i.selectedOptions ?? []).map((o) => o.optionId)),
  )];
  const allExtraIds = [...new Set(
    cart.flatMap((i) => (i.selectedExtras ?? []).map((e) => e.extraId)),
  )];

  // A line "has a variant" when the client sent variantId (current clients) or
  // variantName (defensive: older cached bundles that embed the variant only in
  // the line id). Fetched WITHOUT the isAvailable filter so an unavailable
  // variant yields a clear 400 instead of a generic "not found".
  const cartWantsVariant = cart.some((i) => i.variantId || i.variantName);

  const [dbItems, dbOptionItems, dbExtras, dbVariants] = await Promise.all([
    prisma.menuItem.findMany({
      where: {
        id:          { in: itemIds },
        isActive:    true,
        isAvailable: true,
        // A trava final do canal. A loja só renderiza `showInDelivery: true`
        // (page.tsx:336), então nenhum pedido legítimo se perde aqui — mas a
        // partir de 05/08/2026 o Garçom CONTA sobre itens que a casa só serve no
        // salão, e um id desses chegando ao carrinho vira "Item indisponível"
        // em vez de um pedido de entrega de um rodízio presencial.
        showInDelivery: true,
        category:    { restaurantId, isActive: true },
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
    }),
    allOptionIds.length > 0
      ? prisma.optionGroupItem.findMany({
          where: { id: { in: allOptionIds }, isAvailable: true },
          select: { id: true, price: true },
        })
      : Promise.resolve([]),
    allExtraIds.length > 0
      ? prisma.menuItemExtra.findMany({
          where: { id: { in: allExtraIds }, isAvailable: true },
          select: { id: true, price: true },
        })
      : Promise.resolve([]),
    cartWantsVariant
      ? prisma.menuItemVariant.findMany({
          where: { menuItemId: { in: itemIds } },
          select: {
            id: true, menuItemId: true, name: true, isAvailable: true,
            price: true, priceDelivery: true, priceDineIn: true, priceIfood: true,
          },
        })
      : Promise.resolve([]),
  ]);

  // Cobra-se o que a tela mostrou — decisão do CEO 04/08: esta rota só atende os
  // clientes /pedido (PedidoClient/LojaClient), e a página exibe TODO preço no
  // canal DELIVERY (page.tsx / mapPedidoItem), inclusive quando o cliente escolhe
  // retirada. Pickup precifica como DELIVERY também — nunca surpresa de valor.
  // A taxa de entrega segue exclusiva do delivery (bloco resolveDeliveryFee).
  const pricingChannel = "DELIVERY" as const;
  const dbItemMap = new Map(dbItems.map((i) => [i.id, {
    price:        channelPrice(i, pricingChannel),
    categoryId:   i.categoryId,
    categoryName: i.category?.name ?? null,
    row:          i, // full channel-price row — needed by resolveVariantPrice inheritance
  }]));
  const dbOptionPriceMap = new Map(dbOptionItems.map((o) => [o.id, Number(o.price)]));
  const dbExtraPriceMap  = new Map(dbExtras.map((e) => [e.id, Number(e.price)]));
  const dbVariantById    = new Map(dbVariants.map((v) => [v.id, v]));

  for (const item of cart) {
    if (!dbItemMap.has(resolveMenuItemId(item))) {
      return NextResponse.json(
        { error: `Item indisponível: ${item.name}` },
        { status: 400 },
      );
    }
  }

  // Load active product + category promotions for server-side price guard.
  // Mesmo espelho da tela: a página /pedido carrega promoções no canal DELIVERY
  // para todo mundo (page.tsx:373), então pickup promociona como DELIVERY também
  // (cobra-se o que a tela mostrou — decisão do CEO 04/08).
  const promoChannel = "DELIVERY" as const;
  const activeMenuPromos = await getActiveMenuPromotions(restaurantId, promoChannel);

  // Use DB prices throughout — prevents price tampering on base items, variants
  // AND add-ons
  type VerifiedCartLine = (typeof cart)[number] & {
    menuItemId:   string;
    categoryId:   string;
    categoryName: string | null;
  };
  const verifiedCart: VerifiedCartLine[] = [];

  for (const item of cart) {
    const menuItemId = resolveMenuItemId(item);
    const dbEntry = dbItemMap.get(menuItemId)!;

    // ── Variant resolution (server-side price guard for variant lines) ────────
    // Primary signal: the explicit variantId. Fallback for older cached clients:
    // the line-id convention `${baseItemId}_${variantId}[suffix]`. Either way the
    // variant must exist, belong to THIS line's item, and be available — fail
    // closed with a 400 rather than silently pricing from the base item.
    const wantsVariant = !!(item.variantId || item.variantName);
    let dbVariant: (typeof dbVariants)[number] | null = null;
    if (wantsVariant) {
      dbVariant = item.variantId
        ? dbVariantById.get(item.variantId) ?? null
        : dbVariants.find((v) =>
            v.menuItemId === menuItemId &&
            (item.id === `${menuItemId}_${v.id}` || item.id.startsWith(`${menuItemId}_${v.id}_`)),
          ) ?? null;
      if (!dbVariant || dbVariant.menuItemId !== menuItemId) {
        return NextResponse.json(
          { error: `Opção inválida para o item: ${item.name}` },
          { status: 400 },
        );
      }
      if (!dbVariant.isAvailable) {
        return NextResponse.json(
          { error: `Opção indisponível: ${item.name}` },
          { status: 400 },
        );
      }
    }

    const optionsExtra = (item.selectedOptions ?? []).reduce((s, o) => {
      const dbPrice = dbOptionPriceMap.get(o.optionId) ?? 0;
      return s + dbPrice * o.qty;
    }, 0);
    const extrasExtra = (item.selectedExtras ?? []).reduce((s, e) => {
      const dbPrice = dbExtraPriceMap.get(e.extraId) ?? 0;
      return s + dbPrice * e.qty;
    }, 0);

    // Promoção × variante: os clientes NUNCA aplicam promoção em linha de
    // variante — o preço mostrado é o da própria variante (PedidoClient só
    // exibe/aplica promo quando !item.hasVariants; o ProductModal commerce usa
    // selectedVariant.price direto). O servidor espelha: variante cobra
    // resolveVariantPrice do banco, sem passar pelo resolvedor de promoções.
    const effectiveBasePrice = dbVariant
      ? resolveVariantPrice(dbEntry.row, dbVariant, pricingChannel)
      : (resolveMenuItemPromotion(menuItemId, dbEntry.categoryId, dbEntry.price, activeMenuPromos)
          ?.promotionalPrice ?? dbEntry.price);
    const computedPrice = effectiveBasePrice + optionsExtra + extrasExtra;

    // Rebuild selectedOptions/selectedExtras with DB-verified prices
    const verifiedOptions = (item.selectedOptions ?? []).map((o) => ({
      ...o,
      priceAdjustment: dbOptionPriceMap.get(o.optionId) ?? 0,
    }));
    const verifiedExtras = (item.selectedExtras ?? []).map((e) => ({
      ...e,
      unitPrice: dbExtraPriceMap.get(e.extraId) ?? 0,
    }));

    verifiedCart.push({
      ...item,
      menuItemId,
      price:           computedPrice,
      // Comanda/ticket must show what the DB charged, not what the client typed
      ...(dbVariant ? { variantName: dbVariant.name } : {}),
      categoryId:      dbEntry.categoryId,
      categoryName:    dbEntry.categoryName,
      selectedOptions: verifiedOptions,
      selectedExtras:  verifiedExtras,
    });
  }

  // ── Idempotency: return existing order on duplicate submit ─────
  const ikey = makeIdempotencyKey(restaurantId, customerName, verifiedCart);
  const existingOrder = await prisma.order.findUnique({
    where:  { idempotencyKey: ikey },
    select: {
      id:      true,
      status:  true,
      payment: { select: { paymentUrl: true, providerReference: true, expiresAt: true } },
    },
  });
  if (existingOrder && existingOrder.status !== "CANCELLED") {
    if (existingOrder.payment?.paymentUrl) {
      return NextResponse.json({
        orderId:           existingOrder.id,
        paymentUrl:        existingOrder.payment.paymentUrl,
        providerReference: existingOrder.payment.providerReference,
        expiresAt:         existingOrder.payment.expiresAt?.toISOString(),
      });
    }
    return NextResponse.json({ orderId: existingOrder.id, confirmed: true });
  }

  // ── Phone normalization + unique guest phone ──────────────────
  // Normalize Brazilian numbers to E.164 so that "11999990000" and
  // "+5511999990000" resolve to the same Customer row (phone_restaurantId unique).
  // Anonymous orders get a per-order GUEST-uuid so they never merge.
  const rawPhone = customerPhone?.trim() ?? "";
  const phone    = rawPhone ? (toE164(rawPhone) || rawPhone) : `GUEST-${randomUUID()}`;

  // phone is used below for CRM guest check (after order creation)

  const subtotal = verifiedCart.reduce((acc, item) => acc + item.price * item.qty, 0);

  // ── Delivery fee — server is the source of truth ─────────────────────────────
  const deliveryCfg = deliveryMethod === "delivery"
    ? await prisma.deliveryConfig.findUnique({
        where: { restaurantId },
        select: {
          mode: true, fee: true, freeDeliveryAbove: true,
          distanceBaseFee: true, distancePricePerKm: true,
          distanceMinFee: true, distanceMinFeeKm: true, distanceMaxKm: true, distanceMaxFee: true,
        },
      })
    : null;

  // Full config dump — essential for diagnosing fee discrepancies in production logs
  if (deliveryCfg) {
    console.info("[finalize] delivery config", {
      restaurantId,
      mode:               deliveryCfg.mode,
      fee:                String(deliveryCfg.fee),
      freeDeliveryAbove:  String(deliveryCfg.freeDeliveryAbove),
      distanceBaseFee:    String(deliveryCfg.distanceBaseFee),
      distancePricePerKm: String(deliveryCfg.distancePricePerKm),
      distanceMinFee:     String(deliveryCfg.distanceMinFee),
      distanceMinFeeKm:   deliveryCfg.distanceMinFeeKm,
      distanceMaxKm:      deliveryCfg.distanceMaxKm,
      distanceMaxFee:     String(deliveryCfg.distanceMaxFee),
      clientDeliveryFeeReceived: clientDeliveryFee ?? null,
      subtotal,
    });
  }

  let deliveryFeeAmount = 0;

  if (deliveryMethod === "delivery") {
    if (!deliveryCfg) {
      console.warn("[finalize] delivery order but no delivery_configs row — charging R$0", { restaurantId });
    } else {
      const restaurantCoords =
        restaurant.storeProfile?.latitude  != null &&
        restaurant.storeProfile?.longitude != null
          ? {
              lat: Number(restaurant.storeProfile.latitude),
              lng: Number(restaurant.storeProfile.longitude),
            }
          : null;

      const feeResult = await resolveDeliveryFee({
        mode:         deliveryCfg.mode ?? "simple",
        deliveryType: "delivery",
        subtotal,
        address: {
          street:       address.street,
          number:       address.number,
          neighborhood: address.neighborhood,
          city:         address.city,
          state:        address.state,
          cep:          address.cep,
        },
        restaurantCoords,
        deliveryConfig: {
          fee:                deliveryCfg.fee               != null ? Number(deliveryCfg.fee)               : null,
          freeDeliveryAbove:  deliveryCfg.freeDeliveryAbove != null ? Number(deliveryCfg.freeDeliveryAbove) : null,
          distanceBaseFee:    deliveryCfg.distanceBaseFee   != null ? Number(deliveryCfg.distanceBaseFee)   : null,
          distancePricePerKm: deliveryCfg.distancePricePerKm != null ? Number(deliveryCfg.distancePricePerKm) : null,
          distanceMinFee:     deliveryCfg.distanceMinFee    != null ? Number(deliveryCfg.distanceMinFee)    : null,
          distanceMinFeeKm:   deliveryCfg.distanceMinFeeKm  != null ? Number(deliveryCfg.distanceMinFeeKm)  : null,
          distanceMaxKm:      deliveryCfg.distanceMaxKm     != null ? Number(deliveryCfg.distanceMaxKm)     : null,
          distanceMaxFee:     deliveryCfg.distanceMaxFee    != null ? Number(deliveryCfg.distanceMaxFee)    : null,
        },
      });

      if (feeResult.calculationStatus === "distance_blocked") {
        console.error("[finalize] BLOCKED: distance mode, distance unavailable, no distanceMinFee", {
          restaurantId, addressCity: address.city, reason: feeResult.reason,
        });
        return NextResponse.json({ error: feeResult.reason }, { status: 422 });
      }

      if (feeResult.calculationStatus === "out_of_range") {
        console.error("[finalize] BLOCKED: customer address exceeds max delivery radius", {
          restaurantId, distanceKm: feeResult.distanceKm, maxDistanceKm: feeResult.maxDistanceKm,
          addressCity: address.city, reason: feeResult.reason,
        });
        return NextResponse.json({ error: feeResult.reason }, { status: 422 });
      }

      deliveryFeeAmount = feeResult.deliveryFee;
      console.info("[finalize] delivery fee resolved", {
        restaurantId,
        status: feeResult.calculationStatus,
        fee:    deliveryFeeAmount,
        distanceKm: feeResult.distanceKm,
        reason: feeResult.reason,
      });
    }
  }

  const orderTotal = subtotal + deliveryFeeAmount;

  // ── Coupon validation (server-side — do not trust client calc) ────────────
  let discountAmount        = 0;
  let resolvedPromoId:      string | null = null;
  let resolvedCouponCode:   string | null = null;
  let promoOneTimePerUser   = false;
  let redeemedWalletCouponId: string | null = null;

  // Wallet coupon (card-defined, iFood-style) — takes the single discount slot when
  // provided. Requires an identified customer; validated fresh from the DB (owned,
  // ACTIVE, unexpired). Mutually exclusive with a typed promo code.
  if (customerCouponId?.trim() && incomingCustomerId && !isGuestIdentifier(phone)) {
    const wc = await CustomerCouponService.findRedeemable(restaurantId, incomingCustomerId, customerCouponId.trim());
    if (wc && wc.discountType === "FREE_SHIPPING" && (deliveryMethod !== "delivery" || deliveryFeeAmount <= 0)) {
      // Frete grátis only makes sense on a delivery WITH a fee — on pickup (or
      // zero fee) the coupon is NOT consumed; it stays in the wallet for later.
      console.info("[finalize] frete-grátis coupon not applicable (pickup/no fee) — kept in wallet", { customerCouponId });
    } else if (wc) {
      // CUSTOM = a manual reward ("sobremesa grátis") — the stored value is only a
      // cost estimate for the budget, never a money discount. Still redeemed (marked
      // used) so the customer can't reuse it; the restaurant fulfils it by hand.
      discountAmount = wc.discountType === "PERCENTAGE"
        ? Math.min((subtotal * wc.discountValue) / 100, subtotal)
        : wc.discountType === "FIXED"
        ? Math.min(wc.discountValue, orderTotal)
        : wc.discountType === "FREE_SHIPPING"
        ? deliveryFeeAmount
        : 0;
      discountAmount = Math.round(discountAmount * 100) / 100;
      redeemedWalletCouponId = wc.id;
    } else {
      console.info("[finalize] wallet coupon rejected (not redeemable)", { customerCouponId });
    }
  } else if (couponCode?.trim()) {
    const promo = await prisma.promotion.findFirst({
      where: {
        restaurantId,
        status:     "ACTIVE",
        couponCode: { equals: couponCode.trim(), mode: "insensitive" },
      },
      select: {
        id: true, type: true, discountValue: true, channel: true,
        minOrderValue: true, maxUses: true, usedCount: true,
        oneTimePerUser: true, startsAt: true, endsAt: true, daysOfWeek: true,
        couponCode: true,
      },
    });

    if (promo) {
      const now       = new Date();
      const notYet    = promo.startsAt != null && promo.startsAt > now;
      const expired   = promo.endsAt   != null && promo.endsAt   < now;
      const dayOk     = promo.daysOfWeek.length === 0 || promo.daysOfWeek.includes(now.getDay());
      const channelOk = promo.channel === "ALL"
        || (promo.channel === "DELIVERY" && deliveryMethod === "delivery")
        || (promo.channel === "QR_MENU"  && deliveryMethod === "pickup");
      const minOk     = promo.minOrderValue == null || subtotal >= Number(promo.minOrderValue);
      const usesOk    = promo.maxUses == null || promo.maxUses === 0 || promo.usedCount < promo.maxUses;

      if (!notYet && !expired && dayOk && channelOk && minOk && usesOk) {
        const dv = Number(promo.discountValue);
        switch (promo.type) {
          case "PERCENTAGE":
            discountAmount = Math.min((subtotal * dv) / 100, subtotal);
            break;
          case "FIXED":
          case "COUPON":
            discountAmount = Math.min(dv, orderTotal);
            break;
          case "FREE_DELIVERY":
            discountAmount = deliveryFeeAmount;
            break;
        }
        discountAmount      = Math.round(discountAmount * 100) / 100;
        resolvedPromoId     = promo.id;
        resolvedCouponCode  = promo.couponCode ?? couponCode.trim();
        promoOneTimePerUser = promo.oneTimePerUser;
      } else {
        console.info("[finalize] coupon rejected", {
          couponCode: couponCode.trim(), notYet, expired, dayOk, channelOk, minOk, usesOk,
        });
      }
    }
  }

  const finalTotal = Math.max(0, Math.round((orderTotal - discountAmount) * 100) / 100);

  // ── Phase-1 transaction: customer + address + order ───────────
  // Delegated to the shared CheckoutFinalizationService (same engine used by
  // WhatsApp text ordering). All DB writes happen inside a single Prisma transaction.
  let orderId: string;
  let customerId: string;

  try {
    const result = await createOrderRecord({
      restaurantId,
      customerName,
      phone,
      customerId: incomingCustomerId ?? null,
      deliveryType: deliveryMethod === "delivery" ? "DELIVERY" : "PICKUP",
      address: deliveryMethod === "delivery" ? address : null,
      items: verifiedCart.map((item) => ({
        menuItemId:    item.menuItemId,
        name:          item.name,
        price:         item.price,
        qty:           item.qty,
        notes:         item.notes ?? null,
        variantName:   item.variantName ?? null,
        categoryId:    item.categoryId   ?? null,
        categoryName:  item.categoryName ?? null,
        isUpsell:      resolveItemUpsell(item),
        selectedOptions: item.selectedOptions,
        selectedExtras:  item.selectedExtras,
      })),
      subtotal,
      deliveryFee:           deliveryFeeAmount,
      discount:              discountAmount,
      total:                 finalTotal,
      paymentMode,
      couponCode:            resolvedCouponCode,
      promotionId:           resolvedPromoId,
      promoOneTimePerUser,
      customerCouponId:      redeemedWalletCouponId,
      idempotencyKey:        ikey,
      source:                "pedido",
      trackingLinkId,
      trafficSource,
      trafficMedium,
      trafficCampaign,
      trafficContent,
    });

    orderId    = result.orderId;
    customerId = result.customerId;

    // "Indique um amigo": if this checkout carried a referral link, validate and
    // reward both sides. Fire-and-forget — a referral hiccup never breaks checkout.
    if (referrerId) {
      void import("@/services/crm/ReferralService")
        .then(({ ReferralService }) =>
          ReferralService.processFirstOrderReferral({ restaurantId, customerId, orderId, referrerId }),
        )
        .catch((e) => console.warn("[finalize] referral processing failed", e));
    }
  } catch (err) {
    if (err instanceof Error && err.message === "COUPON_ALREADY_USED") {
      return NextResponse.json({ error: "Cupom já utilizado por este cliente" }, { status: 400 });
    }
    console.error("[POST /api/pedido/[slug]/finalize] phase-1 transaction failed", err);
    return NextResponse.json({ error: "Erro ao criar pedido." }, { status: 500 });
  }

  // ── Close open draft for this customer (fire-and-forget) ──────────────────
  // Marks any OPEN OrderDraft as CONFIRMED so it's excluded from future
  // abandonment detection. Never blocks the response.
  void prisma.orderDraft.updateMany({
    where: { restaurantId, customerId, status: "OPEN" },
    data:  { status: "CONFIRMED", confirmedAt: new Date() },
  }).catch((err) =>
    console.warn("[finalize] draft close failed", {
      restaurantId,
      customerId,
      orderId,
      error: err instanceof Error ? err.message : String(err),
    }),
  );

  // ── pay_now: generate online payment link ──────────────────────
  if (paymentMode === "pay_now") {
    // ── Card — transparent checkout (Mercado Pago token model OR SumUp checkout) ──
    // The operator is resolved server-side; the client gets only what its flow
    // needs. Verified/charged by /card/charge (MP) or /card/confirm (SumUp).
    // Kept fully separate from the Pix/Stone path below.
    if (onlineMethod === "card") {
      const cardOp = await resolveCardOperator(restaurantId);
      if (!cardOp) {
        await prisma.order.delete({ where: { id: orderId } }).catch(() => null);
        return NextResponse.json(
          { error: "Pagamento com cartão não configurado. Escolha Pix ou pagamento na entrega." },
          { status: 503 }
        );
      }

      // Mercado Pago — transparent card (token model): record a pending payment
      // and hand the client the Public Key. The browser tokenizes the card and
      // /card/charge completes the charge. Order stays AWAITING_PAYMENT.
      if (cardOp.provider === "mercadopago") {
        await prisma.payment.create({
          data: {
            orderId,
            method:       "ONLINE",
            status:       "LINK_SENT",
            amount:       new Decimal(finalTotal),
            paymentMode:  "PAY_NOW",
            providerName: "mercadopago",
          },
        });
        return NextResponse.json({
          orderId,
          card: { provider: "mercadopago", publicKey: cardOp.publicKey, amount: finalTotal },
        });
      }

      // SumUp — checkout model: create the operator checkout; the widget completes
      // it and /card/confirm verifies. providerReference = the checkout id.
      try {
        const cardProvider = await resolveCardProvider(restaurantId);
        if (!cardProvider) throw new Error("SumUp provider unavailable");
        const init = await cardProvider.createCardCheckout({
          orderId,
          amount:      finalTotal,
          description: paymentDescription(restaurant.name),
        });
        await prisma.payment.create({
          data: {
            orderId,
            method:            "ONLINE",
            status:            "LINK_SENT",
            amount:            new Decimal(finalTotal),
            paymentMode:       "PAY_NOW",
            providerName:      init.providerName,
            providerReference: init.checkoutId,
          },
        });
        return NextResponse.json({
          orderId,
          card: { provider: "sumup", checkoutId: init.checkoutId, ...init.clientParams },
        });
      } catch (err) {
        await prisma.order.delete({ where: { id: orderId } }).catch(() => null);
        const msg = err instanceof Error ? err.message : "SumUp error";
        console.error("[finalize] card checkout failed", { orderId, error: msg });
        return NextResponse.json({ error: "Não foi possível iniciar o pagamento com cartão. Tente novamente." }, { status: 502 });
      }
    }

    const mpCfg = await prisma.integrationConfig.findUnique({
      where:  { restaurantId_provider: { restaurantId, provider: "mercadopago" } },
      select: { configBlob: true, isActive: true },
    });
    const mpToken = mpCfg?.isActive
      ? (() => {
          try {
            return (JSON.parse(decrypt(mpCfg.configBlob)) as { accessToken: string }).accessToken;
          } catch { return null; }
        })()
      : null;

    // Guard: if no real payment provider is configured, abort with a clear error.
    // Stone in mock mode (no STONE_CLIENT_ID) would produce fake test URLs — block it.
    const stoneConfigured = !!(process.env.STONE_CLIENT_ID && process.env.STONE_CLIENT_SECRET);
    if (!mpToken && !stoneConfigured) {
      console.warn(
        "[finalize] pay_now requested but no online payment provider is configured.",
        { restaurantId, orderId, mpActive: !!mpCfg?.isActive, stoneConfigured: false }
      );
      // Clean up the order we just created
      await prisma.order.delete({ where: { id: orderId } }).catch(() => null);
      return NextResponse.json(
        { error: "Pagamento online não configurado. Escolha pagamento na entrega ou retire no balcão." },
        { status: 503 }
      );
    }

    let providerReference: string;
    let paymentUrl: string;       // stores Pix copy-paste key (MP) or hosted URL (Stone)
    let expiresAtStr: string;
    let providerName: string;
    // Pix-specific fields — only set when using MP direct Pix API
    let pixCopyPaste: string | undefined;
    let pixQrCodeBase64: string | undefined;

    if (mpToken) {
      // Backend guard: MP is always pix_only — reject if somehow called for non-Pix
      const appUrl = getPublicSiteUrl();
      try {
        const pixResult = await createPixPayment(mpToken, {
          orderId,
          amount:          finalTotal,
          description:     paymentDescription(restaurant.name),
          notificationUrl: appUrl ? `${appUrl}/api/payments/mercadopago/webhook` : undefined,
        });
        providerReference  = pixResult.paymentId;
        paymentUrl         = pixResult.pixCopyPaste; // stored in paymentUrl column for later retrieval
        expiresAtStr       = pixResult.expiresAt;
        providerName       = "mercadopago";
        pixCopyPaste       = pixResult.pixCopyPaste;
        pixQrCodeBase64    = pixResult.pixQrCodeBase64;
      } catch (err) {
        await prisma.order.delete({ where: { id: orderId } });
        const msg = err instanceof Error ? err.message : "MP error";
        return NextResponse.json({ error: msg }, { status: 502 });
      }
    } else {
      try {
        const stoneResult = await createPaymentLink({
          orderId:          orderId,
          amount:           finalTotal,
          description:      paymentDescription(restaurant.name),
          expiresInMinutes: 30,
        });
        providerReference = stoneResult.providerReference;
        paymentUrl        = stoneResult.paymentUrl;
        expiresAtStr      = stoneResult.expiresAt;
        providerName      = "stone";
      } catch (err) {
        await prisma.order.delete({ where: { id: orderId } });
        const msg = err instanceof Error ? err.message : "Stone error";
        return NextResponse.json({ error: msg }, { status: 502 });
      }
    }

    // Order is already AWAITING_PAYMENT (set in phase-1 transaction above).
    // Only need to persist the payment record.
    await prisma.payment.create({
      data: {
        orderId:           orderId,
        method:            "ONLINE",
        status:            "LINK_SENT",
        amount:            new Decimal(finalTotal),
        paymentMode:       "PAY_NOW",
        providerName,
        providerReference,
        paymentUrl,
        expiresAt:         new Date(expiresAtStr),
      },
    });

    // Return Pix data when available (MP); fallback to paymentUrl redirect (Stone)
    return NextResponse.json({
      orderId,
      providerReference,
      expiresAt: expiresAtStr,
      ...(pixCopyPaste
        ? { pixCopyPaste, pixQrCodeBase64: pixQrCodeBase64 ?? "" }
        : { paymentUrl }
      ),
    });
  }

  // ── pay_on_delivery / pay_on_pickup ────────────────────────────
  const isDelivery = paymentMode === "pay_on_delivery";
  const methodMap: Record<string, "CASH" | "CARD_MACHINE" | "PIX_IN_PERSON"> = {
    cash:          "CASH",
    card_machine:  "CARD_MACHINE",
    pix_in_person: "PIX_IN_PERSON",
  };
  const dbMethod = paymentMethodSub ? (methodMap[paymentMethodSub] ?? "CASH") : "CASH";

  // Cash change ("troco para"): only stored for cash, and only when the note the
  // customer will hand over is strictly greater than the total (otherwise there
  // is no change to give). null everywhere else. The cashier ticket computes the
  // change to bring as changeFor - total.
  const changeForValue =
    dbMethod === "CASH" && changeFor != null && changeFor > finalTotal
      ? new Decimal(changeFor)
      : null;

  await prisma.$transaction([
    prisma.payment.create({
      data: {
        orderId:     orderId,
        method:      dbMethod,
        status:      isDelivery ? "PAY_ON_DELIVERY" : "PAY_ON_PICKUP",
        amount:      new Decimal(finalTotal),
        changeFor:   changeForValue,
        paymentMode: isDelivery ? "PAY_ON_DELIVERY" : "PAY_ON_PICKUP",
      },
    }),
    prisma.order.update({
      where: { id: orderId },
      data:  { status: "CONFIRMED" },
    }),
  ]);

  // Guest sessions are excluded from CRM — their orders count as anonymous traffic,
  // not as real customer relationships. Skip the metric sync entirely for guests.
  if (!isGuestIdentifier(phone)) {
    await CustomerMetricsSyncService.syncOrderToCustomerMetrics(orderId, "finalize");
  }

  // Obrigações de todo pedido CONFIRMED (comanda + NFC-e), num lugar só.
  void runOrderConfirmedEffects(restaurantId, orderId, "finalize");

  return NextResponse.json({ orderId, confirmed: true });
}
