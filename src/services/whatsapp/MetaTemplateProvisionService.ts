/**
 * MetaTemplateProvisionService — one-click creation of Meta message templates from the
 * restaurant's ACTIVE CRM campaigns.
 *
 * WHY: sending CRM/marketing over the official Meta Cloud API to cold audiences (outside
 * the 24h window) REQUIRES an approved template. Creating each by hand in the Meta panel
 * is slow and error-prone. This reads the restaurant's active campaigns, converts each
 * message into a Meta template (sequential {{n}} vars + examples via metaTemplateBuilder),
 * submits it for review through the Graph API, mirrors it locally as PENDING, and wires
 * the campaign→template link (audienceConfig.metaTemplate) so the send layer resolves it
 * once Meta approves.
 *
 * Idempotent: a template whose name already exists on Meta (a manual creation, or a prior
 * run) is not recreated — its local mirror + campaign mapping are still ensured.
 */

import { prisma } from "@/lib/prisma";
import { getReadyMadeCampaign, type ReadyMadeCoupon } from "@/services/crm/readyMadeCampaigns";
import { couponMessageLabel, couponValidadeLabel } from "@/services/crm/renderCrmMessage";
import { buildInstagramUrl } from "@/lib/social";
import { getPublicMenuUrl, getPublicSiteUrl, sanitizeCustomerUrl } from "@/lib/public-url";
import { MetaTemplateService } from "./MetaTemplateService";
import { buildMetaTemplate, type KnownToken } from "./metaTemplateBuilder";

const OPT_OUT_FOOTER = "Para não receber mais ofertas, responda SAIR.";
const LANGUAGE = "pt_BR";

/** Per ready-made template: Meta template name + category + whether to add the opt-out footer. */
interface TemplateConfig { name: string; category: "MARKETING" | "UTILITY"; footer: boolean }

export const TEMPLATE_CONFIG: Record<string, TemplateConfig> = {
  "pedido-avaliacao":    { name: "pedir_avaliacao",           category: "UTILITY",   footer: false },
  "aniversariantes":     { name: "aniversario",               category: "MARKETING", footer: false },
  "segunda-compra":      { name: "segunda_compra",            category: "MARKETING", footer: true  },
  "cadastro-sem-compra": { name: "converter_primeiro_pedido", category: "MARKETING", footer: true  },
  "quente-esfriando":    { name: "cliente_esfriando",         category: "MARKETING", footer: true  },
  "reativar-mornos":     { name: "cliente_morno",             category: "MARKETING", footer: true  },
  "recuperar-frios":     { name: "cliente_frio",              category: "MARKETING", footer: true  },
  "recuperar-perdidos":  { name: "cliente_perdido",           category: "MARKETING", footer: true  },
  "clientes-vip":        { name: "cliente_vip",               category: "MARKETING", footer: true  },
  "carrinho-abandonado": { name: "carrinho_abandonado",       category: "UTILITY",   footer: false },
  "siga-redes":          { name: "siga_redes",                category: "MARKETING", footer: true  },
};

export interface ProvisionItemResult {
  templateId:   string;   // ready-made id (e.g. "recuperar-perdidos")
  templateName: string;   // Meta template name (e.g. "cliente_perdido")
  status:       "created" | "existed" | "failed";
  error?:       string;
}

/** The Meta template name a ready-made campaign maps to (null if not mappable). */
export function metaTemplateNameFor(readyMadeId: string): string | null {
  return TEMPLATE_CONFIG[readyMadeId]?.name ?? null;
}

export interface ProvisionResult {
  ok:      boolean;
  created: number;
  existed: number;
  failed:  number;
  items:   ProvisionItemResult[];
  error?:  string;
}

