/**
 * CrmChampionDetector — o agente DESCOBRE sozinho a "frase campeã".
 *
 * Varre as conversões já medidas por frase (variantKey) e acha as que convertem
 * MUITO acima da média da campanha — com amostra suficiente pra ser confiável.
 * Devolve o TEXTO da campeã, que alimenta o proponente (CrmPhraseProposer.winningExample)
 * pra criar variações no MESMO padrão do que comprovadamente funciona.
 *
 * Read-only: não envia, não escreve, não toca runtime. Fecha o laço de aprendizado
 * ("copia e renova o repertório") de forma AUTOMÁTICA — venha a campeã do lojista,
 * do catálogo ou do próprio agente.
 */

import { prisma } from "@/lib/prisma";
import { listPoolCandidates, parseMessagePool, phraseKey } from "@/services/crm/crmMessagePool";
import { MIN_SENDS_TO_JUDGE_PHRASE } from "@/services/crm/CrmPhraseSelector";

const SENT_STATUSES = ["SENT", "DELIVERED", "READ"] as const;
/** A campeã precisa converter pelo menos isto acima da média da campanha. */
export const CHAMPION_LIFT_MULTIPLIER = 1.4;

function smoothedRate(sent: number, converted: number): number {
  return (converted + 1) / (sent + 2);
}

export interface Champion {
  campaignId: string;
  campaignName: string;
  phrase: string; // TEXTO da campeã (o que o proponente imita)
  sent: number;
  converted: number;
  rate: number;
  campaignAvgRate: number;
  liftVsAvg: number; // quantas vezes acima da média (ex.: 1.8 = 80% acima)
}

export interface ChampionResult {
  ok: boolean;
  restaurantId: string;
  champions: Champion[];
  scanned: number;
  runtimeTouched: false;
}

/** Mapa variantKey → texto da frase (do pool + a mensagem base). */
function textByKey(campaign: { templateId: string | null; message: string | null; scheduleConfig: unknown }): Map<string, string> {
  const map = new Map<string, string>();
  for (const cand of listPoolCandidates(campaign.templateId, parseMessagePool(campaign.scheduleConfig))) {
    map.set(cand.key, cand.text);
  }
  if (campaign.message?.trim()) map.set(phraseKey(campaign.message.trim()), campaign.message.trim());
  return map;
}

async function statsFor(campaignId: string): Promise<Map<string, { sent: number; converted: number }>> {
  const [sentAgg, convAgg] = await Promise.all([
    prisma.campaignExecution.groupBy({
      by: ["variantKey"],
      where: { campaignId, status: { in: [...SENT_STATUSES] }, variantKey: { not: null } },
      _count: { _all: true },
    }).catch(() => [] as Array<{ variantKey: string | null; _count: { _all: number } }>),
    prisma.campaignExecution.groupBy({
      by: ["variantKey"],
      where: { campaignId, converted: true, variantKey: { not: null } },
      _count: { _all: true },
    }).catch(() => [] as Array<{ variantKey: string | null; _count: { _all: number } }>),
  ]);
  const conv = new Map(convAgg.map((c) => [c.variantKey, c._count._all]));
  const out = new Map<string, { sent: number; converted: number }>();
  for (const s of sentAgg) {
    if (!s.variantKey) continue;
    out.set(s.variantKey, { sent: s._count._all, converted: conv.get(s.variantKey) ?? 0 });
  }
  return out;
}

interface CampaignForChampion { id: string; name: string; templateId: string | null; message: string | null; scheduleConfig: unknown }

/** A campeã de UMA campanha (ou null). Reutilizado pelo proponente p/ aprender sozinho. */
export async function championOfCampaign(campaign: CampaignForChampion): Promise<Champion | null> {
  const stats = await statsFor(campaign.id);
  const keys = [...stats.keys()];
  if (keys.length < 2) return null; // sem alternativa, não há "campeã"

  const rates = keys.map((k) => {
    const s = stats.get(k)!;
    return { key: k, sent: s.sent, converted: s.converted, rate: smoothedRate(s.sent, s.converted) };
  });
  const avg = rates.reduce((sum, r) => sum + r.rate, 0) / rates.length;

  const best = rates
    .filter((r) => r.sent >= MIN_SENDS_TO_JUDGE_PHRASE && r.rate >= avg * CHAMPION_LIFT_MULTIPLIER)
    .sort((a, b) => b.rate - a.rate)[0];
  if (!best) return null;

  const text = textByKey(campaign).get(best.key);
  if (!text) return null;

  return {
    campaignId: campaign.id,
    campaignName: campaign.name,
    phrase: text,
    sent: best.sent,
    converted: best.converted,
    rate: Number(best.rate.toFixed(4)),
    campaignAvgRate: Number(avg.toFixed(4)),
    liftVsAvg: Number((best.rate / (avg || 1)).toFixed(2)),
  };
}

/** Acha as frases campeãs do restaurante (uma por campanha, quando houver). */
export async function findChampions(restaurantId: string, opts: { maxCampaigns?: number } = {}): Promise<ChampionResult> {
  const max = Math.min(Math.max(opts.maxCampaigns ?? 50, 1), 100);
  const campaigns = await prisma.campaign
    .findMany({
      where: { restaurantId, totalSent: { gt: 0 } },
      select: { id: true, name: true, templateId: true, message: true, scheduleConfig: true },
      orderBy: { updatedAt: "desc" },
      take: max,
    })
    .catch(() => [] as CampaignForChampion[]);

  const champions: Champion[] = [];
  for (const c of campaigns) {
    const champ = await championOfCampaign(c);
    if (champ) champions.push(champ);
  }

  champions.sort((a, b) => b.liftVsAvg - a.liftVsAvg);
  return { ok: true, restaurantId, champions, scanned: campaigns.length, runtimeTouched: false };
}
