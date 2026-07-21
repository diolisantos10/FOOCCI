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
import { proposePhrase, type ProposePhraseResult } from "@/services/crm/CrmPhraseProposer";
import { parseMessagePool } from "@/services/crm/crmMessagePool";

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

/** Textos das frases já ativas na campanha (pool + a mensagem base). */
function existingPhrases(campaign: { message: string | null; scheduleConfig: unknown }): string[] {
  const out: string[] = [];
  const pool = parseMessagePool(campaign.scheduleConfig);
  for (const c of pool?.custom ?? []) if (c.text?.trim()) out.push(c.text.trim());
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
