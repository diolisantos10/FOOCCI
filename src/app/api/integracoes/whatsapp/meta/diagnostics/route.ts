/**
 * GET /api/integracoes/whatsapp/meta/diagnostics — provider/migration safety view.
 * Read-only, masked. OWNER/MANAGER only.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, unauthorized, forbidden, serverError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { isMetaWhatsAppEnabled, metaWebhookVerifyToken, metaAppSecret, metaAppId, metaConfigId, META_GRAPH_VERSION } from "@/services/whatsapp/metaFlag";
import { MetaConfigService } from "@/services/whatsapp/MetaConfigService";
import { WhatsAppMessagingService } from "@/services/whatsapp/WhatsAppMessagingService";

export async function GET(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();
  if (!["OWNER", "MANAGER"].includes(ctx.role)) return forbidden();

  try {
    const rid = ctx.restaurantId;
    const waConv = { restaurantId: rid, channel: "WHATSAPP" as const };

    const [restaurant, metaPublic, evoStatus, lastInbound, lastOutbound, templateRequiredFailures, approvedTemplates] = await Promise.all([
      prisma.restaurant.findUnique({ where: { id: rid }, select: { whatsappProvider: true, allowWhatsAppProviderFallback: true, fallbackProvider: true } }),
      MetaConfigService.getPublic(rid),
      WhatsAppMessagingService.providers.evolution.getConnectionStatus(rid),
      prisma.message.findFirst({ where: { direction: "INBOUND",  conversation: waConv }, orderBy: { sentAt: "desc" }, select: { sentAt: true } }),
      prisma.message.findFirst({ where: { direction: "OUTBOUND", conversation: waConv }, orderBy: { sentAt: "desc" }, select: { sentAt: true, externalStatus: true } }),
      prisma.message.count({ where: { conversation: waConv, providerError: { contains: "TEMPLATE_REQUIRED" } } }),
      prisma.metaMessageTemplate.count({ where: { restaurantId: rid, status: "APPROVED" } }),
    ]);

    return ok({
      activeProvider:    restaurant?.whatsappProvider ?? "EVOLUTION",
      featureEnabled:    isMetaWhatsAppEnabled(),
      fallback:          { enabled: !!restaurant?.allowWhatsAppProviderFallback, provider: restaurant?.fallbackProvider ?? "EVOLUTION" },
      evolution:         { connected: evoStatus.connected, detail: evoStatus.detail },
      meta: {
        connected:         metaPublic?.connected ?? false,
        connectionStatus:  metaPublic?.connectionStatus ?? "NOT_CONNECTED",
        phoneNumberMapped: !!metaPublic?.phoneNumberId,
        displayPhoneNumber: metaPublic?.displayPhoneNumber ?? null,
        qualityRating:     metaPublic?.qualityRating ?? null,
        lastHealthCheckAt: metaPublic?.lastHealthCheckAt ?? null,
        lastError:         metaPublic?.lastError ?? null,
        tokenPreview:      metaPublic?.tokenPreview ?? null,
      },
      webhookConfigured:  !!metaWebhookVerifyToken() && !!metaAppSecret(),
      // Env readiness for activation — booleans only, never secret values. Use this
      // to confirm which Meta vars are set. NEXT_PUBLIC_* are baked at BUILD time, so
      // the browser needs a fresh deploy after they change (this reflects runtime env).
      env: {
        featureEnabled:     isMetaWhatsAppEnabled(),
        appId:              !!metaAppId(),
        appSecret:          !!metaAppSecret(),
        configId:           !!metaConfigId(),
        webhookVerifyToken: !!metaWebhookVerifyToken(),
        testPhone:          !!process.env.META_TEST_PHONE,
        graphVersion:       META_GRAPH_VERSION,
        publicAppId:        !!process.env.NEXT_PUBLIC_META_APP_ID,
        publicConfigId:     !!process.env.NEXT_PUBLIC_META_CONFIG_ID,
        signatureEnforced:  !!metaAppSecret(), // inbound POST is signature-checked only when set
      },
      approvedTemplates,
      templateRequiredFailures,
      lastInboundAt:      lastInbound?.sentAt?.toISOString() ?? null,
      lastOutboundAt:     lastOutbound?.sentAt?.toISOString() ?? null,
      lastOutboundStatus: lastOutbound?.externalStatus ?? null,
    });
  } catch (err) {
    console.error("[GET meta/diagnostics]", err);
    return serverError();
  }
}
