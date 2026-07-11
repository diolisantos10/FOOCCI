/**
 * GET /api/v1/produtos — PUBLIC menu/catalog feed (scope: products:read).
 *
 * The restaurant's own cardápio: items, categories and prices. Low sensitivity.
 * Scoped to the key's restaurant via the item's category.
 *
 *   Authorization: Bearer fck_xxxxxxxx
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiScope, jsonError, jsonOk, V1_MAX_ROWS } from "@/lib/api-v1";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireApiScope(req, "products:read");
    if (auth instanceof NextResponse) return auth;

    // MenuItem has no restaurantId of its own — it is scoped through its category.
    const rows = await prisma.menuItem.findMany({
      where:   { category: { restaurantId: auth.restaurantId } },
      orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }],
      take:    V1_MAX_ROWS + 1,
      select: {
        id: true, name: true, price: true, priceDelivery: true, priceDineIn: true,
        code: true, isActive: true, isAvailable: true,
        category: { select: { id: true, name: true } },
      },
    });

    const truncated = rows.length > V1_MAX_ROWS;
    const page = truncated ? rows.slice(0, V1_MAX_ROWS) : rows;

    const data = page.map((p) => ({
      id:            p.id,
      nome:          p.name,
      categoria:     p.category?.name ?? null,
      categoriaId:   p.category?.id ?? null,
      preco:         Number(p.price),
      precoDelivery: p.priceDelivery != null ? Number(p.priceDelivery) : null,
      precoSalao:    p.priceDineIn != null ? Number(p.priceDineIn) : null,
      codigo:        p.code ?? null,
      ativo:         p.isActive,
      disponivel:    p.isAvailable,
    }));

    return jsonOk({ data, meta: { count: data.length, limit: V1_MAX_ROWS, truncated } });
  } catch (err) {
    console.error("[GET /api/v1/produtos]", err);
    return jsonError(500, "Erro interno ao consultar produtos.");
  }
}
