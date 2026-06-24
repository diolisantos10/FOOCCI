/**
 * GET /api/integrations/google/analytics/report?days=28
 *
 * Returns a compact GA4 snapshot (totals, top pages, daily series) for the
 * selected property via the GA4 Data API. OWNER/MANAGER only.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, badRequest, unauthorized, forbidden, serverError } from "@/lib/api-response";
import { getValidAccessToken } from "@/services/google/googleOAuth";
import { getGoogleConfig, recordSync, recordError } from "@/services/google/GoogleConfigService";
import { fetchSnapshot } from "@/services/google/googleAnalytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();
  if (ctx.role !== "OWNER" && ctx.role !== "MANAGER") return forbidden();

  try {
    const row = await getGoogleConfig(ctx.restaurantId);
    if (!row?.connected) return badRequest("Conecte sua conta Google primeiro.");
    if (!row.ga4PropertyId) return badRequest("Selecione uma propriedade do GA4 primeiro.");

    const token = await getValidAccessToken(ctx.restaurantId);
    if (!token) return badRequest("Não foi possível autenticar com o Google. Reconecte sua conta.");

    const daysRaw = Number(req.nextUrl.searchParams.get("days") ?? "28");
    const days = [7, 28, 90].includes(daysRaw) ? daysRaw : 28;

    const snapshot = await fetchSnapshot(token, row.ga4PropertyId, days);
    if (snapshot.ok) await recordSync(ctx.restaurantId);
    else await recordError(ctx.restaurantId, snapshot.error ?? "ga4_report_failed");
    return ok(snapshot);
  } catch (e) {
    console.error("[GET google/analytics/report]", e);
    await recordError(ctx.restaurantId, e instanceof Error ? e.message : "ga4_report_failed");
    return serverError();
  }
}
