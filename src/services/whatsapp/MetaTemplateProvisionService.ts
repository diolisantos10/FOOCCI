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
import {
  parseMessagePool, listPoolCandidates, readPhraseMetaTemplates,
  phraseKey as phraseKeyOf,
} from "@/services/crm/crmMessagePool";
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
  "cupom-vencendo":      { name: "cupom_vencendo",            category: "MARKETING", footer: true  },
  "subiu-de-nivel":      { name: "subiu_de_nivel",            category: "MARKETING", footer: true  },
  "quase-no-proximo-nivel": { name: "quase_proximo_nivel",    category: "MARKETING", footer: true  },
  "mimo-mensal-nivel":   { name: "mimo_mensal_nivel",         category: "MARKETING", footer: true  },
  "indique-amigo":       { name: "indique_amigo",             category: "MARKETING", footer: true  },
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
 * Os nomes de modelo que existem DE FATO na conta que envia hoje.
 *
 * ⚠️ `MISSING` é o OPOSTO de "já existe na Meta": é a linha que o sync acabou de
 * marcar como inexistente na conta atual (número que trocou de conta, ou modelo
 * apagado lá). Contá-la como existente faria o provisionamento PULAR justamente o
 * modelo que precisa ser recriado — e a linha ficaria presa em `MISSING` para
 * sempre, sem caminho de volta. Filtrar aqui é o que mantém o conserto possível.
 */
async function nomesQueExistemNaMeta(restaurantId: string): Promise<Set<string>> {
  const linhas = await MetaTemplateService.list(restaurantId);
  return new Set(linhas.filter((t) => t.status !== "MISSING").map((t) => t.templateName));
}

/**
 * De quanto em quanto tempo o espelho de modelos precisa ser reconferido com a
 * Meta, mesmo quando nada mudou do nosso lado.
 *
 * Não é enfeite: `APPROVED` no nosso banco é uma AFIRMAÇÃO SOBRE A META, e toda
 * afirmação dessas vence. Sem prazo de validade, um modelo que sumiu da conta
 * fica verde para sempre — foi exatamente o que aconteceu com o Sushi Cazza.
 * Doze horas mantém o custo baixo (duas leituras por loja por dia) e ainda assim
 * conserta sozinho dentro de meio dia.
 */
const HORAS_ATE_RELER = 12;

/** Nomes que o banco marca como inexistentes na Meta (`MISSING`). */
async function nomesAusentesNaMeta(restaurantId: string): Promise<Set<string>> {
  try {
    const linhas = await prisma.metaMessageTemplate.findMany({
      where:  { restaurantId, status: "MISSING" },
      select: { templateName: true },
    });
    return new Set(linhas.map((t) => t.templateName));
  } catch {
    // Tabela ausente / mock de teste: seguir sem esta informação é seguro — o
    // pior caso volta a ser o comportamento antigo, nunca uma resubmissão errada.
    return new Set<string>();
  }
}

/**
 * Vale a pena reler os modelos na Meta agora?
 *
 * Sim quando (a) existe modelo PENDING — a resposta da revisão pode ter saído —,
 * ou (b) a leitura mais recente já passou de `HORAS_ATE_RELER`. `updatedAt` serve
 * de "quando li pela última vez" porque todo caminho do sync toca a linha: o
 * upsert sempre grava categoria e número de variáveis, e a reconciliação grava
 * `MISSING`. Loja sem nenhum modelo não tem o que reler.
 */
async function precisaReler(restaurantId: string): Promise<boolean> {
  try {
    const pendentes = await prisma.metaMessageTemplate.count({ where: { restaurantId, status: "PENDING" } });
    if (pendentes > 0) return true;

    const maisRecente = await prisma.metaMessageTemplate.findFirst({
      where:   { restaurantId },
      orderBy: { updatedAt: "desc" },
      select:  { updatedAt: true },
    });
    if (!maisRecente?.updatedAt) return false;
    return Date.now() - new Date(maisRecente.updatedAt).getTime() > HORAS_ATE_RELER * 60 * 60 * 1000;
  } catch {
    return false; // tabela ausente / mock → não tentar falar com a Meta
  }
}

/**
 * Creates Meta templates for every ACTIVE campaign of the restaurant and wires each
 * campaign to its template. Safe to re-run.
 */
