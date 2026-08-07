/**
 * crmMessagePool — the campaign's rotating phrase pool (PURE — no DB).
 *
 * A campaign can run SEVERAL phrases at once: the owner picks which ready-made
 * variants are on, plus up to MAX_CUSTOM_PHRASES phrases of their own. Each send
 * draws one at random and records its variantKey (the phrase fingerprint) on the
 * execution, so per-phrase effectiveness (sent → converted) can be measured — the
 * data the future CRM agent uses to breed better phrases.
 *
 * Stored in Campaign.scheduleConfig.messagePool:
 *   { selected?: string[]           // variantKeys of enabled ready-made variants
 *   , custom?: { id, text, on }[] } // owner-written phrases (≤5)
 *
 * Keys are content fingerprints (generateMessageFingerprint), so they survive
 * catalog reordering; editing a phrase's text gives it a new identity (fresh stats).
 * An empty/missing pool falls back to campaign.message — the exact legacy behavior.
 */

import { generateMessageFingerprint } from "./messageFingerprint";
import { getReadyMadeMessageVariants } from "./readyMadeCampaigns";

export const MAX_CUSTOM_PHRASES = 5;

export interface CustomPhrase {
  id:   string;
  text: string;
  /** false = kept but not rotating. Missing = on. */
  on?:  boolean;
}

export interface MessagePoolConfig {
  selected?: string[];
  custom?:   CustomPhrase[];
  /** Frases criadas pelo AGENTE de CRM — balde separado das 5 do lojante. */
  agent?:    CustomPhrase[];
}

/** Teto das frases do agente (folgado — a Meta aguenta muito; o lojista fica nas 5). */
export const MAX_AGENT_PHRASES = 50;

export interface PoolPhrase {
  /** Stable identity for stats: generateMessageFingerprint(text). */
  key:    string;
  text:   string;
  source: "catalog" | "custom" | "agent" | "fallback";
}

/** variantKey for any phrase text (what executions record). */
export function phraseKey(text: string): string {
  return generateMessageFingerprint(text);
}

/**
 * Prize line auto-appended when the campaign grants a coupon but the phrase never
 * mentions it — the customer must ALWAYS be told what they won ("você ganhou"),
 * with validity and channel. Ends on text (Meta rejects trailing variables).
 */
export const COUPON_SUFFIX =
  "\n\n🎁 E tem presente: você ganhou {cupom}! Válido até {validade} — é só usar no pedido pelo cardápio. 🧡";

const CUPOM_VAR_RE = /\{\{?\s*cupom\s*\}?\}/i;

/**
 * The text actually sent for a phrase: unchanged when the campaign has no coupon
 * or the phrase already announces it; otherwise the prize line is appended.
 * Identity (phraseKey/selection/stats) always stays on the BASE text, so turning
 * a coupon on/off never resets a phrase's stats or selection.
 */
export function withCouponLine(text: string, hasCoupon: boolean): string {
  const base = (text ?? "").trim();
  if (!hasCoupon || !base || CUPOM_VAR_RE.test(base)) return base;
  return `${base}${COUPON_SUFFIX}`;
}

/** Reads scheduleConfig.messagePool defensively (JSON from the DB). */
export function parseMessagePool(scheduleConfig: unknown): MessagePoolConfig | null {
  if (!scheduleConfig || typeof scheduleConfig !== "object") return null;
  const raw = (scheduleConfig as { messagePool?: unknown }).messagePool;
  if (!raw || typeof raw !== "object") return null;
  const o = raw as { selected?: unknown; custom?: unknown };
  const selected = Array.isArray(o.selected) ? o.selected.filter((s): s is string => typeof s === "string") : undefined;
  const custom = Array.isArray(o.custom)
    ? o.custom
        .filter((c): c is { id?: unknown; text?: unknown; on?: unknown } => !!c && typeof c === "object")
        .map((c) => ({
          id:   typeof c.id === "string" ? c.id : "",
          text: typeof c.text === "string" ? c.text : "",
          on:   c.on !== false,
        }))
        .filter((c) => c.id && c.text.trim())
        .slice(0, MAX_CUSTOM_PHRASES)
    : undefined;
  const agent = Array.isArray((o as { agent?: unknown }).agent)
    ? ((o as { agent: unknown[] }).agent)
        .filter((c): c is { id?: unknown; text?: unknown; on?: unknown } => !!c && typeof c === "object")
        .map((c) => ({
          id:   typeof c.id === "string" ? c.id : "",
          text: typeof c.text === "string" ? c.text : "",
          on:   c.on !== false,
        }))
        .filter((c) => c.id && c.text.trim())
        .slice(0, MAX_AGENT_PHRASES)
    : undefined;
  if (!selected?.length && !custom?.length && !agent?.length) return null;
  return { selected, custom, agent };
}

