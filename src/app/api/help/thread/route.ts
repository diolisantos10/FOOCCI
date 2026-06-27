/**
 * GET /api/help/thread
 * Returns the lojista's active help thread + full message history,
 * creating one on first use. Tenant-scoped.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, unauthorized, serverError } from "@/lib/api-response";
import { HelpThreadService } from "@/services/help/HelpThreadService";

export async function GET(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const result = await HelpThreadService.loadActiveThread(
      ctx.restaurantId,
      ctx.userId,
    );
    if (!result.ok) return serverError(result.error);

    return ok(result.data);
  } catch (err) {
    console.error("[GET /api/help/thread]", err);
    return serverError();
  }
}
