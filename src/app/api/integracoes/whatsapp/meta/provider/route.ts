/**
 * POST /api/integracoes/whatsapp/meta/provider — switch a restaurant's active
 * WhatsApp provider (EVOLUTION ⇄ META_CLOUD_API). Switching to Meta requires the
 * Meta connection to exist + an explicit { confirm: true }. Rollback to Evolution
 * is always allowed (no confirmation needed) so a restaurant can revert instantly.
 *
 * OWNER/MANAGER only. Does not send any message.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, badRequest, unauthorized, forbidden, conflict, serverError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { isMetaWhatsAppEnabled } from "@/services/whatsapp/metaFlag";
import { MetaConfigService } from "@/services/whatsapp/MetaConfigService";

export async function POST(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();
  if (!["OWNER", "MANAGER"].includes(ctx.role)) return forbidden();

  try {
    const body = (await req.json().catch(() => ({}))) as { provider?: string; confirm?: unknown };
    const provider = body.provider;
    if (provider !== "EVOLUTION" && provider !== "META_CLOUD_API") {
      return badRequest("provider deve ser EVOLUTION ou META_CLOUD_API.");
    }

    if (provider === "META_CLOUD_API") {
      if (!isMetaWhatsAppEnabled()) return badRequest("Integração Meta desativada (META_WHATSAPP_ENABLED).");
      if (body.confirm !== true) return badRequest("Confirmação explícita obrigatória ({ confirm: true }) para usar a Meta.");
      const meta = await MetaConfigService.getResolved(ctx.restaurantId);
      if (!meta || meta.connectionStatus !== "CONNECTED") {
        return conflict("Conecte e valide o WhatsApp oficial da Meta antes de usá-lo como provedor.");
      }
    }

    await prisma.restaurant.update({ where: { id: ctx.restaurantId }, data: { whatsappProvider: provider } });
    return ok({ activeProvider: provider });
  } catch (err) {
    console.error("[POST meta/provider]", err);
    return serverError();
  }
}
