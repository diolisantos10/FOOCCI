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
    return NextResponse.json({ ok: true, repeatOrder, repeatItems });
  } catch (err) {
    console.error("[GET /api/pedido/[slug]/repeat-order]", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
