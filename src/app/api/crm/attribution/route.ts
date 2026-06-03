/**
 * GET /api/crm/attribution
 *
 * Campaign attribution view for the authenticated restaurant.
 * Combines campaign send metrics with coupon order data to show
 * attribution quality per campaign.
 *
 * Query params:
 *   period      — 7d | 30d | 90d | all  (default: 30d)
 *   campaignId  — filter to one campaign (optional)
 *   promotionId — filter to campaigns linked to this promotion (optional)
 *   couponCode  — filter to campaigns linked to this coupon code (optional)
 *
 * Read-only. Tenant-scoped.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, unauthorized, serverError } from "@/lib/api-response";
import {
  CampaignAttributionService,
  type AttributionPeriod,
} from "@/services/crm/CampaignAttributionService";

const ALLOWED_PERIODS: AttributionPeriod[] = ["7d", "30d", "90d", "all"];

export async function GET(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const sp = req.nextUrl.searchParams;

    const rawPeriod = sp.get("period") ?? "30d";
    const period: AttributionPeriod = ALLOWED_PERIODS.includes(rawPeriod as AttributionPeriod)
      ? (rawPeriod as AttributionPeriod)
      : "30d";

    const result = await CampaignAttributionService.getAttribution(
      ctx.restaurantId,
      period,
      {
        campaignId:  sp.get("campaignId")  ?? undefined,
        promotionId: sp.get("promotionId") ?? undefined,
        couponCode:  sp.get("couponCode")  ?? undefined,
      },
    );

    return ok(result);
  } catch (err) {
    console.error("[GET /api/crm/attribution]", err);
    return serverError();
  }
}
