/**
 * GET /api/integracoes/whatsapp/meta/status — tenant-scoped Meta WhatsApp status
 * (masked). Read-only. Used by the Integrações → WhatsApp UI.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, unauthorized, serverError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { MetaConfigService } from "@/services/whatsapp/MetaConfigService";
import { isMetaWhatsAppEnabled } from "@/services/whatsapp/metaFlag";

export async function GET(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();
  try {
    const [r, meta] = await Promise.all([
      prisma.restaurant.findUnique({ where: { id: ctx.restaurantId }, select: { whatsappProvider: true } }),
      MetaConfigService.getPublic(ctx.restaurantId),
    ]);
    return ok({
      featureEnabled: isMetaWhatsAppEnabled(),
      activeProvider: r?.whatsappProvider ?? "EVOLUTION",
      meta,
    });
  } catch (err) {
    console.error("[GET meta/status]", err);
    return serverError();
  }
}
