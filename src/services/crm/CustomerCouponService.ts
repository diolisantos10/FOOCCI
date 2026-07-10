/**
 * CustomerCouponService — the customer coupon wallet (iFood-style).
 *
 * Coupons are defined directly in a campaign card (percentage or fixed amount) —
 * there is no separate Promoções area. On a successful send, the coupon is credited
 * to the customer's wallet (never written into the message). Coupons accumulate,
 * may expire, and are redeemed later in the cart (Phase B). This service owns
 * granting + listing.
 */

import { prisma } from "@/lib/prisma";
import type { CouponType } from "./readyMadeCampaigns";

const DEFAULT_VALIDITY_DAYS = 30;

/** When a granted coupon expires: grantedAt + validityDays (default 30). Pure. */
export function computeCouponExpiry(grantedAt: Date, validityDays?: number | null): Date {
  const days = typeof validityDays === "number" && validityDays > 0 ? validityDays : DEFAULT_VALIDITY_DAYS;
  return new Date(grantedAt.getTime() + days * 86_400_000);
}

/** Short reference label stored on the wallet entry (not typed by the customer). */
export function couponRefCode(coupon: { type: CouponType; value: number }): string {
  return coupon.type === "PERCENTAGE" ? `${coupon.value}OFF` : `R$${coupon.value}`;
}

export type GrantResult =
  | { granted: true; couponId: string; expiresAt: Date }
  | { granted: false; reason: "NO_COUPON" | "ALREADY_HAS" };

export class CustomerCouponService {
  /**
   * Credit a card-defined coupon into a customer's wallet. Idempotent per campaign:
   * if the customer already holds an ACTIVE coupon from this campaign, it is not
   * duplicated. Best-effort — never throws so a coupon issue can't break a send.
   */
  static async grant(input: {
    restaurantId: string;
    customerId: string;
    coupon: { type: CouponType; value: number };
    validityDays?: number | null;
    sourceCampaignId?: string | null;
    now?: Date;
  }): Promise<GrantResult> {
    const now = input.now ?? new Date();
    if (!input.coupon || !(input.coupon.value > 0)) return { granted: false, reason: "NO_COUPON" };

    // One coupon per campaign per customer (reprocess-safe).
    if (input.sourceCampaignId) {
      const existing = await prisma.customerCoupon.findFirst({
        where:  { customerId: input.customerId, sourceCampaignId: input.sourceCampaignId, status: "ACTIVE" },
        select: { id: true },
      });
      if (existing) return { granted: false, reason: "ALREADY_HAS" };
    }

    const expiresAt = computeCouponExpiry(now, input.validityDays);
    const created = await prisma.customerCoupon.create({
      data: {
        restaurantId:     input.restaurantId,
        customerId:       input.customerId,
        promotionId:      null,
        couponCode:       couponRefCode(input.coupon),
        discountType:     input.coupon.type,
        discountValue:    input.coupon.value,
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
   * Shaped from the self-contained discount fields.
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
        id: true, couponCode: true, discountType: true, discountValue: true,
        expiresAt: true, grantedAt: true,
      },
    });
    return rows.map((r) => ({
      id:            r.id,
      code:          r.couponCode,
      discountType:  r.discountType,
      discountValue: r.discountValue != null ? Number(r.discountValue) : 0,
      label:         r.discountType === "PERCENTAGE" ? `${Number(r.discountValue)}% OFF` : `R$ ${Number(r.discountValue)} OFF`,
      expiresAt:     r.expiresAt,
      grantedAt:     r.grantedAt,
    }));
  }
}
