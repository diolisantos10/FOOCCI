/**
 * POST /api/integracoes/whatsapp/meta/simulate — SAFE inbound-webhook simulation.
 *
 * Builds a representative Meta webhook payload for THIS restaurant's connected
 * phone_number_id and runs it through the exact same normalizer the live webhook
 * uses, then reports how it would route (restaurant match, Brain dispatch). It does
 * NOT persist a message and does NOT call Meta — zero side effects, no customer
 * message. Use it to verify the inbound pipeline without a real WhatsApp.
 *
 * OWNER/MANAGER only, flag-gated.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, badRequest, unauthorized, forbidden, conflict, serverError } from "@/lib/api-response";
import { isMetaWhatsAppEnabled } from "@/services/whatsapp/metaFlag";
import { MetaConfigService } from "@/services/whatsapp/MetaConfigService";
import { normalizeMetaWebhook } from "@/services/whatsapp/providers/metaWebhook";
import { isWhatsAppBrainEnabled } from "@/services/whatsapp/brain/WhatsAppBrainRuntimeService";

export async function POST(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();
  if (!["OWNER", "MANAGER"].includes(ctx.role)) return forbidden();
  if (!isMetaWhatsAppEnabled()) return badRequest("Integração Meta desativada (META_WHATSAPP_ENABLED).");

  try {
    const body = (await req.json().catch(() => ({}))) as { fromPhone?: string; text?: string };
    const meta = await MetaConfigService.getPublic(ctx.restaurantId);
    if (!meta?.phoneNumberId) {
      return conflict("Conecte o WhatsApp oficial da Meta antes de simular o webhook.");
    }

    const fromPhone = (body.fromPhone ?? "5511999999999").replace(/\D/g, "");
    const text      = (body.text ?? "Olá, vocês estão abertos?").slice(0, 300);
    const wamid     = `wamid.SIMULATED_${Date.now()}`;

    // Same envelope Meta posts to the live webhook (object=whatsapp_business_account).
    const payload = {
      object: "whatsapp_business_account",
      entry: [{
        changes: [{
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: { phone_number_id: meta.phoneNumberId, display_phone_number: meta.displayPhoneNumber ?? "" },
            contacts: [{ wa_id: fromPhone, profile: { name: "Cliente (simulado)" } }],
            messages: [{ from: fromPhone, id: wamid, timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: text } }],
          },
        }],
      }],
    };

    const norm = normalizeMetaWebhook(payload);
    const mapped = norm.messages[0] ?? null;

    return ok({
      simulatedOnly: true,
      persisted:     false,
      sentToMeta:    false,
      normalized: {
        phoneNumberIds: norm.phoneNumberIds,
        message: mapped && {
          providerMessageId: mapped.providerMessageId,
          fromPhone:         mapped.fromPhone,
          text:              mapped.text,
          type:              mapped.type,
        },
      },
      routing: {
        restaurantMatched: !!mapped && mapped.phoneNumberId === meta.phoneNumberId,
        wouldDispatchBrain: isWhatsAppBrainEnabled() && mapped?.type === "text" && !!mapped?.text,
        replyProvider: "META_CLOUD_API",
      },
    });
  } catch (err) {
    console.error("[POST meta/simulate]", err);
    return serverError();
  }
}
