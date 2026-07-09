/**
 * POST /api/crm/ready-made/[id] — activate / deactivate / update a ready-made campaign.
 *
 * Body: { action: "activate" | "deactivate" | "update", overrides?: ReadyMadeOverrides }
 *
 * Activation only creates/enables a campaign the normal runner will execute under the
 * global safety budget — no message is sent from here. Requires OWNER or MANAGER.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, badRequest, forbidden, unauthorized, serverError } from "@/lib/api-response";
import { ReadyMadeCampaignService } from "@/services/crm/ReadyMadeCampaignService";
import type { ReadyMadeOverrides } from "@/services/crm/readyMadeCampaigns";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();
  if (!["OWNER", "MANAGER"].includes(ctx.role)) return forbidden();

  try {
    const body = (await req.json().catch(() => ({}))) as {
      action?:    "activate" | "deactivate" | "update";
      overrides?: ReadyMadeOverrides;
    };

    const overrides = body.overrides ?? {};

    if (body.action === "activate") {
      const r = await ReadyMadeCampaignService.activate(ctx.restaurantId, params.id);
      return r.ok ? ok(r) : badRequest(r.error);
    }
    if (body.action === "deactivate") {
      const r = await ReadyMadeCampaignService.deactivate(ctx.restaurantId, params.id);
      return r.ok ? ok(r) : badRequest(r.error);
    }
    if (body.action === "update") {
      const r = await ReadyMadeCampaignService.update(ctx.restaurantId, params.id, overrides);
      return r.ok ? ok(r) : badRequest(r.error);
    }
    return badRequest("action inválida (use activate | deactivate | update).");
  } catch (err) {
    console.error("[POST /api/crm/ready-made/[id]]", err);
    return serverError();
  }
}
