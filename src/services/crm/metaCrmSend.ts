/**
 * metaCrmSend — shared CRM→Meta send logic for both CRM send paths
 * (manual CrmCampaignService.send and the ScheduledCampaignRunner).
 *
 * WHY THIS EXISTS: business-initiated marketing to cold audiences (FRIO/MORNO — by
 * definition OUTSIDE the 24h customer-service window) is REJECTED by Meta as freeform
 * text. It MUST use an APPROVED message template. This resolves the campaign's template
 * (explicit override in audienceConfig.metaTemplate, else mapped by campaign objective),
 * fills its body params per-customer, and sends it.
 *
 * Fully additive: only reached when a restaurant has explicitly enabled Meta CRM. When
 * no approved template resolves, it falls back to the legacy freeform send so existing
 * behavior never regresses.
 */

import type { SendResult } from "@/services/whatsapp/providers/types";
import { MetaTemplateService } from "@/services/whatsapp/MetaTemplateService";

/** Minimal structural provider shape — satisfied by MetaWhatsAppCloudProvider. */
interface MetaTemplateProvider {
  sendText(input: { restaurantId: string; to: string; text: string }): Promise<SendResult>;
  sendTemplate(input: {
    restaurantId: string; to: string; templateName: string; language: string; bodyParams?: string[];
  }): Promise<SendResult>;
}

export interface MetaCrmCampaignRef {
  objective:       string | null;
  audienceConfig?: unknown; // may carry { metaTemplate: { name?, language?, params? } }
}

/** Explicit per-campaign template override, stored in audienceConfig.metaTemplate. */
interface CampaignMetaTemplate { name?: string; language?: string; params?: string[] }

function readExplicitTemplate(audienceConfig: unknown): CampaignMetaTemplate | null {
  if (!audienceConfig || typeof audienceConfig !== "object") return null;
  const mt = (audienceConfig as { metaTemplate?: unknown }).metaTemplate;
  if (!mt || typeof mt !== "object") return null;
  const o = mt as CampaignMetaTemplate;
  return {
    name:     typeof o.name === "string" ? o.name : undefined,
    language: typeof o.language === "string" ? o.language : undefined,
    params:   Array.isArray(o.params) ? o.params.map(String) : undefined,
  };
}

/** Resolves one template body param token. Supports {nome}/{firstName}; else literal. */
function resolveParamToken(token: string, firstName: string): string {
  return token
    .replace(/\{nome\}/gi, firstName)
    .replace(/\{first_?name\}/gi, firstName)
    .replace(/\{primeiro_nome\}/gi, firstName);
}

export interface ResolvedMetaTemplate { name: string; language: string; params: string[] }

/**
 * Resolves the approved Meta template for a campaign. Priority: explicit name in
 * audienceConfig, then the template mapped to the campaign objective. Returns null
 * when no APPROVED template is available (caller then uses legacy freeform).
 */
export async function resolveMetaCrmTemplate(
  restaurantId: string,
  campaign:     MetaCrmCampaignRef,
  firstName:    string,
): Promise<ResolvedMetaTemplate | null> {
  const explicit = readExplicitTemplate(campaign.audienceConfig);
  const found = await MetaTemplateService.findApproved(restaurantId, {
    templateName:       explicit?.name,
    languageCode:       explicit?.language,
    mappedCampaignType: campaign.objective ?? undefined,
  });
  if (!found) return null;

  let params: string[];
  if (explicit?.params && explicit.params.length > 0) {
    params = explicit.params.map((p) => resolveParamToken(p, firstName));
  } else if (found.bodyVariables === 1) {
    // Most marketing templates carry a single {{1}} = customer first name.
    params = [firstName];
  } else {
    params = []; // 0 vars, or >1 with no explicit mapping (Meta validates count)
  }
  return { name: found.templateName, language: found.languageCode, params };
}

/**
 * Sends a CRM message via Meta. Uses an approved template when one resolves for the
 * campaign (the correct path for cold/marketing audiences); otherwise sends freeform
 * text (valid only inside the 24h window — legacy behavior, unchanged).
 */
export async function sendMetaCrmMessage(
  provider: MetaTemplateProvider,
  input: {
    restaurantId: string;
    phone:        string;        // already normalized + validated
    freeformText: string;        // personalized message used inside the 24h window
    campaign:     MetaCrmCampaignRef;
    firstName:    string;
  },
): Promise<{ result: SendResult; usedTemplate: boolean }> {
  const tpl = await resolveMetaCrmTemplate(input.restaurantId, input.campaign, input.firstName);
  if (tpl) {
    const result = await provider.sendTemplate({
      restaurantId: input.restaurantId, to: input.phone,
      templateName: tpl.name, language: tpl.language, bodyParams: tpl.params,
    });
    return { result, usedTemplate: true };
  }
  const result = await provider.sendText({ restaurantId: input.restaurantId, to: input.phone, text: input.freeformText });
  return { result, usedTemplate: false };
}
