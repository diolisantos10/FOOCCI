/**
 * Meta WhatsApp message templates — list / sync / map.
 *
 * GET  — list the restaurant's known templates (mirrored from Meta), with status and
 *        the CRM objective each is mapped to.
 * POST — { action: "sync" }  → pull templates + approval status from the Meta Graph API.
 *        { action: "map", templateName, languageCode?, mappedCampaignType } → link a
 *        template to a CRM objective so campaigns of that type auto-resolve it (pass
 *        mappedCampaignType: null to clear).
 *
 * Approved templates are REQUIRED to send CRM marketing via Meta (business-initiated
 * messages outside the 24h window). OWNER/MANAGER only. Meta-scoped; Evolution untouched.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, badRequest, unauthorized, forbidden, serverError } from "@/lib/api-response";
import { isMetaWhatsAppEnabled } from "@/services/whatsapp/metaFlag";
import { MetaTemplateService } from "@/services/whatsapp/MetaTemplateService";

export async function GET(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();
  if (!["OWNER", "MANAGER"].includes(ctx.role)) return forbidden();
  try {
    return ok({ templates: await MetaTemplateService.list(ctx.restaurantId) });
  } catch (err) {
    console.error("[GET meta/templates]", err);
    return serverError();
  }
}

export async function POST(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();
  if (!["OWNER", "MANAGER"].includes(ctx.role)) return forbidden();
  if (!isMetaWhatsAppEnabled()) return badRequest("Esta integração não está disponível no momento. Fale com o suporte Foocci.");

  try {
    const body = (await req.json().catch(() => ({}))) as {
      action?: string; templateName?: string; languageCode?: string; mappedCampaignType?: string | null;
    };

    if (body.action === "sync") {
      const result = await MetaTemplateService.syncFromMeta(ctx.restaurantId);
      if (!result.ok) return badRequest(result.error ?? "Não foi possível sincronizar os modelos.");
      return ok({ synced: result.synced, templates: await MetaTemplateService.list(ctx.restaurantId) });
    }

    if (body.action === "map") {
      if (!body.templateName) return badRequest("Informe o modelo a mapear.");
      const mapped = body.mappedCampaignType === null || typeof body.mappedCampaignType === "string"
        ? body.mappedCampaignType
        : null;
      await MetaTemplateService.setCampaignMapping(
        ctx.restaurantId, body.templateName, body.languageCode ?? "pt_BR", mapped,
      );
      return ok({ templates: await MetaTemplateService.list(ctx.restaurantId) });
    }

    return badRequest("Ação inválida. Use 'sync' ou 'map'.");
  } catch (err) {
    console.error("[POST meta/templates]", err);
    return serverError();
  }
}
