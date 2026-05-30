/**
 * POST /api/orders/manual
 *
 * Creates a manual order (phone order, WhatsApp, walk-in, etc.) on behalf of a customer.
 * Restricted to OWNER and MANAGER roles.
 *
 * If `items` is provided: uses DB-authoritative prices, validates product ownership.
 * If `items` is omitted: falls back to the legacy single-item creation using `total`.
 *
 * Order is always created as CONFIRMED (staff accepted it verbally).
 * Payment status depends on `paymentStatus` field.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { getTenantContext } from "@/lib/tenant";
import { Decimal } from "@prisma/client/runtime/library";
import { ConversationLogService } from "@/services/conversation/ConversationLogService";
import { assignOrderNumber, formatOrderNumber } from "@/lib/order-number";
import { resolveDeliveryFee } from "@/lib/delivery-fee-resolver";
import { geocodeAddress, type LatLng } from "@/lib/geocoding";
import { isQuoteStatusBlocked } from "@/lib/delivery-authorization";

const itemSchema = z.object({
  menuItemId: z.string().min(1),
  quantity:   z.number().int().positive(),
  note:       z.string().optional(),
});

const addressSchema = z.object({
  cep:          z.string().min(1),
  street:       z.string().min(1),
  number:       z.string().min(1),
  neighborhood: z.string().default(""),
  city:         z.string().default(""),
  state:        z.string().default(""),
  complement:   z.string().optional(),
});

const bodySchema = z.object({
  customerName:  z.string().min(1),
  customerPhone: z.string().optional(),
  notes:         z.string().optional(), // overall order note
  deliveryFee:   z.number().min(0).default(0),
  type:          z.enum(["DELIVERY", "PICKUP"]),
  paymentMethod: z.enum(["CASH", "PIX", "CREDIT_CARD", "DEBIT_CARD", "CARD_MACHINE"]),
  paymentStatus: z.enum(["PAID", "PAY_ON_DELIVERY"]).default("PAID"),
  source:         z.enum(["manual", "whatsapp_manual"]).default("manual"),
  conversationId:  z.string().optional(),
  deliveryAddress: addressSchema.optional(),
  discountAmount:  z.number().min(0).optional(),
  // Real product items (preferred)
  items: z.array(itemSchema).optional(),
  // Legacy: free-text total (used when items not provided)
  total: z.number().positive().optional(),
});

export async function POST(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  if (!["OWNER", "MANAGER"].includes(ctx.role)) {
    return NextResponse.json(
      { error: "Sem permissão. Apenas OWNER ou MANAGER pode criar pedidos manuais." },
      { status: 403 }
    );
  }

  const raw = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.errors[0];
    return NextResponse.json({ error: first?.message ?? "Dados inválidos" }, { status: 400 });
  }

  const {
    customerName, customerPhone, notes, deliveryFee, type,
    paymentMethod, paymentStatus, source, conversationId, deliveryAddress, items, total,
    discountAmount,
  } = parsed.data;
  const { restaurantId } = ctx;

  if (type === "DELIVERY" && !deliveryAddress) {
    return NextResponse.json(
      { error: "Endereço de entrega é obrigatório para pedidos de entrega." },
      { status: 400 }
    );
  }

  // ── Validate and resolve items from DB ────────────────────────────────────────
  type ResolvedItem = { menuItemId: string; name: string; price: number; quantity: number; note?: string };
  let resolvedItems: ResolvedItem[] = [];
  let subtotal = 0;

  if (items && items.length > 0) {
    const menuItems = await prisma.menuItem.findMany({
      where: {
        id:       { in: items.map((i) => i.menuItemId) },
        isActive: true,
        category: { restaurantId },
      },
      select: { id: true, name: true, price: true },
    });

    if (menuItems.length !== items.length) {
      const foundIds = new Set(menuItems.map((m) => m.id));
      const missing  = items.find((i) => !foundIds.has(i.menuItemId));
      return NextResponse.json(
        { error: `Produto não encontrado ou inativo: ${missing?.menuItemId ?? ""}` },
        { status: 400 }
      );
    }

    const priceMap = new Map(menuItems.map((m) => [m.id, m]));
    resolvedItems = items.map((i) => {
      const m = priceMap.get(i.menuItemId)!;
      return { menuItemId: m.id, name: m.name, price: Number(m.price), quantity: i.quantity, note: i.note };
    });
    subtotal = resolvedItems.reduce((s, i) => s + i.price * i.quantity, 0);
  } else if (total != null) {
    // Legacy: single dummy item
    subtotal = Math.max(0, total - deliveryFee);
    resolvedItems = [];
  } else {
    return NextResponse.json({ error: "Informe os itens do pedido ou o valor total." }, { status: 400 });
  }

  // ── Server-side delivery authorization (same engine as /api/orders/delivery-quote) ──
  // Direct API callers must not be able to create a DELIVERY order to an
  // address the delivery config blocks. No enabled-check divergence — matches
  // public /pedido route behavior exactly.
  if (type === "DELIVERY" && deliveryAddress) {
    if (!Number.isFinite(deliveryFee) || deliveryFee < 0) {
      return NextResponse.json(
        { error: "Taxa de entrega inválida." },
        { status: 400 }
      );
    }

    const [restaurant, deliveryCfg] = await Promise.all([
      prisma.restaurant.findUnique({
        where:  { id: restaurantId },
        select: {
          storeProfile: {
            select: {
              latitude: true, longitude: true,
              cep: true, street: true, streetNumber: true,
              neighborhood: true, city: true, state: true,
            },
          },
        },
      }),
      prisma.deliveryConfig.findUnique({
        where:  { restaurantId },
        // No enabled field — same as public /pedido route
        select: {
          mode: true, fee: true, freeDeliveryAbove: true,
          distanceBaseFee: true, distancePricePerKm: true,
          distanceMinFee: true, distanceMinFeeKm: true, distanceMaxKm: true, distanceMaxFee: true,
        },
      }),
    ]);

    if (deliveryCfg) {
      let restaurantCoords: LatLng | null = null;
      const sp = restaurant?.storeProfile;
      if (sp?.latitude != null && sp?.longitude != null) {
        restaurantCoords = { lat: Number(sp.latitude), lng: Number(sp.longitude) };
      } else if (deliveryCfg.mode === "distance" && sp?.city) {
        const coords = await geocodeAddress({
          cep:          sp.cep          ?? undefined,
          street:       sp.street       ?? undefined,
          number:       sp.streetNumber ?? undefined,
          neighborhood: sp.neighborhood ?? undefined,
          city:         sp.city         ?? undefined,
          state:        sp.state        ?? undefined,
        });
        if (coords) restaurantCoords = coords;
      }

      const quote = await resolveDeliveryFee({
        mode:         deliveryCfg.mode,
        deliveryType: "delivery",
        subtotal,
        address: {
          cep:          deliveryAddress.cep,
          street:       deliveryAddress.street,
          number:       deliveryAddress.number,
          neighborhood: deliveryAddress.neighborhood,
          city:         deliveryAddress.city,
          state:        deliveryAddress.state,
        },
        restaurantCoords,
        deliveryConfig: {
          fee:                deliveryCfg.fee               != null ? Number(deliveryCfg.fee)                : null,
          freeDeliveryAbove:  deliveryCfg.freeDeliveryAbove != null ? Number(deliveryCfg.freeDeliveryAbove)  : null,
          distanceBaseFee:    deliveryCfg.distanceBaseFee   != null ? Number(deliveryCfg.distanceBaseFee)    : null,
          distancePricePerKm: deliveryCfg.distancePricePerKm != null ? Number(deliveryCfg.distancePricePerKm) : null,
          distanceMinFee:     deliveryCfg.distanceMinFee    != null ? Number(deliveryCfg.distanceMinFee)     : null,
          distanceMinFeeKm:   deliveryCfg.distanceMinFeeKm  != null ? Number(deliveryCfg.distanceMinFeeKm)   : null,
          distanceMaxKm:      deliveryCfg.distanceMaxKm     != null ? Number(deliveryCfg.distanceMaxKm)      : null,
          distanceMaxFee:     deliveryCfg.distanceMaxFee    != null ? Number(deliveryCfg.distanceMaxFee)     : null,
        },
      });

      if (isQuoteStatusBlocked(quote.calculationStatus)) {
        return NextResponse.json(
          {
            error:  "Endereço fora da área de entrega ou entrega não autorizada. Escolha Retirada ou informe outro endereço.",
            reason: quote.reason,
            calculationStatus: quote.calculationStatus,
          },
          { status: 422 }
        );
      }
    }
  }

  const discount   = Math.max(0, discountAmount ?? 0);
  const orderTotal = Math.max(0, subtotal + deliveryFee - discount);
  const phone      = customerPhone?.trim() || `GUEST-${randomUUID()}`;
  const isGuest    = phone.startsWith("GUEST-");

  const order = await prisma.$transaction(async (tx) => {
    // Find or create customer
    let customer = await tx.customer.findFirst({
      where:  { restaurantId, phone },
      select: { id: true },
    });

    if (!customer) {
      customer = await tx.customer.create({
        data:   { restaurantId, name: customerName, phone, isGuest },
        select: { id: true },
      });
    } else {
      await tx.customer.update({
        where: { id: customer.id },
        data:  { name: customerName },
      });
    }

    // Create delivery address record if provided
    let deliveryAddressId: string | null = null;
    if (type === "DELIVERY" && deliveryAddress) {
      const addr = await tx.address.create({
        data: {
          customerId:   customer.id,
          zipCode:      deliveryAddress.cep,
          street:       deliveryAddress.street,
          number:       deliveryAddress.number,
          complement:   deliveryAddress.complement || null,
          neighborhood: deliveryAddress.neighborhood,
          city:         deliveryAddress.city,
          state:        deliveryAddress.state,
          label:        "Pedido manual",
          isDefault:    false,
        },
        select: { id: true },
      });
      deliveryAddressId = addr.id;
    }

    const orderNumber = await assignOrderNumber(tx, restaurantId);

    const created = await tx.order.create({
      data: {
        restaurantId,
        customerId:       customer.id,
        orderNumber,
        status:           "CONFIRMED",
        type:             type === "DELIVERY" ? "DELIVERY" : "PICKUP",
        subtotal:         new Decimal(subtotal),
        deliveryFee:      new Decimal(deliveryFee),
        discount:         new Decimal(discount),
        total:            new Decimal(orderTotal),
        notes:            notes || null,
        deliveryAddressId: deliveryAddressId ?? undefined,
        source,
        items: resolvedItems.length > 0
          ? {
              create: resolvedItems.map((i) => ({
                menuItemId: i.menuItemId,
                name:       i.name,
                price:      new Decimal(i.price),
                quantity:   i.quantity,
                total:      new Decimal(i.price * i.quantity),
                notes:      i.note || null,
              })),
            }
          : {
              // Legacy single-line item
              create: {
                name:     notes?.trim() || "Pedido manual",
                price:    new Decimal(subtotal),
                quantity: 1,
                total:    new Decimal(subtotal),
              },
            },
      },
      select: { id: true, status: true, total: true, orderNumber: true },
    });

    // Payment record
    await tx.payment.create({
      data: {
        orderId:     created.id,
        method:      paymentMethod,
        status:      paymentStatus === "PAID" ? "PAID" : "PAY_ON_DELIVERY",
        amount:      new Decimal(orderTotal),
        paymentMode: type === "DELIVERY"
          ? (paymentStatus === "PAID" ? "PAY_NOW" : "PAY_ON_DELIVERY")
          : (paymentStatus === "PAID" ? "PAY_NOW" : "PAY_ON_PICKUP"),
        paidAt: paymentStatus === "PAID" ? new Date() : null,
      },
    });

    return created;
  });

  const displayNumber = formatOrderNumber(order.orderNumber, order.id);

  // Log a system event in the conversation timeline (best-effort, non-blocking)
  if (conversationId) {
    ConversationLogService.logMessage({
      conversationId,
      restaurantId,
      senderType: "SYSTEM",
      content:    `Pedido ${displayNumber} criado pelo operador`,
    }).catch(() => {});
  }

  return NextResponse.json({ success: true, orderId: order.id, orderNumber: order.orderNumber, displayNumber });
}
