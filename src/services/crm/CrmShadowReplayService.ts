/**
 * CrmShadowReplayService — a "sombra" do Agente de CRM, sem tocar no envio.
 *
 * Usa a conversão JÁ MEDIDA por frase (variantKey em CampaignExecution) para
 * mostrar, em cada campanha real:
 *   • como o agente PONDERARIA as frases (via CrmPhraseSelector),
 *   • a taxa esperada HOJE (sorteio uniforme) vs a taxa esperada COM o agente,
 *   • o ganho projetado — e se ainda está EXPLORANDO (dados de menos) ou OTIMIZANDO.
 *
 * 100% read-only: não envia, não escreve, não muda o que a campanha faz. É a prova
 * de valor que destrava a subida da escada (allowlist → geral).
 */

import { prisma } from "@/lib/prisma";
import { selectPhraseWeights, type PhraseStat } from "@/services/crm/CrmPhraseSelector";

const SENT_STATUSES = ["SENT", "DELIVERED", "READ"] as const;

function smoothedRate(sent: number, converted: number): number {
  return (converted + 1) / (sent + 2);
}

export interface CampaignShadow {
  campaignId: string;
  name: string;
  phrases: number;
  totalSent: number;
  mode: "EXPLORING" | "OPTIMIZING";
  currentRate: number; // taxa esperada hoje (sorteio uniforme)
  agentRate: number; // taxa esperada com o agente
  projectedLiftPct: number | null; // ganho % (null quando sem base p/ comparar)
  note: string;
}

export interface ShadowReplayResult {
  ok: boolean;
  restaurantId: string;
  campaigns: CampaignShadow[];
  summary: {
    campaignsAnalyzed: number;
    optimizing: number;
    exploring: number;
    avgProjectedLiftPct: number | null;
  };
  runtimeTouched: false;
}

/** Estatística sent/converted por frase (variantKey) de uma campanha. */
async function statsForCampaign(campaignId: string): Promise<PhraseStat[]> {
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
  const out: PhraseStat[] = [];
  for (const s of sentAgg) {
    if (!s.variantKey) continue;
    out.push({ key: s.variantKey, sent: s._count._all, converted: conv.get(s.variantKey) ?? 0 });
  }
  return out;
}

/**
 * Roda a sombra sobre as campanhas do restaurante (as mais recentes com envios).
 */
export async function replayShadow(restaurantId: string, opts: { maxCampaigns?: number } = {}): Promise<ShadowReplayResult> {
  const max = Math.min(Math.max(opts.maxCampaigns ?? 30, 1), 100);

  const campaigns = await prisma.campaign
    .findMany({
      where: { restaurantId, totalSent: { gt: 0 } },
      select: { id: true, name: true },
      orderBy: { updatedAt: "desc" },
      take: max,
    })
    .catch(() => [] as Array<{ id: string; name: string }>);

  const rows: CampaignShadow[] = [];
  for (const c of campaigns) {
    const stats = await statsForCampaign(c.id);
    const keys = stats.map((s) => s.key);
    if (keys.length === 0) continue;

    const totalSent = stats.reduce((sum, s) => sum + s.sent, 0);
    const sel = selectPhraseWeights(keys, stats);

    // taxa esperada HOJE = sorteio uniforme (média das taxas por frase).
    const rateByKey = new Map(stats.map((s) => [s.key, smoothedRate(s.sent, s.converted)]));
    const currentRate = keys.reduce((sum, k) => sum + (rateByKey.get(k) ?? 0), 0) / keys.length;
    // taxa esperada COM o agente = soma ponderada pelos pesos do agente.
    const agentRate = sel.weights.reduce((sum, w) => sum + w.weight * (rateByKey.get(w.key) ?? 0), 0);

    const projectedLiftPct =
      sel.mode === "OPTIMIZING" && currentRate > 0
        ? Number((((agentRate - currentRate) / currentRate) * 100).toFixed(1))
        : null;

    rows.push({
      campaignId: c.id,
      name: c.name,
      phrases: keys.length,
      totalSent,
      mode: sel.mode,
      currentRate: Number(currentRate.toFixed(4)),
      agentRate: Number(agentRate.toFixed(4)),
      projectedLiftPct,
      note: sel.reason,
    });
  }

  const optimizing = rows.filter((r) => r.mode === "OPTIMIZING");
  const lifts = optimizing.map((r) => r.projectedLiftPct).filter((x): x is number => x !== null);
  const avgProjectedLiftPct = lifts.length
    ? Number((lifts.reduce((a, b) => a + b, 0) / lifts.length).toFixed(1))
    : null;

  return {
    ok: true,
    restaurantId,
    campaigns: rows,
    summary: {
      campaignsAnalyzed: rows.length,
      optimizing: optimizing.length,
      exploring: rows.length - optimizing.length,
      avgProjectedLiftPct,
    },
    runtimeTouched: false,
  };
}
