/**
 * GET /api/menu/items
 *
 * Returns a flat list of all active menu items for the authenticated restaurant.
 * Used by the manual order creation form in Pedidos to allow staff to search
 * and select real products with server-authoritative prices.
 *
 * Response: { success: true, data: MenuItem[] }
 */

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTenantContext } from "@/lib/tenant";
import { ok, unauthorized, serverError } from "@/lib/api-response";

export async function GET(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const items = await prisma.menuItem.findMany({
      where: {
        isActive: true,
        category: { restaurantId: ctx.restaurantId, isActive: true },
      },
      select: {
        id:    true,
        name:  true,
        price: true,
        category: { select: { name: true } },
      },
      orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }, { name: "asc" }],
    });

    return ok(
      items.map((i) => ({
        id:           i.id,
        name:         i.name,
        price:        Number(i.price),
        categoryName: i.category.name,
      }))
    );
  } catch (err) {
    console.error("[GET /api/menu/items]", err);
    return serverError();
  }
}
