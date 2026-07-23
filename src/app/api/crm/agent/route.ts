/**
 * GET /api/crm/agent — visão do Agente de CRM para o painel do lojista (tenant).
 *
 * Junta, numa chamada: as frases campeãs que ele descobriu, o ganho projetado
 * (sombra) por campanha, e o estado de ativação de cada campanha. Read-only.
 */

import { NextResponse } from "next/server";
import { getTenantId } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { findChampions } from "@/services/crm/CrmChampionDetector";
import { replayShadow } from "@/services/crm/CrmShadowReplayService";
import { isAgentActive } from "@/services/crm/CrmAgentActivation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET() {
  let restaurantId: string;
  try { restaurantId = getTenantId(); }
  catch { return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 }); }

  const [champions, shadow, campaigns] = await Promise.all([
    findChampions(restaurantId).catch(() => ({ champions: [] })),
    replayShadow(restaurantId).catch(() => ({ campaigns: [], summary: { campaignsAnalyzed: 0, optimizing: 0, exploring: 0, avgProjectedLiftPct: null } })),
    prisma.campaign
      .findMany({ where: { restaurantId }, select: { id: true, name: true, scheduleConfig: true }, orderBy: { updatedAt: "desc" }, take: 100 })
      .catch(() => [] as Array<{ id: string; name: string; scheduleConfig: unknown }>),
  ]);

  const activation = campaigns.map((c) => ({ campaignId: c.id, name: c.name, agentActive: isAgentActive(c.scheduleConfig) }));
  const activeCount = activation.filter((a) => a.agentActive).length;

  return NextResponse.json({
    ok: true,
    status: {
      mode: activeCount > 0 ? "ATIVO" : "APRENDIZ",
      activeCampaigns: activeCount,
      totalCampaigns: activation.length,
      championsFound: champions.champions.length,
    },
    champions: champions.champions,
    shadow: shadow.summary,
    shadowCampaigns: shadow.campaigns,
    activation,
  });
}
