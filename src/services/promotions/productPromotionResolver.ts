/**
 * Centralized product-promotion resolver.
 *
 * Fetches ACTIVE, PRODUCT-target promotions from the existing Promotion model
 * and resolves the effective promotional price for individual menu items.
 *
 * Used by:
 *   - /pedido/[slug]/page.tsx        (DELIVERY channel)
 *   - /qr/[slug]/page.tsx            (QR_MENU channel)
 *   - /api/pedido/[slug]/finalize    (server-side price guard)
 */

import { prisma } from "@/lib/prisma";

export type PromoChannel = "DELIVERY" | "QR_MENU";

export type ActiveProductPromotion = {
  id: string;
  type: "PERCENTAGE" | "FIXED";
  discountValue: number;
  targetProductIds: string[];
  channel: string;
};

export type ResolvedPromotion = {
  promotionId: string;
  originalPrice: number;
  promotionalPrice: number;
  discountAmount: number;
  discountPercent: number;
  badgeText: string; // e.g. "10% OFF"
};

/** Fetch all currently-valid product promotions for a restaurant + channel. */
export async function getActiveProductPromotions(
  restaurantId: string,
  channel: PromoChannel,
): Promise<ActiveProductPromotion[]> {
  const now = new Date();
  const todayDow = now.getDay(); // 0=Sun…6=Sat

  const rows = await prisma.promotion.findMany({
    where: {
      restaurantId,
      status: "ACTIVE",
      target: "PRODUCT",
      type: { in: ["PERCENTAGE", "FIXED"] },
      channel: { in: [channel, "ALL"] },
      OR: [{ startsAt: null }, { startsAt: { lte: now } }],
      AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }],
    },
    select: {
      id: true,
      type: true,
      discountValue: true,
      targetProductIds: true,
      channel: true,
      daysOfWeek: true,
    },
  });

  return rows
    .filter((p) => p.daysOfWeek.length === 0 || p.daysOfWeek.includes(todayDow))
    .map((p) => ({
      id: p.id,
      type: p.type as "PERCENTAGE" | "FIXED",
      discountValue: Number(p.discountValue),
      targetProductIds: p.targetProductIds,
      channel: p.channel,
    }));
}

/** Resolve effective promotion for a specific product. Returns null if no active promotion applies. */
export function resolveProductPromotion(
  itemId: string,
  originalPrice: number,
  promotions: ActiveProductPromotion[],
): ResolvedPromotion | null {
  const promo = promotions.find((p) => p.targetProductIds.includes(itemId));
  if (!promo) return null;

  let promotionalPrice: number;
  if (promo.type === "PERCENTAGE") {
    promotionalPrice = Math.max(0, originalPrice - (originalPrice * promo.discountValue) / 100);
  } else {
    // FIXED = fixed discount amount
    promotionalPrice = Math.max(0, originalPrice - promo.discountValue);
  }
  promotionalPrice = Math.round(promotionalPrice * 100) / 100;

  if (promotionalPrice >= originalPrice) return null; // no real discount

  const discountAmount  = Math.round((originalPrice - promotionalPrice) * 100) / 100;
  const discountPercent = Math.max(1, Math.round((discountAmount / originalPrice) * 100));

  return {
    promotionId:      promo.id,
    originalPrice,
    promotionalPrice,
    discountAmount,
    discountPercent,
    badgeText: `${discountPercent}% OFF`,
  };
}

/** Build a productId → ResolvedPromotion map for a list of items. */
export function buildPromotionMap(
  items: Array<{ id: string; price: number }>,
  promotions: ActiveProductPromotion[],
): Map<string, ResolvedPromotion> {
  const map = new Map<string, ResolvedPromotion>();
  for (const item of items) {
    const resolved = resolveProductPromotion(item.id, item.price, promotions);
    if (resolved) map.set(item.id, resolved);
  }
  return map;
}
