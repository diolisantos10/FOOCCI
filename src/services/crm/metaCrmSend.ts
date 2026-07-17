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

/** True when a value still carries an unresolved {token} — unsafe to send to Meta. */
function hasUnresolvedToken(value: string): boolean {
  return /\{\{?\s*[a-z_]+\s*\}?\}/i.test(value);
}

/**
 * Resolves the approved Meta template for a campaign. Priority: explicit name in
 * audienceConfig, then the template mapped to the campaign objective. Returns null
 * when no APPROVED template is available OR when its body params cannot be filled
 * safely (caller then uses legacy freeform).
 *
 * Body params: when the template carries variable tokens (audienceConfig.metaTemplate
 * .params, in body order), each is filled via `renderToken` — the caller renders it
 * against the same canonical CRM context as the freeform message, so the delivered
 * template matches. Without a renderToken, only the single-{{1}}=name shape is fillable;
 * anything else returns null (→ freeform) rather than sending a malformed template.
 */
export async function resolveMetaCrmTemplate(
  restaurantId: string,
  campaign:     MetaCrmCampaignRef,
  firstName:    string,
  renderToken?: (token: string) => string,
): Promise<ResolvedMetaTemplate | null> {
  const explicit = readExplicitTemplate(campaign.audienceConfig);
  const found = await MetaTemplateService.findApproved(restaurantId, {
    templateName:       explicit?.name,
    languageCode:       explicit?.language,
    mappedCampaignType: campaign.objective ?? undefined,
  });
  if (!found) return null;

  const tokens = explicit?.params ?? [];

  let params: string[];
  if (tokens.length > 0) {
    // Fill each body token. Prefer the caller's full-context renderer; fall back to the
    // name-only resolver (which leaves non-name tokens literal → caught below).
    params = tokens.map((t) => (renderToken ? renderToken(t) : resolveParamToken(t, firstName)));
    // Never send a template with an unresolved or empty param — Meta rejects it, and a
    // literal "{cupom}" would reach the customer. Bail to freeform instead.
    if (params.some((p) => !p.trim() || hasUnresolvedToken(p))) return null;
    // Param count must match the template's variable count.
    if (found.bodyVariables > 0 && params.length !== found.bodyVariables) return null;
  } else if (found.bodyVariables === 1) {
    // Most marketing templates carry a single {{1}} = customer first name.
    params = [firstName];
  } else if (found.bodyVariables === 0) {
    params = [];
  } else {
    // Multi-variable template with no token mapping — can't fill safely.
    return null;
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
    /** Renders one template body token (e.g. "{cupom}") in the caller's per-customer
     *  CRM context. Enables multi-variable templates; omit for name-only templates. */
    renderToken?: (token: string) => string;
  },
): Promise<{ result: SendResult; usedTemplate: boolean }> {
  const tpl = await resolveMetaCrmTemplate(input.restaurantId, input.campaign, input.firstName, input.renderToken);
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
