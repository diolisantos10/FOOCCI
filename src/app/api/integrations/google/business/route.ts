/**
 * Google Meu Negócio (Business Profile) — location listing + selection.
 *
 *   GET  → list the locations the connected Google account manages + current pick
 *   POST → select the location to associate with this restaurant { name, accountName, title }
 *
 * OWNER/MANAGER only.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, badRequest, unauthorized, forbidden, serverError } from "@/lib/api-response";
import { getValidAccessToken } from "@/services/google/googleOAuth";
import { getGoogleConfig, setBusinessLocation, recordError } from "@/services/google/GoogleConfigService";
import { listLocations } from "@/services/google/googleBusinessProfile";

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

    const locations = await listLocations(token);
    return ok({
      locations,
      selected: row.businessLocationId
        ? { name: row.businessLocationId, accountName: row.businessAccountId, title: row.businessLocationName }
        : null,
    });
  } catch (e) {
    console.error("[GET google/business]", e);
    await recordError(ctx.restaurantId, e instanceof Error ? e.message : "list_locations_failed");
    return serverError();
  }
}

export async function POST(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();
  if (ctx.role !== "OWNER" && ctx.role !== "MANAGER") return forbidden();

  try {
    const body = (await req.json().catch(() => ({}))) as {
      name?: string; accountName?: string; title?: string;
    };
    if (!body.name) {
      // Empty name clears the selection.
      await setBusinessLocation(ctx.restaurantId, null, null, null);
      return ok({ cleared: true });
    }
    await setBusinessLocation(
      ctx.restaurantId,
      body.accountName ?? null,
      body.name,
      body.title ?? body.name,
    );
    return ok({ selected: { name: body.name, title: body.title ?? body.name } });
  } catch (e) {
    console.error("[POST google/business]", e);
    return serverError();
  }
}
