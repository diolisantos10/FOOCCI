/**
 * GET /api/qr/[slug]
 *
 * Public endpoint — no authentication required.
 * Returns the dine-in menu for a restaurant identified by its slug.
 *
 * Filtering:
 *   - Only categories where isActive = true
 *   - Only items where isActive = true AND showInDineIn = true
 *   - isAvailable is included in the response so the UI can render
 *     "Indisponível" badges — items are NOT hidden, just flagged.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { channelPrice } from "@/services/menu/MenuPricingService";

export async function GET(
  _req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const restaurant = await prisma.restaurant.findUnique({
    where: { slug: params.slug },
    select: { id: true, name: true, logoUrl: true },
  });

  if (!restaurant) {
    return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
  }

  const categories = await prisma.menuCategory.findMany({
    where: { restaurantId: restaurant.id, isActive: true },
    orderBy: { sortOrder: "asc" },
    include: {
      items: {
        // Dine-in channel: show all showInDineIn items regardless of isAvailable
        // (isAvailable=false items appear with an "Indisponível" badge)
        where: { isActive: true, showInDineIn: true },
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          name: true,
          description: true,
          price: true,
          priceDelivery: true,
          priceDineIn: true,
          priceIfood: true,
          imageUrl: true,
          isAvailable: true,
        },
      },
    },
  });

  // Strip empty categories (all items hidden)
  const visibleCategories = categories
    .filter((c) => c.items.length > 0)
    .map((c) => ({
      id: c.id,
      name: c.name,
      imageUrl: c.imageUrl ?? null,
      items: c.items.map((i) => ({
        id: i.id,
        name: i.name,
        description: i.description ?? null,
        // QR is the dine-in / salão channel.
        price: channelPrice(i, "DINE_IN"),
        imageUrl: i.imageUrl ?? null,
        isAvailable: i.isAvailable,
      })),
    }));

  return NextResponse.json({
    restaurant: {
      name: restaurant.name,
      logoUrl: restaurant.logoUrl ?? null,
    },
    categories: visibleCategories,
  });
}
