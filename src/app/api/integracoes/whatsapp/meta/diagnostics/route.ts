/**
 * GET /api/integracoes/whatsapp/meta/diagnostics — provider/migration safety view.
 * Read-only, masked. OWNER/MANAGER only.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, unauthorized, forbidden, serverError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { isMetaWhatsAppEnabled, META_GRAPH_VERSION } from "@/services/whatsapp/metaFlag";
import { MetaAppCredentialsService } from "@/services/meta/MetaAppCredentialsService";
import { MetaConfigService } from "@/services/whatsapp/MetaConfigService";
import { WhatsAppMessagingService } from "@/services/whatsapp/WhatsAppMessagingService";

export async function GET(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();
  if (!["OWNER", "MANAGER"].includes(ctx.role)) return forbidden();

  try {
    const rid = ctx.restaurantId;
    const waConv = { restaurantId: rid, channel: "WHATSAPP" as const };

    // App-level credentials now resolve database-first, env second — the admin screen
    // can set them without a deploy, so reading process.env here would under-report.
    const appCreds = await MetaAppCredentialsService.getResolved();

    const [metaPublic, lastInbound, lastOutbound, templateRequiredFailures, approvedTemplates] = await Promise.all([
      MetaConfigService.getPublic(rid),
      prisma.message.findFirst({ where: { direction: "INBOUND",  conversation: waConv }, orderBy: { sentAt: "desc" }, select: { sentAt: true } }),
      prisma.message.findFirst({ where: { direction: "OUTBOUND", conversation: waConv }, orderBy: { sentAt: "desc" }, select: { sentAt: true, externalStatus: true } }),
      prisma.message.count({ where: { conversation: waConv, providerError: { contains: "TEMPLATE_REQUIRED" } } }),
      prisma.metaMessageTemplate.count({ where: { restaurantId: rid, status: "APPROVED" } }),
    ]);

    return ok({
      // Provedor único desde 04/08: a Evolution saiu do sistema. Os campos
      // `fallback` e `evolution` foram removidos desta resposta junto com ela —
      // manter um campo que sempre diz a mesma coisa é ruído que engana quem
      // diagnostica.
      activeProvider:    "META_CLOUD_API",
      featureEnabled:    isMetaWhatsAppEnabled(),
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
      webhookConfigured:  !!appCreds.webhookVerifyToken && !!appCreds.appSecret,
      // Readiness for activation — booleans only, never secret values. Reflects the
      // RESOLVED credentials (admin screen first, Railway env second), so a value saved
      // in the admin screen shows up here without a deploy. NEXT_PUBLIC_* are baked at
      // BUILD time, so the browser still needs a fresh deploy after those change.
      env: {
        featureEnabled:     isMetaWhatsAppEnabled(),
        appId:              !!appCreds.appId,
        appSecret:          !!appCreds.appSecret,
        configId:           !!appCreds.configId,
        webhookVerifyToken: !!appCreds.webhookVerifyToken,
        testPhone:          !!process.env.META_TEST_PHONE,
        graphVersion:       appCreds.graphVersion ?? META_GRAPH_VERSION,
        publicAppId:        !!process.env.NEXT_PUBLIC_META_APP_ID,
        publicConfigId:     !!process.env.NEXT_PUBLIC_META_CONFIG_ID,
        signatureEnforced:  !!appCreds.appSecret, // inbound POST is signature-checked only when set
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
