import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { ok, unauthorized, serverError } from "@/lib/api-response";

/**
 * GET /api/pricing/history — latest price/cost audit entries (Bloco Automação).
 */
export async function GET(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const logs = await prisma.priceChangeLog.findMany({
      where: { restaurantId: ctx.restaurantId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return ok(
      logs.map((log) => ({
        id: log.id,
        menuItemId: log.menuItemId,
        itemName: log.itemName,
        oldPrice: log.oldPrice === null ? null : Number(log.oldPrice),
        newPrice: log.newPrice === null ? null : Number(log.newPrice),
        oldCost: log.oldCost === null ? null : Number(log.oldCost),
        newCost: log.newCost === null ? null : Number(log.newCost),
        source: log.source,
        createdAt: log.createdAt.toISOString(),
      }))
    );
  } catch (err) {
    console.error("[GET /api/pricing/history]", err);
    return serverError();
  }
}
