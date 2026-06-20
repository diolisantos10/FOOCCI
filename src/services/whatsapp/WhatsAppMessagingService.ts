/**
 * WhatsAppMessagingService — provider-agnostic WhatsApp send entry point.
 *
 * Resolves the provider per restaurant (default EVOLUTION). Meta is used ONLY when
 * META_WHATSAPP_ENABLED=true AND restaurant.whatsappProvider="META_CLOUD_API", so
 * existing restaurants are unaffected. For Meta, business-initiated sends outside
 * the 24h customer-service window are blocked with META_TEMPLATE_REQUIRED instead
 * of failing silently.
 *
 * This is additive: live Evolution send paths keep working whether or not they are
 * migrated to call this service.
 */

import { prisma } from "@/lib/prisma";
import type { WhatsAppProviderId, SendResult, SendTextInput, SendTemplateInput, ConnectionStatus } from "./providers/types";
import { EvolutionWhatsAppProvider } from "./providers/EvolutionWhatsAppProvider";
import { MetaWhatsAppCloudProvider } from "./providers/MetaWhatsAppCloudProvider";
import { isMetaWhatsAppEnabled } from "./metaFlag";
import { decideMetaSend } from "./metaSendPolicy";
import { toMetaRecipient } from "./providers/metaPayload";
import { normalizePhoneForEvolution } from "@/lib/crm/normalizePhone";

const evolution = new EvolutionWhatsAppProvider();
const meta      = new MetaWhatsAppCloudProvider();

/**
 * Pure provider selection. Meta is chosen ONLY when the feature flag is on AND the
 * restaurant explicitly selected it — otherwise EVOLUTION. Exactly one provider is
 * ever returned, so a single send never goes through both (no double-send).
 */
export function selectProvider(flagEnabled: boolean, restaurantProvider: string | null | undefined): WhatsAppProviderId {
  return flagEnabled && restaurantProvider === "META_CLOUD_API" ? "META_CLOUD_API" : "EVOLUTION";
}

/** Provider for a restaurant — EVOLUTION unless Meta is enabled AND selected. */
export async function resolveProviderId(restaurantId: string): Promise<WhatsAppProviderId> {
  if (!isMetaWhatsAppEnabled()) return "EVOLUTION";
  const r = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { whatsappProvider: true } });
  return selectProvider(true, r?.whatsappProvider);
}

/** Most recent INBOUND WhatsApp message time for this phone (for the 24h window). */
async function getLastInboundAt(restaurantId: string, rawPhone: string): Promise<Date | null> {
  const phone = normalizePhoneForEvolution(rawPhone);
  if (!phone) return null;
  const tail = phone.slice(-8); // match on the last 8 digits to tolerate DDI/9th-digit variance
  const msg = await prisma.message.findFirst({
    where: {
      direction: "INBOUND",
      conversation: {
        restaurantId,
        channel: "WHATSAPP",
        OR: [
          { customerPhone: { contains: tail } },
          { customer: { phone: { contains: tail } } },
        ],
      },
    },
    orderBy: { sentAt: "desc" },
    select:  { sentAt: true },
  });
  return msg?.sentAt ?? null;
}

export const WhatsAppMessagingService = {
  resolveProviderId,

  async sendText(input: SendTextInput): Promise<SendResult> {
    const providerId = await resolveProviderId(input.restaurantId);
    if (providerId !== "META_CLOUD_API") return evolution.sendText(input);

    // Meta: freeform only inside the 24h window; otherwise a template is required.
    const lastInboundAt = await getLastInboundAt(input.restaurantId, input.to);
    const decision = decideMetaSend({ phoneValid: toMetaRecipient(input.to) !== null, lastInboundAt, hasTemplate: false });
    if (!decision.allowed) {
      return {
        ok: false, provider: "META_CLOUD_API", status: "BLOCKED", providerMessageId: null,
        blockReason: decision.reason, error: decision.message,
      };
    }
    return meta.sendText(input);
  },

  async sendTemplate(input: SendTemplateInput): Promise<SendResult> {
    const providerId = await resolveProviderId(input.restaurantId);
    if (providerId === "META_CLOUD_API") return meta.sendTemplate(input);
    // Evolution has no template concept — fall back to a freeform render of the params.
    const text = input.bodyParams && input.bodyParams.length > 0
      ? input.bodyParams.join(" ")
      : input.templateName;
    return evolution.sendText({ restaurantId: input.restaurantId, to: input.to, text });
  },

  async getConnectionStatus(restaurantId: string, providerId?: WhatsAppProviderId): Promise<ConnectionStatus> {
    const id = providerId ?? await resolveProviderId(restaurantId);
    return (id === "META_CLOUD_API" ? meta : evolution).getConnectionStatus(restaurantId);
  },

  /** Direct provider handles (for the safe test/diagnostics endpoints). */
  providers: { evolution, meta },
};
