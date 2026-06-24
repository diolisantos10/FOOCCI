/**
 * Google Analytics (GA4) — property listing + selection.
 *
 *   GET  → list the GA4 properties the connected account can read + current pick
 *   POST → select the GA4 property for this restaurant { property, displayName }
 *
 * OWNER/MANAGER only.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, badRequest, unauthorized, forbidden, serverError } from "@/lib/api-response";
import { getValidAccessToken } from "@/services/google/googleOAuth";
import { getGoogleConfig, setGa4Property, recordError } from "@/services/google/GoogleConfigService";
import { listGa4Properties } from "@/services/google/googleAnalytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();
  if (ctx.role !== "OWNER" && ctx.role !== "MANAGER") return forbidden();

  try {
    const row = await getGoogleConfig(ctx.restaurantId);
    if (!row?.connected) return badRequest("Conecte sua conta Google primeiro.");

    const token = await getValidAccessToken(ctx.restaurantId);
    if (!token) return badRequest("Não foi possível autenticar com o Google. Reconecte sua conta.");

    const properties = await listGa4Properties(token);
    return ok({
      properties,
      selected: row.ga4PropertyId
        ? { property: row.ga4PropertyId, displayName: row.ga4PropertyName }
        : null,
    });
  } catch (e) {
    console.error("[GET google/analytics]", e);
    await recordError(ctx.restaurantId, e instanceof Error ? e.message : "list_properties_failed");
    return serverError();
  }
}

export async function POST(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();
  if (ctx.role !== "OWNER" && ctx.role !== "MANAGER") return forbidden();

  try {
    const body = (await req.json().catch(() => ({}))) as { property?: string; displayName?: string };
    if (!body.property) {
      await setGa4Property(ctx.restaurantId, null, null);
      return ok({ cleared: true });
    }
    await setGa4Property(ctx.restaurantId, body.property, body.displayName ?? body.property);
    return ok({ selected: { property: body.property, displayName: body.displayName ?? body.property } });
  } catch (e) {
    console.error("[POST google/analytics]", e);
    return serverError();
  }
}
