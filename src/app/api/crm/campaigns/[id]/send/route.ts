/**
 * POST /api/crm/campaigns/[id]/send
 *
 * Execute sending for an approved campaign.
 * Accepts optional message overrides (user may have edited messages in the review UI).
 * NEVER called automatically — requires explicit user action.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, badRequest, unauthorized, serverError } from "@/lib/api-response";
import { CrmCampaignService } from "@/services/crm/CrmCampaignService";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();

  try {
    const body = await req.json() as {
      messages?: Array<{ recipientId: string; messageText: string }>;
    };

    if (!params.id) return badRequest("Campaign ID é obrigatório");

    const result = await CrmCampaignService.send(
      params.id,
      ctx.restaurantId,
      { messages: body.messages ?? [] }
    );

    return ok(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro interno";
    console.error("[POST /api/crm/campaigns/[id]/send]", err);
    if (msg.includes("not found")) return ok({ error: "not_found" }, 404);
    if (msg.includes("already sent") || msg.includes("sending")) {
      return badRequest("Campanha já foi enviada ou está sendo enviada");
    }
    if (msg.includes("WhatsApp not configured")) {
      return ok({ error: "whatsapp_not_configured", message: msg }, 422);
    }
    return serverError();
  }
}