/**
 * Aplica um patch de pool vindo do PAINEL DO LOJISTA preservando o balde do AGENTE.
 *
 * O painel só conhece dois baldes (`selected` do catálogo e `custom` do lojista) e
 * manda o pool inteiro a cada clique. Como a gravação substitui o objeto, um simples
 * ligar/desligar de frase APAGAVA em silêncio o balde `agent` — as frases que o
 * agente criou e mandou aprovar na Meta, que são o repertório inteiro dele. O
 * lojista nunca veria o que perdeu; o agente perderia a única coisa que tem para
 * otimizar.
 *
 * Regra: o balde `agent` só muda quando o patch traz `agent` EXPLICITAMENTE (é o
 * caminho do próprio agente, em `CrmAgentRepertoireService.commitProposals`). Um
 * patch sem a chave herda o balde existente — inclusive quando o lojista esvazia
 * os dois baldes dele (aí o pool continua existindo, só com o balde do agente).
 *
 * Preservar não é rodar: frase de agente só entra no rodízio com `agentActive`
 * (ver `resolveActivePhrases`/`CrmAgentActivation`). Nada muda no que o cliente
 * recebe hoje.
 */
export function mergeMessagePoolPatch(
  existingScheduleConfig: unknown,
  patchPool: unknown,
): MessagePoolConfig | null {
  const parsedPatch = parseMessagePool({ messagePool: patchPool });
  const patchHasAgentKey =
    !!patchPool && typeof patchPool === "object" && "agent" in (patchPool as Record<string, unknown>);

  const agent = patchHasAgentKey
    ? parsedPatch?.agent
    : parseMessagePool(existingScheduleConfig)?.agent;

  const selected = parsedPatch?.selected;
  const custom   = parsedPatch?.custom;

  if (!selected?.length && !custom?.length && !agent?.length) return null;
  return { selected, custom, agent };
}

/**
 * Every phrase the owner COULD enable: catalog variants + their custom ones.
 * `opts.hasCoupon` appends the prize line to each text (key stays on the base
 * text — see withCouponLine).
 */
export function listPoolCandidates(
  templateId: string | null | undefined,
  pool:       MessagePoolConfig | null,
  opts:       { hasCoupon?: boolean } = {},
): PoolPhrase[] {
  const hasCoupon = opts.hasCoupon ?? false;
  const out: PoolPhrase[] = [];
  const seen = new Set<string>();
  for (const text of templateId ? getReadyMadeMessageVariants(templateId) : []) {
    const key = phraseKey(text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ key, text: withCouponLine(text, hasCoupon), source: "catalog" });
  }
  for (const c of pool?.custom ?? []) {
    const key = phraseKey(c.text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ key, text: withCouponLine(c.text, hasCoupon), source: "custom" });
  }
  // Frases do agente entram nos candidatos SEMPRE (para serem submetidas à Meta),
  // mas a ROTAÇÃO delas é controlada em resolveActivePhrases (parkeadas até ativar).
  for (const c of pool?.agent ?? []) {
    const key = phraseKey(c.text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ key, text: withCouponLine(c.text, hasCoupon), source: "agent" });
  }
  return out;
}

/**
 * O rodízio PADRÃO de uma campanha pronta: as variantes do catálogo do template.
 *
 * Por que existe: `buildReadyMadeCampaignPayload` nunca semeou `messagePool`, e o
 * painel abre marcando só a frase que casa com `campaign.message`. Resultado — toda
 * campanha pronta rodava com UMA frase, o seletor por conversão só liga com mais de
 * uma (`selectorPool.length > 1`) e as 5 redações aprovadas de cada template ficavam
 * paradas no código. Sem repertório não há o que medir nem o que otimizar.
 *
 * A trava de respeito ao lojista: isto só vale enquanto `campaign.message` AINDA é
 * uma das frases do catálogo. Editou a mensagem? O texto dele manda, e o rodízio
 * volta a ser de uma frase — a dele. Nunca troca texto de lojista por texto nosso.
 *
 * Puro: nenhuma escrita, nenhum dado de cliente tocado. Vale igual para campanha
 * nova e para campanha que já existe, porque é decidido na hora do envio.
 */
