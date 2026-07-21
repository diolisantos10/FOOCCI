/**
 * CrmAgentRepertoireService — o agente CRESCENDO o repertório de uma campanha.
 *
 * A sombra mostrou o essencial: hoje cada campanha roda com UMA frase só — não há
 * o que otimizar até existir repertório. Este serviço faz o agente PROPOR frases
 * novas para uma campanha (ancoradas, no tom, passando pelo piso de segurança),
 * até um teto saudável (~8 no rodízio).
 *
 * DISCIPLINA — este serviço é PREVIEW: só PROPÕE e devolve as candidatas. NÃO
 * escreve na campanha, NÃO submete à Meta, NÃO envia. O commit + submissão à Meta
 * é um passo explícito e separado (para rodar sob a escada de governança). Assim
 * dá pra VER o que o agente criaria antes de qualquer efeito.
 */

import { prisma } from "@/lib/prisma";
import { proposePhrase, PHRASE_ANGLES, type ProposePhraseResult } from "@/services/crm/CrmPhraseProposer";
import { parseMessagePool, phraseKey, type CustomPhrase } from "@/services/crm/crmMessagePool";
import { detectSpamLanguage, impliesDiscount } from "@/services/crm/MessageVariationService";
import { provisionPoolTemplates } from "@/services/whatsapp/MetaTemplateProvisionService";

/** Teto de frases ativas por campanha (rodízio saudável p/ o agente aprender rápido). */
export const TARGET_PHRASES_PER_CAMPAIGN = 8;

export interface CampaignProposal {
  campaignId: string;
  name: string;
  objective: string | null;
  existingCount: number;
  target: number;
  proposals: Array<{ phrase: string; clean: boolean; blockedReasons: string[] }>;
  note: string;
  /** Invariantes: preview puro. */
  committed: false;
  submittedToMeta: false;
  sent: false;
}

/** Textos das frases já existentes na campanha (todos os baldes + a mensagem base). */
function existingPhrases(campaign: { message: string | null; scheduleConfig: unknown }): string[] {
  const out: string[] = [];
  const pool = parseMessagePool(campaign.scheduleConfig);
  for (const c of pool?.custom ?? []) if (c.text?.trim()) out.push(c.text.trim());
  for (const c of pool?.agent ?? []) if (c.text?.trim()) out.push(c.text.trim());
  if (campaign.message?.trim()) out.push(campaign.message.trim());
  return [...new Set(out)];
}

export interface ProposeForCampaignInput {
  restaurantId: string;
  campaignId: string;
  /** Quantas frases novas propor (default: preencher até o teto). */
  count?: number;
  /** Frase campeã cujo padrão imitar (aprendizado). */
  winningExample?: string;
}

export async function proposeForCampaign(input: ProposeForCampaignInput): Promise<CampaignProposal | { ok: false; error: string }> {
  const campaign = await prisma.campaign
    .findFirst({
      where: { id: input.campaignId, restaurantId: input.restaurantId },
      select: { id: true, name: true, objective: true, targetSegment: true, couponCode: true, message: true, scheduleConfig: true },
    })
    .catch(() => null);

  if (!campaign) return { ok: false, error: "campanha não encontrada neste restaurante" };

  const existing = existingPhrases(campaign);
  const slotsLeft = Math.max(0, TARGET_PHRASES_PER_CAMPAIGN - existing.length);
  const want = Math.max(0, Math.min(input.count ?? slotsLeft, slotsLeft));

  const objective = campaign.objective ?? campaign.name ?? "reengajar o cliente";
  const hasCoupon = Boolean(campaign.couponCode);

  const proposals: CampaignProposal["proposals"] = [];
  const avoid = [...existing];
  for (let i = 0; i < want; i += 1) {
    const r: ProposePhraseResult = await proposePhrase({
      restaurantId: input.restaurantId,
      objective,
      hasCoupon,
      targetSegment: campaign.targetSegment ?? undefined,
      existingPhrases: avoid,
      winningExample: input.winningExample,
      angle: PHRASE_ANGLES[(existing.length + i) % PHRASE_ANGLES.length], // ângulo distinto por frase
    });
    if (r.phrase) {
      proposals.push({ phrase: r.phrase, clean: r.clean, blockedReasons: r.blockedReasons });
      if (r.clean) avoid.push(r.phrase); // evita repetição entre as próprias propostas
    }
  }

  const note =
    slotsLeft === 0
      ? `campanha já tem ${existing.length} frase(s) — no teto de ${TARGET_PHRASES_PER_CAMPAIGN}`
      : `${existing.length} frase(s) hoje; propondo ${proposals.length} nova(s) até o teto de ${TARGET_PHRASES_PER_CAMPAIGN}`;

  return {
    campaignId: campaign.id,
    name: campaign.name,
    objective: campaign.objective,
    existingCount: existing.length,
    target: TARGET_PHRASES_PER_CAMPAIGN,
    proposals,
    note,
    committed: false,
    submittedToMeta: false,
    sent: false,
  };
}

// ── Grow: propor + commit + submeter, em um passo ───────────────────────────────

