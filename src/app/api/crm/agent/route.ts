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
import { isAgentActive, isAgentGloballyEnabled } from "@/services/crm/CrmAgentActivation";
import { composeBriefing } from "@/services/crm/CrmAgentBriefing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET() {
  let restaurantId: string;
  try { restaurantId = getTenantId(); }
  catch { return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 }); }

  const [globallyEnabled, champions, shadow, campaigns] = await Promise.all([
    isAgentGloballyEnabled(restaurantId).catch(() => true),
    findChampions(restaurantId).catch(() => ({ champions: [] })),
    replayShadow(restaurantId).catch(() => ({ campaigns: [], summary: { campaignsAnalyzed: 0, optimizing: 0, exploring: 0, avgProjectedLiftPct: null } })),
    prisma.campaign
      .findMany({ where: { restaurantId }, select: { id: true, name: true, scheduleConfig: true }, orderBy: { updatedAt: "desc" }, take: 100 })
      .catch(() => [] as Array<{ id: string; name: string; scheduleConfig: unknown }>),
  ]);

  const activation = campaigns.map((c) => ({ campaignId: c.id, name: c.name, agentActive: isAgentActive(c.scheduleConfig) }));
  const activeCount = activation.filter((a) => a.agentActive).length;

  // O "recado do agente": só fala quando há algo que se destaca (senão, vazio).
  const briefing = globallyEnabled
    ? composeBriefing({ champions: champions.champions, shadowCampaigns: shadow.campaigns, activation })
    : [];

  return NextResponse.json({
    ok: true,
    globallyEnabled,
    briefing,
    status: {
      mode: !globallyEnabled ? "DESLIGADO" : activeCount > 0 ? "ATIVO" : "APRENDIZ",
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
