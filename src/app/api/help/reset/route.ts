/**
 * POST /api/help/reset
 * Closes the lojista's current help thread and starts a fresh AI conversation
 * (the "back to the assistant / start over" action). Tenant-scoped.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, unauthorized, serverError } from "@/lib/api-response";
import { HelpThreadService } from "@/services/help/HelpThreadService";

export async function POST(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const result = await HelpThreadService.resetThread(
      ctx.restaurantId,
      ctx.userId,
    );
    if (!result.ok) return serverError(result.error);

    return ok(result.data);
  } catch (err) {
    console.error("[POST /api/help/reset]", err);
    return serverError();
  }
}
