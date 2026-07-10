/**
 * GET /api/crm/coupon-metrics — results of the coupon actions for the CRM Cupons tab.
 * Read-only aggregation of the customer coupon wallet.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, unauthorized, serverError } from "@/lib/api-response";
import { CouponMetricsService } from "@/services/crm/CouponMetricsService";

export async function GET(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();
  try {
    const metrics = await CouponMetricsService.getMetrics(ctx.restaurantId);
    return ok(metrics);
  } catch (err) {
    console.error("[GET /api/crm/coupon-metrics]", err);
    return serverError();
  }
}
