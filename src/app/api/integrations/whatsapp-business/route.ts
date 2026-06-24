/**
 * GET /api/integrations/whatsapp-business — status view for the official Meta
 * WhatsApp Cloud API integration, shaped like the generic IntegrationView so the
 * Integrações grid renders it uniformly (status badge, last check, error).
 *
 * Read-only. The actual connect/test/CRM-toggle actions live under
 * /api/integracoes/whatsapp/meta/*. This route ONLY reports status.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, unauthorized, serverError } from "@/lib/api-response";
import { MetaConfigService } from "@/services/whatsapp/MetaConfigService";
import { isMetaWhatsAppEnabled } from "@/services/whatsapp/metaFlag";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const meta = await MetaConfigService.getPublic(ctx.restaurantId);

    // No config row yet → not configured.
    if (!meta) {
      return ok({
        provider:     "whatsapp-business",
        status:       "unconfigured",
        isActive:     false,
        lastTestedAt: null,
        lastError:    isMetaWhatsAppEnabled() ? null : "Integração Meta ainda não habilitada pela Foocci.",
        fields:       {},
      });
    }

    // Map Meta connectionStatus → generic IntegrationStatus.
    const status =
      meta.connectionStatus === "CONNECTED" ? "active"
      : meta.connectionStatus === "ERROR"   ? "error"
      : meta.connectionStatus === "PENDING" ? "pending_validation"
      :                                       "configured";

    return ok({
      provider:     "whatsapp-business",
      status,
      isActive:     meta.connected,
      lastTestedAt: meta.lastHealthCheckAt,
      lastError:    meta.lastError,
      fields: {
        displayPhoneNumber: meta.displayPhoneNumber,
        qualityRating:      meta.qualityRating,
        metaCrmEnabled:     meta.metaCrmEnabled ? "true" : "false",
      },
    });
  } catch (err) {
    console.error("[GET /api/integrations/whatsapp-business]", err);
    return serverError();
  }
}
