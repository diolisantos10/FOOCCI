/**
 * GET /api/admin/meta/diag — admin-only Meta WhatsApp inbound diagnostics.
 *
 * For each stored Meta config, reports (masked) the WABA/phone ids and queries the
 * Graph API live for: which apps are subscribed to the WABA (subscribed_apps) and the
 * phone number's status. Used to diagnose "connects + sends but inbound never arrives"
 * — almost always the WABA is not subscribed to OUR app. Read-only.
 */

import { NextRequest } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { ok, unauthorized, serverError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { MetaConfigService } from "@/services/whatsapp/MetaConfigService";
import { metaGraphUrl } from "@/services/whatsapp/metaFlag";
import { MetaAppCredentialsService } from "@/services/meta/MetaAppCredentialsService";

function mask(v: string | null): string {
  if (!v) return "—";
  return v.length <= 4 ? "••••" : `••••${v.slice(-4)}`;
}

async function graph(path: string, token: string): Promise<unknown> {
  try {
    const res = await fetch(metaGraphUrl(path), { headers: { Authorization: `Bearer ${token}` } });
    return await res.json().catch(() => ({ parseError: true }));
  } catch (e) {
    return { fetchError: e instanceof Error ? e.message : String(e) };
  }
}

export async function GET(req: NextRequest) {
  if (!checkAdminRequest(req)) return unauthorized();
  try {
    const rows = await prisma.metaWhatsAppConfig.findMany({ select: { restaurantId: true } });
    const ourAppId = (await MetaAppCredentialsService.getResolved()).appId;
    const out = [];

    for (const row of rows) {
      const cfg = await MetaConfigService.getResolved(row.restaurantId);
      if (!cfg) continue;

      // Runtime routing flags: which provider actually sends (bot replies + manual) and
      // whether CRM campaigns route through Meta. A CONNECTED Meta number still won't
      // reply if the restaurant's provider is EVOLUTION.
      const rest = await prisma.restaurant.findUnique({
        where:  { id: row.restaurantId },
        select: { whatsappProvider: true },
      });
      const cfgRow = await prisma.metaWhatsAppConfig.findUnique({
        where:  { restaurantId: row.restaurantId },
        select: { metaCrmEnabled: true, coexistence: true },
      });

      const subscribed = await graph(`${cfg.wabaId}/subscribed_apps`, cfg.accessToken);
      const phone      = await graph(`${cfg.phoneNumberId}?fields=display_phone_number,verified_name,code_verification_status,quality_rating,platform_type,throughput,webhook_configuration`, cfg.accessToken);
      const wabaInfo   = await graph(`${cfg.wabaId}?fields=id,name,timezone_id,message_template_namespace`, cfg.accessToken);
      // All phone numbers still attached to this WABA — lets us see if a "freed" number is
      // in fact still held here (which blocks re-registering it on the WhatsApp Business app).
      const wabaPhones = await graph(`${cfg.wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,platform_type,account_mode,code_verification_status,name_status`, cfg.accessToken);
      // Approved templates gate business-initiated (outside-24h) CRM sends. Summarize by status.
      const templatesRaw = await graph(`${cfg.wabaId}/message_templates?fields=name,status,category,language&limit=200`, cfg.accessToken);
      const tData = (templatesRaw as { data?: Array<{ name?: string; status?: string; category?: string }> })?.data ?? [];
      const templatesByStatus: Record<string, number> = {};
      for (const t of tData) { const s = t.status ?? "UNKNOWN"; templatesByStatus[s] = (templatesByStatus[s] ?? 0) + 1; }
      const approvedTemplates = tData.filter((t) => t.status === "APPROVED").map((t) => ({ name: t.name, category: t.category }));

      // Does subscribed_apps include OUR app id?
      const subApps = (subscribed as { data?: Array<{ whatsapp_business_api_data?: { id?: string; name?: string } }> })?.data ?? [];
      const ourAppSubscribed = subApps.some((a) => a?.whatsapp_business_api_data?.id === ourAppId);

      out.push({
        restaurantId:      row.restaurantId,
        connectionStatus:  cfg.connectionStatus,
        whatsappProvider:  rest?.whatsappProvider ?? null,
        metaCrmEnabled:    cfgRow?.metaCrmEnabled ?? false,
        coexistence:       cfgRow?.coexistence ?? false,
        wabaId_masked:     mask(cfg.wabaId),
        phoneNumberId_masked: mask(cfg.phoneNumberId),
        displayPhoneNumber: cfg.displayPhoneNumber,
        ourAppId,
        ourAppSubscribed,
        subscribedAppIds:  subApps.map((a) => ({ id: a?.whatsapp_business_api_data?.id, name: a?.whatsapp_business_api_data?.name })),
        subscribedRaw:     subscribed,
        phone,
        wabaInfo,
        wabaPhones,
        templatesByStatus,
        approvedTemplateCount: approvedTemplates.length,
        approvedTemplates,
      });
    }

    return ok({ count: out.length, configs: out });
  } catch (err) {
    console.error("[GET /api/admin/meta/diag]", err);
    return serverError();
  }
}