/** Restaurant-specific example values shown to Meta's reviewer (accurate = better approval). */
async function buildExampleContext(restaurantId: string): Promise<{
  restaurante: string; link_cardapio: string; instagram: string; link_avaliacao_google: string;
}> {
  const [restaurant, brandConfig, agentCfg] = await Promise.all([
    prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { name: true, slug: true } }),
    prisma.restaurantBrandConfig.findUnique({ where: { restaurantId }, select: { googleReviewUrl: true, instagramUrl: true } }),
    prisma.whatsAppAgentConfig.findUnique({ where: { restaurantId }, select: { menuUrl: true } }),
  ]);
  const rawMenuUrl   = agentCfg?.menuUrl?.trim() || (restaurant?.slug ? getPublicMenuUrl(restaurant.slug) : null);
  const fixedMenuUrl = rawMenuUrl?.replace(/\/qr\/([^/?]+)/, "/pedido/$1") ?? rawMenuUrl;
  const menuUrl      = fixedMenuUrl ? sanitizeCustomerUrl(fixedMenuUrl) : getPublicSiteUrl();
  return {
    restaurante:           restaurant?.name ?? "nossa loja",
    link_cardapio:         menuUrl,
    instagram:             buildInstagramUrl(brandConfig?.instagramUrl ?? null) || "https://instagram.com",
    link_avaliacao_google: brandConfig?.googleReviewUrl ?? "https://g.page/r/avaliar",
  };
}

/** Example coupon label/validade for the reviewer, from the campaign's default coupon. */
function couponExamples(coupon: ReadyMadeCoupon | undefined): { cupom: string; validade: string } {
  if (!coupon) return { cupom: "10% de desconto", validade: "31/12" };
  const c = { type: coupon.type, value: coupon.value, description: coupon.description ?? null, validityDays: coupon.validityDays ?? null };
  return {
    cupom:    couponMessageLabel(c) || "10% de desconto",
    validade: couponValidadeLabel(c) || "31/12",
  };
}

/**
 * Creates Meta templates for every ACTIVE campaign of the restaurant and wires each
 * campaign to its template. Safe to re-run.
 */
export async function provisionDefaultTemplates(restaurantId: string): Promise<ProvisionResult> {
  // Refresh the local mirror first so we know which names already exist on Meta.
  await MetaTemplateService.syncFromMeta(restaurantId).catch(() => ({ ok: false, synced: 0 }));
  const existingNames = new Set((await MetaTemplateService.list(restaurantId)).map((t) => t.templateName));

  const campaigns = await prisma.campaign.findMany({
    where:  { restaurantId, status: "ACTIVE" as never },
    select: { id: true, templateId: true, message: true, audienceConfig: true },
  });

  if (campaigns.length === 0) {
    return { ok: true, created: 0, existed: 0, failed: 0, items: [], error: "Nenhuma campanha ativa para criar modelos." };
  }

  const exampleCtx = await buildExampleContext(restaurantId);

  const items: ProvisionItemResult[] = [];
  let created = 0, existed = 0, failed = 0;

  // De-dupe by Meta template name — multiple campaigns can share a ready-made id.
  const doneNames = new Set<string>();

  for (const campaign of campaigns) {
    const readyMadeId = campaign.templateId;
    if (!readyMadeId) continue;
    const config = TEMPLATE_CONFIG[readyMadeId];
    if (!config) continue; // unknown/custom template — skip silently

    const readyMade = getReadyMadeCampaign(readyMadeId);
    const message = campaign.message?.trim() || readyMade?.defaultMessage;
    if (!message) continue;

    const { cupom, validade } = couponExamples(readyMade?.defaultCoupon);
    const examples: Partial<Record<KnownToken, string>> = {
      nome:                  "Maria",
      restaurante:           exampleCtx.restaurante,
      link_cardapio:         exampleCtx.link_cardapio,
      instagram:             exampleCtx.instagram,
      link_avaliacao_google: exampleCtx.link_avaliacao_google,
      cupom,
      validade,
    };

    const built = buildMetaTemplate({
      name:     config.name,
      message,
      category: config.category,
      language: LANGUAGE,
      footer:   config.footer ? OPT_OUT_FOOTER : null,
      examples,
    });

    // Wire the campaign→template link so the send layer fills params in this exact
    // token order once the template is approved. (audienceConfig.metaTemplate.)
    const wireMapping = async () => {
      const prev = (campaign.audienceConfig && typeof campaign.audienceConfig === "object")
        ? (campaign.audienceConfig as Record<string, unknown>)
        : {};
      await prisma.campaign.update({
        where: { id: campaign.id },
        data:  { audienceConfig: { ...prev, metaTemplate: { name: config.name, language: LANGUAGE, params: built.paramTokens } } as never },
      }).catch(() => { /* best-effort */ });
    };

    // Already on Meta (manual creation or a prior run) → ensure mirror + mapping, skip create.
    if (existingNames.has(config.name) || doneNames.has(config.name)) {
      await MetaTemplateService.upsert({
        restaurantId, templateName: config.name, languageCode: LANGUAGE,
        category: config.category, bodyVariables: built.bodyVariables,
      });
      await wireMapping();
      doneNames.add(config.name);
      existed++;
      items.push({ templateId: readyMadeId, templateName: config.name, status: "existed" });
      continue;
    }

    const res = await MetaTemplateService.createOnMeta(restaurantId, built.payload);
    if (res.ok || res.alreadyExists) {
      await MetaTemplateService.upsert({
        restaurantId, templateName: config.name, languageCode: LANGUAGE,
        category: config.category, bodyVariables: built.bodyVariables,
        // Genuine new create → PENDING. "already exists" (created out-of-band since the
        // sync above) → OMIT status so a prior APPROVED is never downgraded.
        ...(res.ok ? { status: "PENDING" } : {}),
      });
      await wireMapping();
      doneNames.add(config.name);
      if (res.alreadyExists) { existed++; items.push({ templateId: readyMadeId, templateName: config.name, status: "existed" }); }
      else                   { created++; items.push({ templateId: readyMadeId, templateName: config.name, status: "created" }); }
    } else {
      failed++;
      items.push({ templateId: readyMadeId, templateName: config.name, status: "failed", error: res.error });
    }
  }

  return { ok: failed === 0, created, existed, failed, items };
}

