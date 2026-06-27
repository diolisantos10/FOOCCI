/**
 * GET /api/analytics/upsell-history?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Full upsell history (social proof): every item a customer added AFTER a Foocci
 * suggestion in the window. Read-only, tenant-scoped. Powers the dedicated
 * "Receita Incremental" tab in Analytics.
 *
 * Date handling MIRRORS /api/analytics/overview: `from` inclusive, `to`
 * end-of-day inclusive (advanced one day), parsed as America/Sao_Paulo midnight,
 * so this list matches the overview's upsell aggregate exactly.
 */
import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, unauthorized, serverError } from "@/lib/api-response";
import { AnalyticsService } from "@/services/analytics/AnalyticsService";

function parseDateBR(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y!, (m! - 1), d!, 3, 0, 0)); // midnight BRT = 03:00 UTC
}

export async function GET(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();

  const sp = req.nextUrl.searchParams;
  const fromP = sp.get("from");
  const toP   = sp.get("to");

  const from = fromP ? parseDateBR(fromP) : new Date("2000-01-01T00:00:00Z");
  const to   = toP   ? parseDateBR(toP)   : new Date();
  if (toP) to.setUTCDate(to.getUTCDate() + 1); // end-of-day inclusive

  try {
    const examples = await AnalyticsService.getUpsellExamples(ctx.restaurantId, from, to, 300);
    return ok({ examples });
  } catch (err) {
    console.error("[GET analytics/upsell-history]", err);
    return serverError();
  }
}