export interface GrowResult {
  ok: boolean;
  campaignId: string;
  name?: string;
  proposedClean: number;
  commit: CommitResult | null;
  error?: string;
}

/** Propõe frases novas p/ a campanha e já submete as limpas à Meta. Nunca envia. */
export async function growAndSubmit(input: ProposeForCampaignInput): Promise<GrowResult> {
  const proposal = await proposeForCampaign(input);
  if ("ok" in proposal && proposal.ok === false) {
    return { ok: false, campaignId: input.campaignId, proposedClean: 0, commit: null, error: proposal.error };
  }
  const p = proposal as CampaignProposal;
  const clean = p.proposals.filter((x) => x.clean).map((x) => x.phrase);
  if (clean.length === 0) {
    return { ok: true, campaignId: p.campaignId, name: p.name, proposedClean: 0, commit: null };
  }
  const commit = await commitProposals(input.restaurantId, input.campaignId, clean);
  return { ok: commit.ok, campaignId: p.campaignId, name: p.name, proposedClean: clean.length, commit };
}

// ── Commit + submissão à Meta ────────────────────────────────────────────────────

export interface CommitResult {
  ok: boolean;
  campaignId: string;
  added: string[];
  skipped: Array<{ phrase: string; reason: string }>;
  poolAgentCount: number;
  meta: { created: number; existed: number; failed: number } | null;
  note: string;
  sent: false; // invariante: adicionar ao pool + submeter à Meta NUNCA envia ao cliente
}

/** Piso de segurança reaplicado no commit (defesa em profundidade). */
function screenClean(phrase: string, hasCoupon: boolean): string | null {
  const t = phrase.trim();
  if (!t) return "vazia";
  if (detectSpamLanguage(t).length) return "linguagem inadequada";
  if (!hasCoupon && impliesDiscount(t)) return "desconto sem cupom";
  return null;
}

/**
 * Adiciona frases (limpas) ao pool da campanha e SUBMETE à Meta pra aprovação.
 * Nunca envia ao cliente — a frase só roda depois que a Meta aprovar (e sob as
 * travas de segurança). Idempotente: mesma frase = mesmo id (fingerprint), sem duplicar.
 */
export async function commitProposals(
  restaurantId: string,
  campaignId: string,
  phrases: string[],
): Promise<CommitResult> {
  const campaign = await prisma.campaign
    .findFirst({
      where: { id: campaignId, restaurantId },
      select: { id: true, couponCode: true, scheduleConfig: true },
    })
    .catch(() => null);

  if (!campaign) {
    return { ok: false, campaignId, added: [], skipped: [], poolAgentCount: 0, meta: null, note: "campanha não encontrada", sent: false };
  }

  const hasCoupon = Boolean(campaign.couponCode);
  const pool = parseMessagePool(campaign.scheduleConfig) ?? {};
  // Balde do AGENTE (separado das 5 do lojista, que ficam intocadas).
  const agentPhrases: CustomPhrase[] = [...(pool.agent ?? [])];
  // Dedupe contra TODOS os baldes (não repetir o que já existe em qualquer lugar).
  const existingKeys = new Set(
    [...(pool.custom ?? []), ...agentPhrases].map((c) => phraseKey(c.text)),
  );

  const added: string[] = [];
  const skipped: Array<{ phrase: string; reason: string }> = [];
  for (const p of phrases) {
    const bad = screenClean(p, hasCoupon);
    if (bad) { skipped.push({ phrase: p, reason: bad }); continue; }
    const key = phraseKey(p.trim());
    if (existingKeys.has(key)) { skipped.push({ phrase: p, reason: "já existe no pool" }); continue; }
    existingKeys.add(key);
    agentPhrases.push({ id: key, text: p.trim(), on: true });
    added.push(p.trim());
  }

  if (added.length === 0) {
    return { ok: true, campaignId, added: [], skipped, poolAgentCount: agentPhrases.length, meta: null, note: "nada novo a adicionar", sent: false };
  }

  // Preserva o resto do scheduleConfig E as 5 do lojista; só cresce o balde do agente.
  const baseConfig = (campaign.scheduleConfig && typeof campaign.scheduleConfig === "object")
    ? (campaign.scheduleConfig as Record<string, unknown>)
    : {};
  const nextConfig = { ...baseConfig, messagePool: { ...(pool ?? {}), agent: agentPhrases } };

  await prisma.campaign.update({ where: { id: campaignId }, data: { scheduleConfig: nextConfig as never } });

  // Submete o pool (novas frases inclusas) pra aprovação da Meta.
  const prov = await provisionPoolTemplates(restaurantId, campaignId).catch(() => null);

  return {
    ok: true,
    campaignId,
    added,
    skipped,
    poolAgentCount: agentPhrases.length,
    meta: prov ? { created: prov.created, existed: prov.existed, failed: prov.failed } : null,
    note: `+${added.length} frase(s) no pool; submetidas à Meta (aprovação pendente). Só rodam após aprovadas.`,
    sent: false,
  };
}
