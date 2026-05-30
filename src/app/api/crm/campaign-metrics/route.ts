/**
 * GET /api/crm/campaign-metrics
 *
 * Campaign + coupon performance for the authenticated restaurant.
 * Read-only. Tenant-scoped — never leaks data across restaurants.
 *
 * Query params:
 *   period — 7d | 30d | 90d | all  (default: 30d)
 *
 * Coupon metrics are reliable (Order.promotionId / couponCode attribution).
 * Campaign coupon-revenue is unavailable (no campaign↔coupon link); the
 * response surfaces assisted post-send attribution and flags the limitation.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, unauthorized, serverError } from "@/lib/api-response";
import {
  CampaignCouponMetricsService,
  type MetricsPeriod,
} from "@/services/crm/CampaignCouponMetricsService";

const ALLOWED_PERIODS: MetricsPeriod[] = ["7d", "30d", "90d", "all"];

export async function GET(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const raw = req.nextUrl.searchParams.get("period") ?? "30d";
    const period: MetricsPeriod = ALLOWED_PERIODS.includes(raw as MetricsPeriod)
      ? (raw as MetricsPeriod)
      : "30d";

    const metrics = await CampaignCouponMetricsService.getMetrics(ctx.restaurantId, period);
    return ok(metrics);
  } catch (err) {
    console.error("[GET /api/crm/campaign-metrics]", err);
    return serverError();
  }
}
