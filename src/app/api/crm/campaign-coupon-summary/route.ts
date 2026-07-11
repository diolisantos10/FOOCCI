/**
 * GET /api/crm/campaign-coupon-summary
 *
 * Per-campaign coupon counts for the authenticated restaurant, keyed by campaignId:
 *   { [campaignId]: { sent, used } }
 *   sent = coupons the campaign granted to customers' wallets (CustomerCoupon.sourceCampaignId)
 *   used = coupons redeemed (CustomerCoupon.status === "USED")
 *
 * Read-only, tenant-scoped, one grouped query. Feeds the "Cupons enviados" /
 * "Cupons usados" columns of the active campaigns table. Numbers come straight from
 * the CustomerCoupon wallet — never invented on the front.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, unauthorized, serverError } from "@/lib/api-response";
import { CustomerCouponService } from "@/services/crm/CustomerCouponService";

// Auth'd, tenant-scoped route that reads request headers — always dynamic.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const counts = await CustomerCouponService.countByCampaign(ctx.restaurantId);
    return ok(counts);
  } catch (err) {
    console.error("[GET /api/crm/campaign-coupon-summary]", err);
    return serverError();
  }
}
