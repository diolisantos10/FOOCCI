/**
 * GET /api/integracoes/whatsapp/meta/status — tenant-scoped Meta WhatsApp status
 * (masked). Read-only. Used by the Integrações → WhatsApp UI.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, unauthorized, serverError } from "@/lib/api-response";
import { MetaConfigService } from "@/services/whatsapp/MetaConfigService";
import { isMetaWhatsAppEnabled } from "@/services/whatsapp/metaFlag";

export async function GET(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();
  try {
    const meta = await MetaConfigService.getPublic(ctx.restaurantId);
    return ok({
      featureEnabled: isMetaWhatsAppEnabled(),
      // Provedor ÚNICO desde 04/08/2026. A coluna `Restaurant.whatsappProvider`
      // ainda existe no banco com valores antigos, mas não decide mais nada — ler
      // dali daria ao painel uma resposta que o envio não obedece.
      activeProvider: "META_CLOUD_API" as const,
      meta,
    });
  } catch (err) {
    console.error("[GET meta/status]", err);
    return serverError();
  }
}