export function catalogRotation(
  campaign: { templateId: string | null; message: string },
  opts:     { hasCoupon?: boolean } = {},
): PoolPhrase[] {
  const variants = campaign.templateId ? getReadyMadeMessageVariants(campaign.templateId) : [];
  if (variants.length <= 1) return [];

  const msgKey = phraseKey((campaign.message ?? "").trim());
  if (!msgKey) return [];
  // A mensagem da campanha precisa ser uma das do catálogo — senão foi editada.
  if (!variants.some((v) => phraseKey(v) === msgKey)) return [];

  const out: PoolPhrase[] = [];
  const seen = new Set<string>();
  for (const text of variants) {
    const key = phraseKey(text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ key, text: withCouponLine(text, opts.hasCoupon ?? false), source: "catalog" });
  }
  return out;
}

/**
 * The phrases actually rotating for a campaign. Empty pool (or nothing matching
 * the current catalog) falls back to the template's catalog rotation, and only
 * then to campaign.message — a campaign NEVER goes silent because of stale
 * selections.
 */
export function resolveActivePhrases(
  campaign: { templateId: string | null; message: string },
  pool:     MessagePoolConfig | null,
  opts:     { hasCoupon?: boolean; includeAgent?: boolean } = {},
): PoolPhrase[] {
  const active: PoolPhrase[] = [];
  if (pool) {
    const selected = new Set(pool.selected ?? []);
    for (const cand of listPoolCandidates(campaign.templateId, pool, opts)) {
      if (cand.source === "catalog" && selected.has(cand.key)) active.push(cand);
      if (cand.source === "custom") {
        const c = pool.custom?.find((x) => phraseKey(x.text) === cand.key);
        if (c && c.on !== false) active.push(cand);
      }
      // Frases do agente só ROTAM quando a campanha está ativada pro agente
      // (includeAgent). Por padrão ficam ESTACIONADAS — aprovadas na Meta, prontas,
      // mas fora do rodízio — pra não diluir o aprendizado com dados crus.
      if (cand.source === "agent" && opts.includeAgent) {
        const c = pool.agent?.find((x) => phraseKey(x.text) === cand.key);
        if (c && c.on !== false) active.push(cand);
      }
    }
  }
  if (active.length > 0) return active;
  // Campanha que nunca configurou o pool: roda as variantes do catálogo (ver
  // catalogRotation). Decidido no envio, então campanha antiga e nova pegam igual —
  // sem escrever um byte em dado de restaurante.
  const catalog = catalogRotation(campaign, opts);
  if (catalog.length > 0) return catalog;
  const fallback = (campaign.message ?? "").trim();
  return fallback
    ? [{ key: phraseKey(fallback), text: withCouponLine(fallback, opts.hasCoupon ?? false), source: "fallback" }]
    : [];
}

/** Uniform random draw (injectable RNG for tests). */
export function pickPhrase(phrases: PoolPhrase[], rand: () => number = Math.random): PoolPhrase | null {
  if (phrases.length === 0) return null;
  return phrases[Math.min(phrases.length - 1, Math.floor(rand() * phrases.length))] ?? null;
}

/** Per-phrase Meta template mapping stored in audienceConfig.metaTemplates. */
export interface PhraseMetaTemplate {
  name?: string; language?: string; params?: string[];
  /** Exact text last submitted to Meta — lets callers detect a stale template. */
  submittedMessage?: string;
}

export function readPhraseMetaTemplates(audienceConfig: unknown): Record<string, PhraseMetaTemplate> {
  if (!audienceConfig || typeof audienceConfig !== "object") return {};
  const raw = (audienceConfig as { metaTemplates?: unknown }).metaTemplates;
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, PhraseMetaTemplate> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== "object") continue;
    const o = v as PhraseMetaTemplate;
    if (typeof o.name === "string" && o.name) {
      out[k] = {
        name:             o.name,
        language:         typeof o.language === "string" ? o.language : undefined,
        params:           Array.isArray(o.params) ? o.params.map(String) : undefined,
        submittedMessage: typeof o.submittedMessage === "string" ? o.submittedMessage : undefined,
      };
    }
  }
  return out;
}
