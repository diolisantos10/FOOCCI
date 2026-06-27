/**
 * GET /api/analytics/upsell-history?from=ISO&to=ISO
 *
 * Full upsell history (social proof): every item a customer added AFTER a Foocci
 * suggestion in the window. Read-only, tenant-scoped. Powers the dedicated
 * "Receita Incremental" tab in Analytics.
 */
import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, unauthorized, serverError } from "@/lib/api-response";
import { AnalyticsService } from "@/services/analytics/AnalyticsService";

export async function GET(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();

  const sp = req.nextUrl.searchParams;
  const from = sp.get("from") ? new Date(sp.get("from")!) : new Date("2000-01-01");
  const to   = sp.get("to")   ? new Date(sp.get("to")!)   : new Date();

  try {
    const examples = await AnalyticsService.getUpsellExamples(ctx.restaurantId, from, to, 300);
    return ok({ examples });
  } catch (err) {
    console.error("[GET analytics/upsell-history]", err);
    return serverError();
  }
}
