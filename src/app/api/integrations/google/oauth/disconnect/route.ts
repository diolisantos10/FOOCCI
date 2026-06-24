/**
 * POST /api/integrations/google/oauth/disconnect
 *
 * Wipes the stored Google tokens + selections for the restaurant. OWNER/MANAGER
 * only. History (the config row) is preserved; the connection is simply cleared.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, unauthorized, forbidden, serverError } from "@/lib/api-response";
import { disconnectGoogle } from "@/services/google/GoogleConfigService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();
  if (ctx.role !== "OWNER" && ctx.role !== "MANAGER") return forbidden();

  try {
    await disconnectGoogle(ctx.restaurantId);
    return ok({ disconnected: true });
  } catch (e) {
    console.error("[google/disconnect]", e);
    return serverError();
  }
}
