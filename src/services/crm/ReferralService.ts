/**
 * ReferralService — "Indique um amigo".
 *
 * The mechanic: every customer has a personal link — the public menu URL with
 * ?ref=<customerId>. The menu stores the ref and sends it along when the visitor
 * finalizes their FIRST order. If it validates, a Referral row is created and
 * BOTH sides get the reward coupon in their wallet:
 *   - the referrer (who shared the link)
 *   - the referred friend (who just made their first order)
 *
 * Validation rules (all must hold):
 *   - referrer exists, belongs to the same restaurant, is not the buyer themself
 *   - the buyer has never been referred before (unique referredCustomerId)
 *   - this is the buyer's FIRST order (totalOrders ≤ 1 at processing time — the
 *     order being finalized is usually already counted)
 *
 * Reward: the "indique-amigo" campaign's configured coupon (scheduleConfig.coupon)
 * when the campaign row exists; otherwise a safe 10% default. Grants respect the
 * monthly coupon budget like every other grant. Best-effort by design: a referral
 * hiccup must NEVER break checkout.
 */

import { prisma } from "@/lib/prisma";
import { CustomerCouponService } from "./CustomerCouponService";
import { getSafetyConfig } from "@/lib/crm-safety";
import type { ReadyMadeCoupon } from "./readyMadeCampaigns";

export const REFERRAL_CAMPAIGN_ID = "indique-amigo";
const DEFAULT_REWARD: ReadyMadeCoupon = { type: "PERCENTAGE", value: 10, validityDays: 30 };

/** The customer's personal referral link (menu URL + ?ref=<id>). */
export function buildReferralLink(menuUrl: string, customerId: string): string {
  const sep = menuUrl.includes("?") ? "&" : "?";
  return `${menuUrl}${sep}ref=${encodeURIComponent(customerId)}`;
}

export interface ProcessReferralResult {
  ok:        boolean;
  created:   boolean;
  reason?:   string;
}

export class ReferralService {
  /**
   * Called after checkout finalization with the ref the menu captured.
   * Creates the referral + rewards both sides when everything validates.
   */
  static async processFirstOrderReferral(input: {
    restaurantId: string;
    customerId:   string; // the buyer (potentially referred)
    orderId:      string;
    referrerId:   string; // from the ?ref link
  }): Promise<ProcessReferralResult> {
    const { restaurantId, customerId, orderId, referrerId } = input;
    try {
      if (!referrerId || referrerId === customerId) {
        return { ok: true, created: false, reason: "self-or-empty" };
      }

      const [referrer, buyer, alreadyReferred] = await Promise.all([
        prisma.customer.findFirst({
          where:  { id: referrerId, restaurantId, isGuest: false },
          select: { id: true },
        }),
        prisma.customer.findFirst({
          where:  { id: customerId, restaurantId },
          select: { id: true, totalOrders: true },
        }),
        prisma.referral.findUnique({ where: { referredCustomerId: customerId }, select: { id: true } }),
      ]);

      if (!referrer)        return { ok: true, created: false, reason: "referrer-not-found" };
      if (!buyer)           return { ok: true, created: false, reason: "buyer-not-found" };
      if (alreadyReferred)  return { ok: true, created: false, reason: "already-referred" };
      // First order only — at this point the finalized order may already be counted.
      if ((buyer.totalOrders ?? 0) > 1) return { ok: true, created: false, reason: "not-first-order" };

      // Reward = the campaign's configured coupon (any non-terminal row), else default.
      const campaign = await prisma.campaign.findFirst({
        where:   { restaurantId, templateId: REFERRAL_CAMPAIGN_ID, status: { notIn: ["SENT", "COMPLETED", "CANCELLED"] as never[] } },
        orderBy: { createdAt: "desc" },
        select:  { id: true, scheduleConfig: true },
      });
      const coupon = ((campaign?.scheduleConfig as { coupon?: ReadyMadeCoupon | null } | null)?.coupon) ?? DEFAULT_REWARD;

      await prisma.referral.create({
        data: { restaurantId, referrerCustomerId: referrerId, referredCustomerId: customerId, orderId },
      });

      // Reward BOTH sides — best-effort, budget-respecting, never blocks checkout.
      const safety = await getSafetyConfig(restaurantId).catch(() => null);
      const grant = (toCustomerId: string) =>
        CustomerCouponService.grant({
          restaurantId,
          customerId:       toCustomerId,
          coupon,
          validityDays:     coupon.validityDays ?? null,
          sourceCampaignId: campaign?.id ?? null,
          monthlyBudget:    safety?.couponMonthlyBudget ?? 0,
          avgTicket:        safety?.couponAvgTicket ?? 50,
        }).catch((e) => console.warn(`[Referral] coupon grant failed for ${toCustomerId}:`, e));

      await Promise.all([grant(referrerId), grant(customerId)]);

      console.info(`[Referral] created — referrer ${referrerId} → new customer ${customerId}`, { restaurantId, orderId });
      return { ok: true, created: true };
    } catch (e) {
      console.warn("[Referral] processing failed (checkout unaffected)", e);
      return { ok: false, created: false, reason: e instanceof Error ? e.message : "unknown" };
    }
  }

  /** How many friends each referrer brought (for future stats/agent use). */
  static async countByReferrer(restaurantId: string, referrerCustomerId: string): Promise<number> {
    return prisma.referral.count({ where: { restaurantId, referrerCustomerId } });
  }
}