export async function provisionDefaultTemplates(restaurantId: string): Promise<ProvisionResult> {
  // Refresh the local mirror first so we know which names already exist on Meta.
  await MetaTemplateService.syncFromMeta(restaurantId).catch(() => ({ ok: false, synced: 0 }));
  const existingNames = await nomesQueExistemNaMeta(restaurantId);

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

/** Meta template names allow [a-z0-9_]; phrase keys are already base36+underscore. */
function poolTemplateName(base: string, phraseFingerprint: string): string {
  const suffix = phraseFingerprint.replace(/^mf_/, "v").replace(/[^a-z0-9_]/g, "");
  return `${base}_${suffix}`.slice(0, 120);
}

/**
 * Ensures EVERY phrase a campaign could run — the full ready-made catalog plus
 * the owner's custom phrases — has its own Meta template submitted for approval,
 * and wires audienceConfig.metaTemplates ({ [variantKey]: { name, language,
 * params, submittedMessage } }) so the runner can rotate over the APPROVED ones.
 * Submitting the whole catalog up-front means a phrase the owner toggles on
 * later is usually ALREADY approved — zero wait, zero clicks.
 *
 * Cheap when there's nothing new: campaigns whose candidate phrases are all
 * already mapped are skipped before any Graph call. Safe to re-run (cron-safe).
 */
export async function provisionPoolTemplates(restaurantId: string, campaignId?: string): Promise<ProvisionResult> {
  // ⚠️ A varredura olhava SÓ `status: ACTIVE`, e isso brigava com a própria
  // promessa do bloco acima ("submeter o catálogo inteiro de antemão para que a
  // frase ligada depois JÁ esteja aprovada"). Campanha pausada ou concluída ficava
  // sem modelo nenhum — e no dia em que o lojista reativasse, esperaria dias pela
  // revisão da Meta com a campanha ligada e nada saindo.
  //
  // `CANCELLED` continua de fora: essa é a única morta de verdade. Submeter para
  // pausada/concluída não envia nada a ninguém — modelo é pedido de revisão — e o
  // nome do modelo deriva do TEXTO, então campanhas que compartilham a mesma
  // predefinida colapsam no mesmo modelo em vez de duplicar.
  const campaigns = await prisma.campaign.findMany({
    where: campaignId
      ? { id: campaignId, restaurantId }
      : { restaurantId, status: { not: "CANCELLED" } as never },
    select: { id: true, templateId: true, message: true, scheduleConfig: true, audienceConfig: true },
  });

  // Quais modelos desta loja o banco diz que NÃO existem mais na Meta.
  // Sem isto, o mapa `audienceConfig.metaTemplates` — que só prova "um dia eu
  // submeti este texto" — bastava para a campanha ser considerada pronta, e o
  // modelo apagado/perdido nunca era resubmetido. Ver o comentário do work list.
  const ausentes = await nomesAusentesNaMeta(restaurantId);

  // Work list: campaigns with a mappable config AND at least one candidate phrase
  // whose mapping is missing OR stale (text changed — e.g. the coupon prize line
  // was toggled) OR whose template no longer exists on Meta.
  //
  // ⚠️ O TERCEIRO CASO É NOVO, e era o mais caro — 23/08/2026. `metaTemplates` é
  // memória do que JÁ FOI submetido, não prova de que o modelo existe hoje na
  // conta que envia. Com o número tendo trocado de conta, o mapa continuava
  // completo, esta função devolvia "nada a fazer" antes de qualquer chamada à
  // Meta, e a resubmissão automática — que roda a cada 10 minutos — nunca
  // acontecia. Mapa cheio virava prova de vida.
  const work = campaigns.flatMap((campaign) => {
    const config = campaign.templateId ? TEMPLATE_CONFIG[campaign.templateId] : undefined;
    if (!config) return [];
    const hasCoupon = !!(campaign.scheduleConfig as { coupon?: unknown } | null)?.coupon;
    const phrases = listPoolCandidates(campaign.templateId, parseMessagePool(campaign.scheduleConfig), { hasCoupon });
    if (phrases.length === 0) return [];
    const mapped = readPhraseMetaTemplates(campaign.audienceConfig);
    const pronta = phrases.every((p) => {
      const m = mapped[p.key];
      if (m?.submittedMessage !== p.text) return false;   // nunca submetida, ou texto mudou
      return !(m.name && ausentes.has(m.name));           // submetida, mas sumiu da Meta
    });
    if (pronta) return [];
    return [{ campaign, config, phrases }];
  });
  if (work.length === 0) {
    // Nothing new to submit — but o que o banco guarda sobre a Meta ENVELHECE, e
    // em duas direções. Um modelo PENDING pode ter sido aprovado (ou reprovado)
    // desde a última leitura; e um modelo APPROVED pode ter deixado de existir na
    // conta que envia hoje. Sem reler, os dois viram mentira permanente.
    //
    // ⚠️ Este galho só olhava PENDING — 23/08/2026. Com tudo marcado APPROVED, ele
    // devolvia "nada a fazer" e NUNCA falava com a Meta: o espelho ficava
    // congelado para sempre, sem nenhum gatilho capaz de descongelá-lo. Era a
    // terceira camada do mesmo erro: tratar estado local como prova do estado da Meta.
    if (await precisaReler(restaurantId)) {
      await MetaTemplateService.syncFromMeta(restaurantId).catch(() => ({ ok: false, synced: 0 }));
    }
    return { ok: true, created: 0, existed: 0, failed: 0, items: [] };
  }

  await MetaTemplateService.syncFromMeta(restaurantId).catch(() => ({ ok: false, synced: 0 }));
  const existingNames = await nomesQueExistemNaMeta(restaurantId);
  const exampleCtx = await buildExampleContext(restaurantId);

  const items: ProvisionItemResult[] = [];
  let created = 0, existed = 0, failed = 0;

  for (const { campaign, config, phrases } of work) {
    const readyMade = getReadyMadeCampaign(campaign.templateId as string);
    const { cupom, validade } = couponExamples(readyMade?.defaultCoupon);
    const examples: Partial<Record<KnownToken, string>> = {
      nome: "Maria", restaurante: exampleCtx.restaurante, link_cardapio: exampleCtx.link_cardapio,
      instagram: exampleCtx.instagram, link_avaliacao_google: exampleCtx.link_avaliacao_google, cupom, validade,
    };

    // Rebuild the mapping from the current candidates (catalog + existing custom) —
    // entries for deleted custom phrases drop out, so stale templates never rotate.
    const metaTemplates: Record<string, { name: string; language: string; params: string[]; submittedMessage: string }> = {};

    for (const phrase of phrases) {
      // Name derives from the EFFECTIVE text (coupon line included), so the with-
      // coupon and without-coupon versions of a phrase are DIFFERENT templates on
      // Meta — toggling the coupon back reuses the already-approved original.
      const name  = poolTemplateName(config.name, phraseKeyOf(phrase.text));
      const built = buildMetaTemplate({
        name, message: phrase.text, category: config.category, language: LANGUAGE,
        footer: config.footer ? OPT_OUT_FOOTER : null, examples,
      });
      // ⚠️ O MAPA SÓ RECEBE A FRASE DEPOIS QUE ELA DE FATO CHEGOU NA META.
      // Antes, a linha abaixo ficava AQUI — antes da tentativa — e o mapa inteiro
      // era gravado no fim, incluindo frase cujo `createOnMeta` FALHOU. Como o
      // `work` usa justamente esse mapa para decidir "já submeti", a frase falhada
      // era dada como pronta e NUNCA mais era tentada. Intenção registrada como
      // realização — o mesmo erro do selo, um andar abaixo.
      //
      // Isso passava despercebido enquanto se submetiam 5 frases por vez; com o
      // catálogo inteiro indo de uma vez, esbarrar no limite de criação da Meta
      // deixa de ser exceção — e cada falha viraria uma frase morta em silêncio.
      const anotarNoMapa = () => {
        metaTemplates[phrase.key] = { name, language: LANGUAGE, params: built.paramTokens, submittedMessage: phrase.text };
      };

      if (existingNames.has(name)) {
        anotarNoMapa();
        await MetaTemplateService.upsert({
          restaurantId, templateName: name, languageCode: LANGUAGE,
          category: config.category, bodyVariables: built.bodyVariables,
        });
        existed++;
        items.push({ templateId: campaign.templateId as string, templateName: name, status: "existed" });
        continue;
      }
      const res = await MetaTemplateService.createOnMeta(restaurantId, built.payload);
      if (res.ok || res.alreadyExists) {
        anotarNoMapa();
        await MetaTemplateService.upsert({
          restaurantId, templateName: name, languageCode: LANGUAGE,
          category: config.category, bodyVariables: built.bodyVariables,
          ...(res.ok ? { status: "PENDING", rejectedReason: null } : {}),
          ...(res.id ? { metaTemplateId: res.id } : {}),
        });
        existingNames.add(name);
        if (res.alreadyExists) { existed++; items.push({ templateId: campaign.templateId as string, templateName: name, status: "existed" }); }
        else                   { created++; items.push({ templateId: campaign.templateId as string, templateName: name, status: "created" }); }
      } else {
        // Sem `anotarNoMapa()` de propósito: frase que não chegou na Meta continua
        // fora do mapa e volta na próxima passada do cron.
        failed++;
        items.push({ templateId: campaign.templateId as string, templateName: name, status: "failed", error: res.error });
      }
    }

    // Nota: não se recupera o mapeamento antigo de uma frase que falhou agora. Se
    // ela chegou até o `createOnMeta`, é porque o nome NÃO estava em
    // `existingNames` — ou seja, o modelo antigo não existe mais na Meta e o
    // mapeamento velho já era mentira.
    const prev = (campaign.audienceConfig && typeof campaign.audienceConfig === "object")
      ? (campaign.audienceConfig as Record<string, unknown>) : {};
    await prisma.campaign.update({
      where: { id: campaign.id },
      data:  { audienceConfig: { ...prev, metaTemplates } as never },
    }).catch(() => { /* best-effort */ });
  }

  return { ok: failed === 0, created, existed, failed, items };
}

/** provisionDefaultTemplates + the per-phrase pool templates, in one sweep. */
export async function provisionAllTemplates(restaurantId: string): Promise<ProvisionResult> {
  const base = await provisionDefaultTemplates(restaurantId);
  const pool = await provisionPoolTemplates(restaurantId);
  return {
    ok:      base.ok && pool.ok,
    created: base.created + pool.created,
    existed: base.existed + pool.existed,
    failed:  base.failed  + pool.failed,
    items:   [...base.items, ...pool.items],
    error:   base.error,
  };
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
