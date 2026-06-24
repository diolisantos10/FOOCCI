/**
 * POST /api/integracoes/whatsapp/meta/crm-toggle
 *
 * Toggles metaCrmEnabled on the restaurant's MetaWhatsAppConfig.
 * When enabled, CRM campaigns (manual + scheduled) route through Meta Cloud API
 * instead of Evolution. Requires Meta to be connected (CONNECTED status).
 *
 * OWNER/MANAGER only.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, badRequest, unauthorized, forbidden, conflict, serverError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { MetaConfigService } from "@/services/whatsapp/MetaConfigService";

export async function POST(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();
  if (!["OWNER", "MANAGER"].includes(ctx.role)) return forbidden();

  try {
    const body = (await req.json().catch(() => ({}))) as { enabled?: unknown };
    const enabled = body.enabled === true || body.enabled === false ? (body.enabled as boolean) : null;
    if (enabled === null) return badRequest("Campo 'enabled' obrigatório (true | false).");

    if (enabled) {
      const meta = await MetaConfigService.getResolved(ctx.restaurantId);
      if (!meta || meta.connectionStatus !== "CONNECTED") {
        return conflict("Conecte o WhatsApp oficial da Meta antes de ativar o CRM via Meta.");
      }
    }

    await prisma.metaWhatsAppConfig.update({
      where: { restaurantId: ctx.restaurantId },
      data:  { metaCrmEnabled: enabled },
    });

    return ok({ metaCrmEnabled: enabled });
  } catch (err) {
    console.error("[POST meta/crm-toggle]", err);
    return serverError();
  }
}
