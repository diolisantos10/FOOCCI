/**
 * GET /api/crm/ready-made — the ready-made campaign catalog with live per-restaurant
 * on/off state. Read-only; nothing is sent.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, unauthorized, serverError } from "@/lib/api-response";
import { ReadyMadeCampaignService } from "@/services/crm/ReadyMadeCampaignService";

export async function GET(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();
  try {
    const [states, metaCrmActive] = await Promise.all([
      ReadyMadeCampaignService.getStates(ctx.restaurantId),
      ReadyMadeCampaignService.isMetaConnected(ctx.restaurantId),
    ]);
    return ok({ campaigns: states, metaCrmActive });
  } catch (err) {
    console.error("[GET /api/crm/ready-made]", err);
    return serverError();
  }
}
