/**
 * CustomerCouponService — the customer coupon wallet (iFood-style).
 *
 * CRM campaigns GRANT coupons into a customer's wallet (instead of writing a code
 * into the message). Coupons accumulate, may expire, and are redeemed later in the
 * cart. This service owns granting + listing; redemption in the cart is Phase B.
 *
 * A coupon is a Promotion with a couponCode. A wallet entry (CustomerCoupon) links
 * one customer to one such promotion, with its own expiry and status.
 */

import { prisma } from "@/lib/prisma";

const DEFAULT_VALIDITY_DAYS = 30;

/**
 * Computes when a granted coupon expires. Priority:
 *   1. promotion.couponValidityDays → grantedAt + N days
 *   2. promotion.endsAt (absolute window end)
 *   3. default 30 days from grant
 * Pure — no DB.
 */
export function computeCouponExpiry(
  grantedAt: Date,
  promotion: { couponValidityDays?: number | null; endsAt?: Date | null },
): Date {
  if (typeof promotion.couponValidityDays === "number" && promotion.couponValidityDays > 0) {
    return new Date(grantedAt.getTime() + promotion.couponValidityDays * 86_400_000);
  }
  if (promotion.endsAt) return new Date(promotion.endsAt);
  return new Date(grantedAt.getTime() + DEFAULT_VALIDITY_DAYS * 86_400_000);
}

export type GrantResult =
  | { granted: true; couponId: string; expiresAt: Date }
  | { granted: false; reason: "NO_PROMOTION" | "ALREADY_HAS" };

export class CustomerCouponService {
  /**
   * Credit a coupon into a customer's wallet. Idempotent per active coupon: if the
   * customer already holds an ACTIVE, non-expired entry for this code, it is not
   * duplicated. Returns why it was skipped otherwise. Never throws for a missing
   * promotion — just reports it (so a send is never broken by a coupon issue).
   */
  static async grant(input: {
    restaurantId: string;
    customerId: string;
    couponCode: string;
    sourceCampaignId?: string | null;
    now?: Date;
  }): Promise<GrantResult> {
    const code = (input.couponCode ?? "").trim();
    if (!code) return { granted: false, reason: "NO_PROMOTION" };
    const now = input.now ?? new Date();

    const promotion = await prisma.promotion.findFirst({
      where:  { restaurantId: input.restaurantId, couponCode: { equals: code, mode: "insensitive" }, status: "ACTIVE" },
      select: { id: true, couponValidityDays: true, endsAt: true },
    });
    if (!promotion) return { granted: false, reason: "NO_PROMOTION" };

    // Already holds this coupon active and unexpired → don't duplicate.
    const existing = await prisma.customerCoupon.findFirst({
      where: {
        customerId: input.customerId,
        couponCode: { equals: code, mode: "insensitive" },
        status:     "ACTIVE",
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: { id: true },
    });
    if (existing) return { granted: false, reason: "ALREADY_HAS" };

    const expiresAt = computeCouponExpiry(now, promotion);
    const created = await prisma.customerCoupon.create({
      data: {
        restaurantId:     input.restaurantId,
        customerId:       input.customerId,
        promotionId:      promotion.id,
        couponCode:       code.toUpperCase(),
        status:           "ACTIVE",
        grantedAt:        now,
        expiresAt,
        sourceCampaignId: input.sourceCampaignId ?? null,
      },
      select: { id: true },
    });
    return { granted: true, couponId: created.id, expiresAt };
  }

  /**
   * Active, non-expired coupons a customer can use right now (for the cart).
   * Expired ACTIVE rows are filtered out here; a cleanup job can flip their status.
   */
  static async listActive(restaurantId: string, customerId: string, now: Date = new Date()) {
    const rows = await prisma.customerCoupon.findMany({
      where: {
        restaurantId,
        customerId,
        status: "ACTIVE",
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: { grantedAt: "desc" },
      select: {
        id: true, couponCode: true, expiresAt: true, grantedAt: true,
        promotion: { select: { name: true, type: true, discountValue: true } },
      },
    });
    return rows.map((r) => ({
      id:         r.id,
      code:       r.couponCode,
      name:       r.promotion.name,
      type:       r.promotion.type,
      discount:   Number(r.promotion.discountValue),
      expiresAt:  r.expiresAt,
      grantedAt:  r.grantedAt,
    }));
  }
}
