/**
 * MetaTemplateService — registry of Meta message templates per restaurant, plus a
 * sync that pulls the restaurant's templates (and approval status) from the Meta Graph
 * API so the CRM send layer can resolve an APPROVED template instead of failing.
 *
 * Business-initiated WhatsApp sends OUTSIDE the 24h customer-service window must use an
 * APPROVED template; CRM/automation resolves one from here via findApproved().
 *
 * Meta-scoped and additive. Evolution restaurants never touch it. The local row mirrors
 * Meta's name/language/status/variable-count; `mappedCampaignType` is a Foocci-side link
 * (template → CRM objective) that sync preserves (never clobbers).
 */

import { prisma } from "@/lib/prisma";
import { MetaConfigService } from "./MetaConfigService";
import { metaGraphUrl } from "./metaFlag";
import { maskGraphResponse } from "./providers/metaPayload";

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
  /** Pass to set; OMIT (undefined) to preserve an existing mapping on update. */
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

/** Maps a Meta template status to our compact set. */
function mapMetaStatus(raw: unknown): string {
  const s = String(raw ?? "").toUpperCase();
  if (s === "APPROVED") return "APPROVED";
  if (s === "REJECTED") return "REJECTED";
  if (s === "PAUSED" || s === "DISABLED") return "DISABLED";
  return "PENDING";
}

/** Counts {{n}} placeholders in the BODY component (the highest n = variable count). */
function countBodyVariables(components: unknown): number {
  if (!Array.isArray(components)) return 0;
  const body = components.find((c) => String((c as { type?: unknown })?.type).toUpperCase() === "BODY");
  const text = (body as { text?: unknown })?.text;
  const matches = String(text ?? "").match(/\{\{\s*\d+\s*\}\}/g) ?? [];
  let max = 0;
  for (const m of matches) {
    const n = parseInt(m.replace(/\D/g, ""), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max;
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
    const create = {
      restaurantId:       input.restaurantId,
      templateName:       input.templateName,
      languageCode:       input.languageCode ?? "pt_BR",
      category:           input.category ?? "UTILITY",
      status:             input.status ?? "PENDING",
      bodyVariables:      input.bodyVariables ?? 0,
      mappedCampaignType: input.mappedCampaignType ?? null,
    };
    // On update, only touch status and mappedCampaignType when the caller explicitly
    // provided them. Sync passes both → they refresh. Provisioning re-runs OMIT status
    // for a template that already exists → the current status (e.g. APPROVED, set by a
    // prior sync) is PRESERVED, never clobbered back to PENDING (which would make
    // findApproved miss it and silently drop the CRM send path to freeform).
    const update: {
      category: string; bodyVariables: number; status?: string; mappedCampaignType?: string | null;
    } = {
      category:      input.category ?? "UTILITY",
      bodyVariables: input.bodyVariables ?? 0,
    };
    if (input.status !== undefined) update.status = input.status;
    if (input.mappedCampaignType !== undefined) update.mappedCampaignType = input.mappedCampaignType;

    const row = await prisma.metaMessageTemplate.upsert({
      where: {
        restaurantId_templateName_languageCode: {
          restaurantId: input.restaurantId,
          templateName: input.templateName,
          languageCode: input.languageCode ?? "pt_BR",
        },
      },
      create,
      update,
    });
    return toView(row);
  },

  /** Sets/clears the template→CRM-objective mapping for one template. */
  async setCampaignMapping(
    restaurantId: string, templateName: string, languageCode: string, mappedCampaignType: string | null,
  ): Promise<void> {
    await prisma.metaMessageTemplate.updateMany({
      where: { restaurantId, templateName, languageCode },
      data:  { mappedCampaignType },
    });
  },

  /**
   * Creates a message template on Meta (POST /{wabaId}/message_templates) and submits
   * it for review. The payload is built by metaTemplateBuilder (sequential {{n}} vars +
   * examples). Returns the new template id on success. A "template already exists" reply
   * is surfaced as { ok:false, alreadyExists:true } so provisioning can treat it as a
   * skip (idempotent re-run) rather than a hard error. Never throws.
   */
  async createOnMeta(
    restaurantId: string,
    payload: { name: string; language: string; category: string; components: Array<Record<string, unknown>> },
  ): Promise<{ ok: boolean; id?: string; error?: string; alreadyExists?: boolean }> {
    const cfg = await MetaConfigService.getResolved(restaurantId);
    if (!cfg) return { ok: false, error: "WhatsApp oficial da Meta não está conectado." };
    try {
      const res = await fetch(metaGraphUrl(`${cfg.wabaId}/message_templates`), {
        method:  "POST",
        headers: { Authorization: `Bearer ${cfg.accessToken}`, "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });
      const json: unknown = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = (json as { error?: { message?: string; error_user_msg?: string; code?: number; error_subcode?: number } }).error;
        // 100/2388023 + "already exists" → idempotent skip.
        const raw = `${err?.error_user_msg ?? ""} ${err?.message ?? ""}`.toLowerCase();
        const alreadyExists = raw.includes("already exists") || raw.includes("já existe") || err?.error_subcode === 2388023;
        return {
          ok: false,
          alreadyExists,
          error: maskGraphResponse(err?.error_user_msg ?? err?.message ?? "Falha ao criar o modelo na Meta."),
        };
      }
      const id = (json as { id?: unknown }).id;
      return { ok: true, id: id != null ? String(id) : undefined };
    } catch (e) {
      return { ok: false, error: maskGraphResponse(e instanceof Error ? e.message : String(e)) };
    }
  },

  /**
   * Pulls the restaurant's templates from the Meta Graph API
   * (GET /{wabaId}/message_templates) and mirrors name/language/category/status/
   * variable-count locally. Preserves existing campaign mappings. Best-effort,
   * paginated. Returns a count and never throws.
   */
  async syncFromMeta(restaurantId: string): Promise<{ ok: boolean; synced: number; error?: string }> {
    const cfg = await MetaConfigService.getResolved(restaurantId);
    if (!cfg) return { ok: false, synced: 0, error: "WhatsApp oficial da Meta não está conectado." };
    try {
      let url: string | null =
        metaGraphUrl(`${cfg.wabaId}/message_templates?fields=name,language,category,status,components&limit=100`);
      let synced = 0;
      let pages = 0;
      while (url && pages < 10) {
        const res = await fetch(url, { headers: { Authorization: `Bearer ${cfg.accessToken}` } });
        const json: unknown = await res.json().catch(() => ({}));
        if (!res.ok) {
          const err = (json as { error?: { message?: string } }).error?.message;
          return { ok: false, synced, error: maskGraphResponse(err ?? "Falha ao buscar modelos na Meta.") };
        }
        const data = (json as { data?: unknown }).data;
        const rows = Array.isArray(data) ? data : [];
        for (const t of rows) {
          const tpl = t as { name?: unknown; language?: unknown; category?: unknown; status?: unknown; components?: unknown };
          if (!tpl.name) continue;
          await this.upsert({
            restaurantId,
            templateName:  String(tpl.name),
            languageCode:  String(tpl.language ?? "pt_BR"),
            category:      String(tpl.category ?? "UTILITY").toUpperCase(),
            status:        mapMetaStatus(tpl.status),
            bodyVariables: countBodyVariables(tpl.components),
            // mappedCampaignType omitted → preserved
          });
          synced++;
        }
        url = (json as { paging?: { next?: string } }).paging?.next ?? null;
        pages++;
      }
      return { ok: true, synced };
    } catch (e) {
      return { ok: false, synced: 0, error: maskGraphResponse(e instanceof Error ? e.message : String(e)) };
    }
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
