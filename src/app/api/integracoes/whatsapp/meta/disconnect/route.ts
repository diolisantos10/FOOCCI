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

    // Antes, desconectar a Meta gravava `whatsappProvider = "EVOLUTION"` para o
    // restaurante "continuar enviando pela conexão anterior". Depois da extração
    // não existe conexão anterior: isso escreveria um provedor que não existe e
    // deixaria a loja MUDA sem dizer. Desconectar agora é o que o nome diz —
    // remover a conexão — e a resposta admite que não sobrou canal nenhum.
    return ok({ disconnected: true, connectedChannel: null });
  } catch (err) {
    console.error("[POST meta/disconnect]", err);
    return serverError();
  }
}
