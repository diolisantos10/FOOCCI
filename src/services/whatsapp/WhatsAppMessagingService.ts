/**
 * WhatsAppMessagingService — provider-agnostic WhatsApp send entry point.
 *
 * Resolves the provider per restaurant (default EVOLUTION). Meta is used ONLY when
 * META_WHATSAPP_ENABLED=true AND restaurant.whatsappProvider="META_CLOUD_API", so
 * existing restaurants are unaffected. For Meta, business-initiated sends outside
 * the 24h customer-service window are blocked with META_TEMPLATE_REQUIRED instead
 * of failing silently.
 *
 * Optional fallback (OFF by default): when the active provider FAILS (not BLOCKED)
 * and the restaurant enabled allowWhatsAppProviderFallback, the send is retried ONCE
 * via the configured fallbackProvider. A BLOCKED result (e.g. template required) is a
 * deliberate policy decision and never triggers fallback. Exactly one provider sends
 * per attempt — there is no double-send.
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

interface ProviderSettings {
  provider:         WhatsAppProviderId;
  allowFallback:    boolean;
  fallbackProvider: WhatsAppProviderId;
}

/** Active provider + (optional) fallback config for a restaurant. */
async function getProviderSettings(restaurantId: string): Promise<ProviderSettings> {
  if (!isMetaWhatsAppEnabled()) return { provider: "EVOLUTION", allowFallback: false, fallbackProvider: "EVOLUTION" };
  const r = await prisma.restaurant.findUnique({
    where:  { id: restaurantId },
    select: { whatsappProvider: true, allowWhatsAppProviderFallback: true, fallbackProvider: true },
  });
  return {
    provider:         selectProvider(true, r?.whatsappProvider),
    allowFallback:    !!r?.allowWhatsAppProviderFallback,
    fallbackProvider: r?.fallbackProvider === "META_CLOUD_API" ? "META_CLOUD_API" : "EVOLUTION",
  };
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

/**
 * Pure fallback decision. Retry on the fallback provider ONLY when the primary send
 * genuinely failed (never on a deliberate BLOCKED policy result), fallback is enabled,
 * and the fallback target differs from the primary — so there is never a double-send.
 */
export function shouldAttemptFallback(
  primary:  Pick<SendResult, "ok" | "status">,
  settings: { allowFallback: boolean; provider: WhatsAppProviderId; fallbackProvider: WhatsAppProviderId },
): boolean {
  if (primary.ok || primary.status === "BLOCKED") return false;
  return settings.allowFallback && settings.fallbackProvider !== settings.provider;
}

/** Sends a freeform text through ONE provider, applying Meta's 24h-window gate. */
async function sendVia(providerId: WhatsAppProviderId, input: SendTextInput): Promise<SendResult> {
  if (providerId !== "META_CLOUD_API") return evolution.sendText(input);
  const lastInboundAt = await getLastInboundAt(input.restaurantId, input.to);
  const decision = decideMetaSend({ phoneValid: toMetaRecipient(input.to) !== null, lastInboundAt, hasTemplate: false });
  if (!decision.allowed) {
    return {
      ok: false, provider: "META_CLOUD_API", status: "BLOCKED", providerMessageId: null,
      blockReason: decision.reason, error: decision.message,
    };
  }
  return meta.sendText(input);
}

export interface ConversationReplyInput {
  restaurantId:   string;
  conversationId: string;
  toPhone:        string;
  text:           string;
  senderType?:    string;                       // default "AI"
  metadata?:      Record<string, unknown>;
}

export const WhatsAppMessagingService = {
  resolveProviderId,

  async sendText(input: SendTextInput): Promise<SendResult> {
    const s = await getProviderSettings(input.restaurantId);
    const primary = await sendVia(s.provider, input);
    if (shouldAttemptFallback(primary, s)) return sendVia(s.fallbackProvider, input);
    return primary;
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

  /**
   * Provider-aware conversation reply: sends the text via the active provider and
   * persists the OUTBOUND message (+ bumps lastMessageAt). Used by the Meta reply
   * path so an inbound Meta message gets answered through Meta. The legacy Evolution
   * reply paths keep their own inline send/persist unchanged.
   */
  async sendConversationReply(input: ConversationReplyInput): Promise<SendResult> {
    const result = await this.sendText({ restaurantId: input.restaurantId, to: input.toPhone, text: input.text });
    const now = new Date();
    try {
      await prisma.$transaction([
        prisma.message.create({
          data: {
            conversationId:    input.conversationId,
            direction:         "OUTBOUND",
            senderType:        input.senderType ?? "AI",
            content:           input.text,
            type:              "TEXT",
            sentAt:            now,
            externalMessageId: result.providerMessageId, // keep legacy field populated
            externalStatus:    result.ok ? "sent" : "failed",
            provider:          result.provider,
            providerMessageId: result.providerMessageId,
            providerStatus:    result.ok ? "sent" : (result.status === "BLOCKED" ? "blocked" : "failed"),
            providerError:     result.ok ? null : (result.blockReason ?? result.error ?? null),
            ...(result.ok ? {} : { errorMessage: result.blockReason ?? result.error ?? null }),
            ...(input.metadata ? { metadata: input.metadata as object } : {}),
          },
        }),
        prisma.conversation.update({ where: { id: input.conversationId }, data: { lastMessageAt: now } }),
      ]);
    } catch (err) {
      console.error("[WhatsAppMessagingService.sendConversationReply] persist failed", err);
    }
    return result;
  },

  async getConnectionStatus(restaurantId: string, providerId?: WhatsAppProviderId): Promise<ConnectionStatus> {
    const id = providerId ?? await resolveProviderId(restaurantId);
    return (id === "META_CLOUD_API" ? meta : evolution).getConnectionStatus(restaurantId);
  },

  /** Direct provider handles (for the safe test/diagnostics endpoints). */
  providers: { evolution, meta },
};