export interface SubmitOneResult {
  ok:           boolean;
  status:       "created" | "existed" | "resubmitted" | "pending" | "approved" | "failed";
  templateName: string;
  error?:       string;
}

/**
 * Submits ONE ready-made campaign's current phrase to Meta for approval. This is the
 * shared motor behind the human "Enviar para aprovação" button and (later) the CRM
 * agent's automatic submission. Idempotent and re-submit aware:
 *   - no template / disabled → create + submit (PENDING)
 *   - REJECTED               → delete the old one + recreate with the fixed phrase
 *   - PENDING                → no-op ("já está em análise")
 *   - APPROVED, phrase same  → no-op ("já aprovado")
 *   - APPROVED, phrase edited → edit IN PLACE when the variable shape is unchanged (zero
 *     gap — the live approved body keeps sending until Meta re-approves); otherwise
 *     delete + recreate.
 */
export async function submitTemplateForReadyMade(restaurantId: string, readyMadeId: string): Promise<SubmitOneResult> {
  const config = TEMPLATE_CONFIG[readyMadeId];
  if (!config) return { ok: false, status: "failed", templateName: readyMadeId, error: "Esta campanha não tem modelo mapeável." };

  const campaign = await prisma.campaign.findFirst({
    where:   { restaurantId, templateId: readyMadeId },
    orderBy: { createdAt: "desc" },
    select:  { id: true, message: true, audienceConfig: true },
  });

  const readyMade = getReadyMadeCampaign(readyMadeId);
  const message = campaign?.message?.trim() || readyMade?.defaultMessage;
  if (!message) return { ok: false, status: "failed", templateName: config.name, error: "Campanha sem mensagem." };

  const exampleCtx = await buildExampleContext(restaurantId);
  const { cupom, validade } = couponExamples(readyMade?.defaultCoupon);
  const examples: Partial<Record<KnownToken, string>> = {
    nome: "Maria", restaurante: exampleCtx.restaurante, link_cardapio: exampleCtx.link_cardapio,
    instagram: exampleCtx.instagram, link_avaliacao_google: exampleCtx.link_avaliacao_google, cupom, validade,
  };
  const built = buildMetaTemplate({
    name: config.name, message, category: config.category, language: LANGUAGE,
    footer: config.footer ? OPT_OUT_FOOTER : null, examples,
  });

  const wireMapping = async () => {
    if (!campaign) return;
    const prev = (campaign.audienceConfig && typeof campaign.audienceConfig === "object")
      ? (campaign.audienceConfig as Record<string, unknown>) : {};
    await prisma.campaign.update({
      where: { id: campaign.id },
      // submittedMessage records the EXACT phrase last sent to Meta, so a later submit can
      // tell whether an approved template's phrase actually changed (needs re-approval) or
      // is unchanged (leave the live approved template alone).
      data:  { audienceConfig: { ...prev, metaTemplate: { name: config.name, language: LANGUAGE, params: built.paramTokens, submittedMessage: message } } as never },
    }).catch(() => { /* best-effort */ });
  };

  // The phrase + variable shape last submitted to Meta for this campaign (to detect edits).
  const prevMeta = (campaign?.audienceConfig && typeof campaign.audienceConfig === "object")
    ? ((campaign.audienceConfig as Record<string, unknown>).metaTemplate as { submittedMessage?: unknown; params?: unknown } | undefined)
    : undefined;
  const lastSubmittedMessage = typeof prevMeta?.submittedMessage === "string" ? prevMeta.submittedMessage : null;
  const prevParams = Array.isArray(prevMeta?.params) ? prevMeta!.params.map(String) : null;
  // Same variable shape ⇒ Meta's in-place edit is valid (zero-gap). A changed variable
  // count/order requires delete+recreate (param positions would otherwise mismatch).
  const sameVariableShape = prevParams !== null && JSON.stringify(prevParams) === JSON.stringify(built.paramTokens);

  // Delete the old template + recreate with the current phrase (Meta names are immutable).
  const deleteAndRecreate = async (): Promise<SubmitOneResult> => {
    await MetaTemplateService.deleteOnMeta(restaurantId, config.name);
    const recreated = await MetaTemplateService.createOnMeta(restaurantId, built.payload);
    if (!recreated.ok && !recreated.alreadyExists) {
      return { ok: false, status: "failed", templateName: config.name, error: recreated.error };
    }
    await MetaTemplateService.upsert({
      restaurantId, templateName: config.name, languageCode: LANGUAGE,
      category: config.category, bodyVariables: built.bodyVariables, status: "PENDING", rejectedReason: null,
      // deleteOnMeta cleared the local row, so pass the new id (or null when unknown) to
      // avoid carrying a stale template id.
      metaTemplateId: recreated.id ?? null,
    });
    await wireMapping();
    return { ok: true, status: "resubmitted", templateName: config.name };
  };

  // Refresh from Meta so we act on the true current status.
  await MetaTemplateService.syncFromMeta(restaurantId).catch(() => ({ ok: false, synced: 0 }));
  const existing = (await MetaTemplateService.list(restaurantId)).find((t) => t.templateName === config.name);

  if (existing) {
    if (existing.status === "PENDING") { await wireMapping(); return { ok: true, status: "pending", templateName: config.name }; }
    if (existing.status === "APPROVED") {
      // Unchanged phrase → keep the live approved template, nothing to do.
      if (lastSubmittedMessage !== null && lastSubmittedMessage === message) {
        await wireMapping();
        return { ok: true, status: "approved", templateName: config.name };
      }
      // Edited phrase, SAME variable shape, and we know Meta's id → edit IN PLACE. Meta keeps
      // the current approved body live while re-reviewing the new one — zero gap, no failed
      // sends. Falls back to delete+recreate if the edit is rejected by Meta.
      if (existing.metaTemplateId && sameVariableShape) {
        const edited = await MetaTemplateService.editOnMeta(restaurantId, existing.metaTemplateId, {
          category: built.payload.category, components: built.payload.components,
        });
        if (edited.ok) {
          // Stays APPROVED locally (the live version still sends) — record the new phrase.
          await wireMapping();
          return { ok: true, status: "resubmitted", templateName: config.name };
        }
        // Edit refused (e.g. monthly edit limit) → fall through to delete+recreate.
      }
      return deleteAndRecreate();
    }
    // REJECTED, DISABLED, or unknown → recreate with the current phrase.
    return deleteAndRecreate();
  }

  const res = await MetaTemplateService.createOnMeta(restaurantId, built.payload);
  if (res.ok || res.alreadyExists) {
    await MetaTemplateService.upsert({
      restaurantId, templateName: config.name, languageCode: LANGUAGE,
      category: config.category, bodyVariables: built.bodyVariables,
      ...(res.ok ? { status: "PENDING", rejectedReason: null } : {}),
      // Record Meta's template id (returned on create) so a later approved-phrase edit can
      // update in place instead of delete+recreate.
      ...(res.id ? { metaTemplateId: res.id } : {}),
    });
    await wireMapping();
    return { ok: true, status: res.alreadyExists ? "existed" : "created", templateName: config.name };
  }
  return { ok: false, status: "failed", templateName: config.name, error: res.error };
}
