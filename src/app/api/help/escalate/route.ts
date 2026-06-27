/**
 * POST /api/help/escalate
 * "Falar com a FOOD" — last resort. Flips the active thread to HUMAN mode so the
 * Foocci team takes over from the admin support inbox. Tenant-scoped.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, unauthorized, serverError } from "@/lib/api-response";
import { HelpThreadService } from "@/services/help/HelpThreadService";

export async function POST(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const result = await HelpThreadService.escalate(ctx.restaurantId, ctx.userId);
    if (!result.ok) return serverError(result.error);

    return ok(result.data);
  } catch (err) {
    console.error("[POST /api/help/escalate]", err);
    return serverError();
  }
}
