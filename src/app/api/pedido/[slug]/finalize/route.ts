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
import { createPaymentLink } from "@/lib/stone";
import { decrypt } from "@/lib/crypto";
import { Decimal } from "@prisma/client/runtime/library";
import { createHash, randomUUID } from "crypto";
import { rateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";
import { toE164 } from "@/lib/phone";
import { isGuestIdentifier } from "@/lib/guest";
import { CustomerMetricsSyncService } from "@/services/crm/CustomerMetricsSyncService";
import { calcDeliveryFeeFromConfig } from "@/lib/delivery";

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
  variantName: z.string().optional(),
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
  customerPhone:    z.string().optional(),
  customerId:       z.string().optional(), // pre-resolved customer ID from identify flow
  clientDeliveryFee: z.number().nonnegative().optional(),
  // UTM / channel attribution
  trackingLinkId:   z.string().optional(),
  trafficSource:    z.string().max(100).optional(),
  trafficMedium:    z.string().max(100).optional(),
  trafficCampaign:  z.string().max(100).optional(),
  trafficContent:   z.string().max(100).optional(),
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
    select: { id: true },
  });
  if (!restaurant) {
    return NextResponse.json({ error: "Restaurante não encontrado" }, { status: 404 });
  }
  const restaurantId = restaurant.id;

  const raw    = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos", issues: parsed.error.issues }, { status: 400 });
  }

  const {
    cart, customerName, deliveryMethod, address,
    paymentMode, paymentMethodSub, customerPhone, customerId: incomingCustomerId,
    clientDeliveryFee,
    trackingLinkId, trafficSource, trafficMedium, trafficCampaign, trafficContent,
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

  const [dbItems, dbOptionItems, dbExtras] = await Promise.all([
    prisma.menuItem.findMany({
      where: {
        id:          { in: itemIds },
        isActive:    true,
        isAvailable: true,
        category:    { restaurantId, isActive: true },
      },
      select: {
        id:         true,
        price:      true,
        categoryId: true,
        category:   { select: { name: true } },
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
  ]);

  const dbItemMap = new Map(dbItems.map((i) => [i.id, {
    price:        Number(i.price),
    categoryId:   i.categoryId,
    categoryName: i.category?.name ?? null,
  }]));
  const dbOptionPriceMap = new Map(dbOptionItems.map((o) => [o.id, Number(o.price)]));
  const dbExtraPriceMap  = new Map(dbExtras.map((e) => [e.id, Number(e.price)]));

  for (const item of cart) {
    if (!dbItemMap.has(resolveMenuItemId(item))) {
      return NextResponse.json(
        { error: `Item indisponível: ${item.name}` },
        { status: 400 },
      );
    }
  }

  // Use DB prices throughout — prevents price tampering on base items AND add-ons
  const verifiedCart = cart.map((item) => {
    const menuItemId = resolveMenuItemId(item);
    const dbEntry = dbItemMap.get(menuItemId)!;

    const optionsExtra = (item.selectedOptions ?? []).reduce((s, o) => {
      const dbPrice = dbOptionPriceMap.get(o.optionId) ?? 0;
      return s + dbPrice * o.qty;
    }, 0);
    const extrasExtra = (item.selectedExtras ?? []).reduce((s, e) => {
      const dbPrice = dbExtraPriceMap.get(e.extraId) ?? 0;
      return s + dbPrice * e.qty;
    }, 0);
    const computedPrice = dbEntry.price + optionsExtra + extrasExtra;

    // Rebuild selectedOptions/selectedExtras with DB-verified prices
    const verifiedOptions = (item.selectedOptions ?? []).map((o) => ({
      ...o,
      priceAdjustment: dbOptionPriceMap.get(o.optionId) ?? 0,
    }));
    const verifiedExtras = (item.selectedExtras ?? []).map((e) => ({
      ...e,
      unitPrice: dbExtraPriceMap.get(e.extraId) ?? 0,
    }));

    return {
      ...item,
      menuItemId,
      price:           computedPrice,
      categoryId:      dbEntry.categoryId,
      categoryName:    dbEntry.categoryName,
      selectedOptions: verifiedOptions,
      selectedExtras:  verifiedExtras,
    };
  });

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

  const subtotal = verifiedCart.reduce((acc, item) => acc + item.price * item.qty, 0);

  // ── Delivery fee from restaurant config ───────────────────────
  const deliveryCfg = deliveryMethod === "delivery"
    ? await prisma.deliveryConfig.findUnique({
        where: { restaurantId },
        select: {
          mode: true, fee: true, freeDeliveryAbove: true,
          distanceBaseFee: true, distancePricePerKm: true,
          distanceMinFee: true, distanceMinFeeKm: true, distanceMaxFee: true,
        },
      })
    : null;

  const deliveryFeeAmount = (() => {
    if (!deliveryCfg || deliveryMethod !== "delivery") return 0;

    const freeAbove = deliveryCfg.freeDeliveryAbove != null ? Number(deliveryCfg.freeDeliveryAbove) : null;
    const isFreeOrder = freeAbove != null && freeAbove > 0 && subtotal >= freeAbove;
    if (isFreeOrder) return 0;

    if (deliveryCfg.mode === "simple" && deliveryCfg.fee != null) {
      return Number(deliveryCfg.fee);
    }

    if (deliveryCfg.mode === "distance" || deliveryCfg.mode === "advanced") {
      const cfg = {
        baseFee:    deliveryCfg.distanceBaseFee    != null ? Number(deliveryCfg.distanceBaseFee)    : 0,
        minimumFee: deliveryCfg.distanceMinFee     != null ? Number(deliveryCfg.distanceMinFee)     : null,
        includedKm: deliveryCfg.distanceMinFeeKm   != null ? Number(deliveryCfg.distanceMinFeeKm)   : 0,
        pricePerKm: deliveryCfg.distancePricePerKm != null ? Number(deliveryCfg.distancePricePerKm) : 0,
        maxFee:     deliveryCfg.distanceMaxFee     != null ? Number(deliveryCfg.distanceMaxFee)     : null,
      };
      // Distance is unknown server-side (no geocoding); clientDeliveryFee carries the
      // per-km total computed on the client. Floor = baseFee/minimumFee at unknown distance.
      const floorFee = calcDeliveryFeeFromConfig(cfg, null);
      const raw = (clientDeliveryFee != null && clientDeliveryFee > 0) ? clientDeliveryFee : floorFee;
      const capped = cfg.maxFee != null && cfg.maxFee > 0 ? Math.min(raw, cfg.maxFee) : raw;
      return Math.max(capped, floorFee);
    }

    // manual — fee to be agreed at delivery
    return 0;
  })();

  const orderTotal = subtotal + deliveryFeeAmount;

  // ── Phase-1 transaction: customer + address + order ───────────
  let orderId: string;
  let customerId: string;

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Resolve customer: prefer the pre-verified customerId from the identify flow.
      // This ensures a WhatsApp customer whose phone was already in the DB gets
      // their order linked to the correct Customer row even if the ordering page
      // generated a fresh guest phone.
      let resolvedId: string;
      if (incomingCustomerId) {
        const validated = await tx.customer.findUnique({
          where:  { id: incomingCustomerId },
          select: { id: true, restaurantId: true },
        });
        if (validated?.restaurantId === restaurantId) {
          resolvedId = validated.id;
          console.debug("[finalize] customer resolved via customerId", {
            customerId: resolvedId, strategy: "customerId",
          });
        } else {
          // Cross-restaurant or stale ID — fall through to phone upsert
          const fallback = await tx.customer.upsert({
            where:  { phone_restaurantId: { phone, restaurantId } },
            create: { restaurantId, name: customerName, phone, isGuest: isGuestIdentifier(phone) },
            update: { name: customerName },
            select: { id: true },
          });
          resolvedId = fallback.id;
          console.debug("[finalize] customer resolved via phone (customerId invalid)", {
            customerId: resolvedId, strategy: "phone_lookup",
          });
        }
      } else {
        const upserted = await tx.customer.upsert({
          where:  { phone_restaurantId: { phone, restaurantId } },
          create: { restaurantId, name: customerName, phone, isGuest: isGuestIdentifier(phone) },
          update: { name: customerName },
          select: { id: true },
        });
        resolvedId = upserted.id;
        const strategy = isGuestIdentifier(phone) ? "created_guest" : "phone_lookup";
        console.debug("[finalize] customer resolved via phone upsert", {
          customerId: resolvedId, strategy,
        });
      }
      const customer = { id: resolvedId };

      let deliveryAddressId: string | null = null;
      if (deliveryMethod === "delivery") {
        const addr = await tx.address.create({
          data: {
            customerId:   customer.id,
            street:       address.street || "—",
            number:       address.number || "—",
            neighborhood: address.neighborhood || "—",
            complement:   address.complement  || null,
            city:         address.city        || "",
            state:        address.state       || "",
            zipCode:      address.cep         || "",
          },
          select: { id: true },
        });
        deliveryAddressId = addr.id;
      }

      const order = await tx.order.create({
        data: {
          restaurantId,
          customerId:     customer.id,
          status:         "PENDING",
          type:           deliveryMethod === "delivery" ? "DELIVERY" : "PICKUP",
          source:         "pedido",
          subtotal:       new Decimal(subtotal),
          deliveryFee:    new Decimal(deliveryFeeAmount),
          discount:       new Decimal(0),
          total:          new Decimal(orderTotal),
          deliveryAddressId,
          idempotencyKey: ikey,
          trackingLinkId:  trackingLinkId  ?? null,
          trafficSource:   trafficSource   ?? null,
          trafficMedium:   trafficMedium   ?? null,
          trafficCampaign: trafficCampaign ?? null,
          trafficContent:  trafficContent  ?? null,
          items: {
            create: verifiedCart.map((item) => ({
              menuItemId:   item.menuItemId,
              name:         item.name,
              price:        new Decimal(item.price),
              quantity:     item.qty,
              total:        new Decimal(item.price * item.qty),
              categoryId:   item.categoryId   ?? null,
              categoryName: item.categoryName ?? null,
              variantName:  item.variantName  ?? null,
              notes:        item.notes        ?? null,
              addonsJson:   (item.selectedOptions?.length || item.selectedExtras?.length)
                ? { options: item.selectedOptions ?? [], extras: item.selectedExtras ?? [] }
                : undefined,
            })),
          },
        },
        select: { id: true },
      });

      return { customerId: customer.id, orderId: order.id };
    });

    orderId    = result.orderId;
    customerId = result.customerId;
  } catch (err) {
    console.error("[POST /api/pedido/[slug]/finalize] phase-1 transaction failed", err);
    return NextResponse.json({ error: "Erro ao criar pedido." }, { status: 500 });
  }

  // ── pay_now: generate online payment link ──────────────────────
  if (paymentMode === "pay_now") {
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
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
      try {
        const pixResult = await createPixPayment(mpToken, {
          orderId,
          amount:          orderTotal,
          description:     `Pedido – ${restaurantId}`,
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
          amount:           orderTotal,
          description:      `Pedido – ${restaurantId}`,
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

    await prisma.$transaction(async (tx) => {
      await tx.payment.create({
        data: {
          orderId:           orderId,
          method:            "ONLINE",
          status:            "LINK_SENT",
          amount:            new Decimal(orderTotal),
          paymentMode:       "PAY_NOW",
          providerName,
          providerReference,
          paymentUrl,
          expiresAt:         new Date(expiresAtStr),
        },
      });
      await tx.order.update({
        where: { id: orderId },
        data:  { status: "AWAITING_PAYMENT" },
      });
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

  await prisma.$transaction([
    prisma.payment.create({
      data: {
        orderId:     orderId,
        method:      dbMethod,
        status:      isDelivery ? "PAY_ON_DELIVERY" : "PAY_ON_PICKUP",
        amount:      new Decimal(orderTotal),
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

  return NextResponse.json({ orderId, confirmed: true });
}
