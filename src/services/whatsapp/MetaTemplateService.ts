/**
 * MetaTemplateService — minimal registry of approved Meta message templates per
 * restaurant. Business-initiated WhatsApp sends OUTSIDE the 24h customer-service
 * window must use an APPROVED template; CRM/automation resolves one from here.
 *
 * This is data-only and Meta-scoped. Evolution restaurants never touch it. Creating
 * a row does NOT register the template with Meta — registration/approval happens in
 * the Meta Business Manager; this mirrors the result (name/language/status) so the
 * send layer can gate correctly instead of failing silently.
 */

import { prisma } from "@/lib/prisma";

export interface MetaTemplateView {
  id:                 string;
  templateName:       string;
  languageCode:       string;
  category:           string;
  status:             string;
  bodyVariables:      number;
  mappedCampaignType: string | null;
}

export interface MetaTemplateInput {
  restaurantId:        string;
  templateName:        string;
  languageCode?:       string;
  category?:           string;
  status?:             string;
  bodyVariables?:      number;
  mappedCampaignType?: string | null;
}

function toView(t: {
  id: string; templateName: string; languageCode: string; category: string;
  status: string; bodyVariables: number; mappedCampaignType: string | null;
}): MetaTemplateView {
  return {
    id: t.id, templateName: t.templateName, languageCode: t.languageCode, category: t.category,
    status: t.status, bodyVariables: t.bodyVariables, mappedCampaignType: t.mappedCampaignType,
  };
}

export const MetaTemplateService = {
  async list(restaurantId: string): Promise<MetaTemplateView[]> {
    const rows = await prisma.metaMessageTemplate.findMany({
      where:   { restaurantId },
      orderBy: { templateName: "asc" },
    });
    return rows.map(toView);
  },

  async upsert(input: MetaTemplateInput): Promise<MetaTemplateView> {
    const data = {
      category:           input.category ?? "UTILITY",
      status:             input.status ?? "PENDING",
      bodyVariables:      input.bodyVariables ?? 0,
      mappedCampaignType: input.mappedCampaignType ?? null,
    };
    const row = await prisma.metaMessageTemplate.upsert({
      where: {
        restaurantId_templateName_languageCode: {
          restaurantId: input.restaurantId,
          templateName: input.templateName,
          languageCode: input.languageCode ?? "pt_BR",
        },
      },
      create: { restaurantId: input.restaurantId, templateName: input.templateName, languageCode: input.languageCode ?? "pt_BR", ...data },
      update: data,
    });
    return toView(row);
  },

  /**
   * Resolve an APPROVED template for a business-initiated send. Looks up by explicit
   * name first, then by mapped campaign type. Returns null when none is approved —
   * the caller must then block with META_TEMPLATE_REQUIRED (never send freeform).
   */
  async findApproved(
    restaurantId: string,
    opts: { templateName?: string; languageCode?: string; mappedCampaignType?: string },
  ): Promise<MetaTemplateView | null> {
    const base = { restaurantId, status: "APPROVED" as const };
    if (opts.templateName) {
      const byName = await prisma.metaMessageTemplate.findFirst({
        where: { ...base, templateName: opts.templateName, ...(opts.languageCode ? { languageCode: opts.languageCode } : {}) },
      });
      if (byName) return toView(byName);
    }
    if (opts.mappedCampaignType) {
      const byType = await prisma.metaMessageTemplate.findFirst({
        where: { ...base, mappedCampaignType: opts.mappedCampaignType },
      });
      if (byType) return toView(byType);
    }
    return null;
  },
};
