/**
 * POST /api/integracoes/whatsapp/meta/disconnect — remove the restaurant's Meta
 * WhatsApp connection so the owner can reconfigure from scratch (e.g. the wrong or
 * test number was connected). Deletes the stored config and, if Meta was the active
 * provider, reverts to the previous connection (EVOLUTION) so the restaurant is never
 * left without a working WhatsApp.
 *
 * OWNER/MANAGER only. Does not send any message.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, unauthorized, forbidden, serverError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { MetaConfigService } from "@/services/whatsapp/MetaConfigService";

export async function POST(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();
  if (!["OWNER", "MANAGER"].includes(ctx.role)) return forbidden();

  try {
    await MetaConfigService.remove(ctx.restaurantId);

    // If Meta was the active provider, fall back to the previous connection so the
    // restaurant keeps sending/receiving. Only touches the row when it points at Meta.
    const r = await prisma.restaurant.findUnique({
      where:  { id: ctx.restaurantId },
      select: { whatsappProvider: true },
    });
    if (r?.whatsappProvider === "META_CLOUD_API") {
      await prisma.restaurant.update({
        where: { id: ctx.restaurantId },
        data:  { whatsappProvider: "EVOLUTION" },
      });
    }

    return ok({ disconnected: true, activeProvider: "EVOLUTION" });
  } catch (err) {
    console.error("[POST meta/disconnect]", err);
    return serverError();
  }
}
