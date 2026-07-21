/**
 * GET /api/pedido/[slug]/repeat-order?customerId=...
 *
 * Returns the identified customer's most recent repeatable order, validated
 * against the live menu. Public endpoint (like the rest of /api/pedido), but
 * the customerId is verified to belong to the restaurant to prevent
 * cross-tenant leakage. Read-only — never creates an order.
 *
 * Response:
 *   { ok: true,  repeatOrder: RepeatOrderPayload | null }
 *   { ok: false, error: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRepeatableOrder, getRepeatableItemsForCustomer } from "@/services/order/RepeatOrderService";
import { PEDIDO_ITEM_SELECT, mapPedidoItem } from "@/services/menu/pedidoMenuItem";
import { channelPrice } from "@/services/menu/MenuPricingService";
import { getActiveMenuPromotions, buildPromotionMap } from "@/services/promotions/productPromotionResolver";

export async function GET(
  req:    NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;

    const restaurant = await prisma.restaurant.findUnique({
      where:  { slug },
      select: { id: true },
    });
    if (!restaurant) {
      return NextResponse.json({ ok: false, error: "Restaurant not found" }, { status: 404 });
    }

    const customerId = req.nextUrl.searchParams.get("customerId")?.trim();
    const phone = req.nextUrl.searchParams.get("phone")?.trim();
    if (!customerId && !phone) {
      // No identity → no repeat order/items (never invent one).
      return NextResponse.json({ ok: true, repeatOrder: null, repeatItems: [] });
    }

    // Verify the customer belongs to this restaurant (when an id is provided).
    let verifiedCustomerId: string | undefined;
    if (customerId) {
      const customer = await prisma.customer.findFirst({
        where:  { id: customerId, restaurantId: restaurant.id },
        select: { id: true },
      });
      if (!customer) {
        return NextResponse.json({ ok: true, repeatOrder: null, repeatItems: [] });
      }
      verifiedCustomerId = customer.id;
    }

    const [repeatOrder, repeatItems] = await Promise.all([
      verifiedCustomerId ? getRepeatableOrder(restaurant.id, verifiedCustomerId) : Promise.resolve(null),
      getRepeatableItemsForCustomer({ restaurantId: restaurant.id, customerId: verifiedCustomerId, phone }),
    ]);

    // Full menu-item objects for every repeatable id, resolved INDEPENDENTLY of the
    // item's home-category visibility, so the client renders each "Comprar novamente"
    // card (detail sheet, add-to-cart) exactly like a normal product — even when the
    // item's home category is hidden from the delivery menu. Mirrors the SSR pool in
    // /pedido/[slug]/page.tsx so both population paths behave identically.
    const repeatIds = [...new Set([
      ...(repeatOrder?.items ?? []).map((i) => i.menuItemId),
      ...repeatItems.map((i) => i.menuItemId),
    ].filter((id): id is string => !!id))];

    let repeatMenuItems: ReturnType<typeof mapPedidoItem>[] = [];
    if (repeatIds.length > 0) {
      const [rows, activePromotions] = await Promise.all([
        prisma.menuItem.findMany({
          where: {
            id: { in: repeatIds },
            isActive: true, isAvailable: true, showInDelivery: true,
            category: { restaurantId: restaurant.id },
          },
          select: { ...PEDIDO_ITEM_SELECT, categoryId: true },
        }),
        getActiveMenuPromotions(restaurant.id, "DELIVERY"),
      ]);
      const promoMap = buildPromotionMap(
        rows.map((i) => ({ id: i.id, categoryId: i.categoryId, price: channelPrice(i, "DELIVERY") })),
        activePromotions,
      );
      repeatMenuItems = rows.map((i) => mapPedidoItem(i, promoMap.get(i.id) ?? null));
    }

    return NextResponse.json({ ok: true, repeatOrder, repeatItems, repeatMenuItems });
  } catch (err) {
    console.error("[GET /api/pedido/[slug]/repeat-order]", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
