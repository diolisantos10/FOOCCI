/**
 * Centralized menu-promotion resolver.
 *
 * Fetches ACTIVE PRODUCT and CATEGORY promotions from the existing Promotion model
 * and resolves the effective promotional price for individual menu items.
 *
 * Priority: product-level > category-level (no stacking).
 * Category-level promotions support PERCENTAGE only (MVP).
 *
 * Used by:
 *   - /pedido/[slug]/page.tsx        (DELIVERY channel)
 *   - /qr/[slug]/page.tsx            (QR_MENU channel)
 *   - /api/pedido/[slug]/finalize    (server-side price guard)
 */

import { prisma } from "@/lib/prisma";

export type PromoChannel = "DELIVERY" | "QR_MENU";

export type ActiveMenuPromotion = {
  id: string;
  target: "PRODUCT" | "CATEGORY";
  type: "PERCENTAGE" | "FIXED";
  discountValue: number;
  targetProductIds: string[];
  targetCategoryIds: string[];
  channel: string;
};

/** Legacy alias kept for existing imports. */
export type ActiveProductPromotion = ActiveMenuPromotion;

export type ResolvedPromotion = {
  promotionId: string;
  source: "PRODUCT" | "CATEGORY";
  originalPrice: number;
  promotionalPrice: number;
  discountAmount: number;
  discountPercent: number;
  badgeText: string;
};

/** Fetch all currently-valid PRODUCT + CATEGORY promotions for a restaurant + channel. */
export async function getActiveMenuPromotions(
  restaurantId: string,
  channel: PromoChannel,
): Promise<ActiveMenuPromotion[]> {
  const now = new Date();
  const todayDow = now.getDay();

  const rows = await prisma.promotion.findMany({
    where: {
      restaurantId,
      status: "ACTIVE",
      target: { in: ["PRODUCT", "CATEGORY"] },
      type: { in: ["PERCENTAGE", "FIXED"] },
      channel: { in: [channel, "ALL"] },
      OR: [{ startsAt: null }, { startsAt: { lte: now } }],
      AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }],
    },
    select: {
      id: true,
      target: true,
      type: true,
      discountValue: true,
      targetProductIds: true,
      targetCategoryIds: true,
      channel: true,
      daysOfWeek: true,
    },
  });

  return rows
    .filter((p) => p.daysOfWeek.length === 0 || p.daysOfWeek.includes(todayDow))
    .map((p) => ({
      id: p.id,
      target: p.target as "PRODUCT" | "CATEGORY",
      type: p.type as "PERCENTAGE" | "FIXED",
      discountValue: Number(p.discountValue),
      targetProductIds: p.targetProductIds,
      targetCategoryIds: p.targetCategoryIds,
      channel: p.channel,
    }));
}

/** Legacy compat — delegates to getActiveMenuPromotions. */
export async function getActiveProductPromotions(
  restaurantId: string,
  channel: PromoChannel,
): Promise<ActiveMenuPromotion[]> {
  return getActiveMenuPromotions(restaurantId, channel);
}

function applyDiscount(
  originalPrice: number,
  type: "PERCENTAGE" | "FIXED",
  discountValue: number,
): number | null {
  let p: number;
  if (type === "PERCENTAGE") {
    p = Math.max(0, originalPrice - (originalPrice * discountValue) / 100);
  } else {
    p = Math.max(0, originalPrice - discountValue);
  }
  p = Math.round(p * 100) / 100;
  return p >= originalPrice ? null : p;
}

function toResolved(
  promo: ActiveMenuPromotion,
  originalPrice: number,
  promotionalPrice: number,
): ResolvedPromotion {
  const discountAmount  = Math.round((originalPrice - promotionalPrice) * 100) / 100;
  const discountPercent = Math.max(1, Math.round((discountAmount / originalPrice) * 100));
  return {
    promotionId:      promo.id,
    source:           promo.target as "PRODUCT" | "CATEGORY",
    originalPrice,
    promotionalPrice,
    discountAmount,
    discountPercent,
    badgeText: `${discountPercent}% OFF`,
  };
}

/**
 * Resolve the effective promotion for a menu item.
 * Product-level beats category-level. No stacking.
 */
export function resolveMenuItemPromotion(
  itemId: string,
  categoryId: string,
  originalPrice: number,
  promotions: ActiveMenuPromotion[],
): ResolvedPromotion | null {
  // 1. Product-level promotion takes priority
  const productPromo = promotions.find(
    (p) => p.target === "PRODUCT" && p.targetProductIds.includes(itemId),
  );
  if (productPromo) {
    const pp = applyDiscount(originalPrice, productPromo.type, productPromo.discountValue);
    if (pp !== null) return toResolved(productPromo, originalPrice, pp);
  }

  // 2. Category-level fallback (only if categoryId is non-empty)
  if (categoryId) {
    const catPromo = promotions.find(
      (p) => p.target === "CATEGORY" && p.targetCategoryIds.includes(categoryId),
    );
    if (catPromo) {
      const pp = applyDiscount(originalPrice, catPromo.type, catPromo.discountValue);
      if (pp !== null) return toResolved(catPromo, originalPrice, pp);
    }
  }

  return null;
}

/**
 * Legacy compat — resolves without categoryId (no category-promo fallback).
 * All callers have been updated to resolveMenuItemPromotion; kept for safety.
 */
export function resolveProductPromotion(
  itemId: string,
  originalPrice: number,
  promotions: ActiveMenuPromotion[],
): ResolvedPromotion | null {
  return resolveMenuItemPromotion(itemId, "", originalPrice, promotions);
}

/**
 * Build a productId → ResolvedPromotion map.
 * Items must include their home categoryId for category-promotion lookup.
 * First occurrence of each itemId wins — deduplicates placed items.
 */
export function buildPromotionMap(
  items: Array<{ id: string; categoryId: string; price: number }>,
  promotions: ActiveMenuPromotion[],
): Map<string, ResolvedPromotion> {
  const map = new Map<string, ResolvedPromotion>();
  for (const item of items) {
    if (map.has(item.id)) continue;
    const resolved = resolveMenuItemPromotion(item.id, item.categoryId, item.price, promotions);
    if (resolved) map.set(item.id, resolved);
  }
  return map;
}
