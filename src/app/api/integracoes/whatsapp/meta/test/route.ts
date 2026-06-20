/**
 * POST /api/integracoes/whatsapp/meta/test — SAFE Meta connection test.
 *
 * Sends a test message ONLY to the restaurant's own phone or a configured internal
 * test phone (META_TEST_PHONE) — NEVER to an arbitrary customer number. Uses the
 * Meta provider directly so it can be tested before switching the active provider.
 *
 * OWNER/MANAGER only.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, badRequest, unauthorized, forbidden, serverError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { isMetaWhatsAppEnabled } from "@/services/whatsapp/metaFlag";
import { WhatsAppMessagingService } from "@/services/whatsapp/WhatsAppMessagingService";
import { normalizePhoneForEvolution } from "@/lib/crm/normalizePhone";

export async function POST(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();
  if (!["OWNER", "MANAGER"].includes(ctx.role)) return forbidden();
  if (!isMetaWhatsAppEnabled()) return badRequest("Integração Meta desativada.");

  try {
    const body = (await req.json().catch(() => ({}))) as { to?: string; text?: string };

    const restaurant = await prisma.restaurant.findUnique({ where: { id: ctx.restaurantId }, select: { phone: true } });
    const allowed = new Set(
      [restaurant?.phone, process.env.META_TEST_PHONE]
        .map((p) => normalizePhoneForEvolution(p ?? ""))
        .filter((p): p is string => !!p),
    );

    const to = body.to ?? restaurant?.phone ?? "";
    const toNorm = normalizePhoneForEvolution(to);
    if (!toNorm || !allowed.has(toNorm)) {
      return badRequest("Por segurança, o teste só pode ser enviado para o telefone do restaurante ou para o número de teste interno (META_TEST_PHONE).");
    }

    // Direct Meta provider — independent of the active provider selection.
    const result = await WhatsAppMessagingService.providers.meta.sendText({
      restaurantId: ctx.restaurantId,
      to:           toNorm,
      text:         body.text?.slice(0, 300) || "Teste de conexão Foocci · WhatsApp Meta ✅",
    });

    return ok(result); // SendResult is already masked/safe
  } catch (err) {
    console.error("[POST meta/test]", err);
    return serverError();
  }
}
