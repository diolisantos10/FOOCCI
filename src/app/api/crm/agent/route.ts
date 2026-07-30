/**
 * GET /api/crm/agent — a visão do Agente de CRM.
 *
 * Duas plateias, uma rota:
 *   • lojista (tenant)  → o próprio restaurante, e só o resultado interessa
 *   • admin (?restaurantId=…) → qualquer restaurante, para operar a escada
 *
 * Junta, numa chamada: as frases campeãs que ele descobriu, o ganho projetado
 * (sombra) por campanha, e o estado de ativação de cada campanha. Read-only.
 */

import { NextRequest, NextResponse } from "next/server";
import { resolverEscopoDoAgente } from "@/lib/agent-admin-scope";
import { prisma } from "@/lib/prisma";
import { findChampions } from "@/services/crm/CrmChampionDetector";
import { replayShadow } from "@/services/crm/CrmShadowReplayService";
import { isAgentActive, isAgentGloballyEnabled } from "@/services/crm/CrmAgentActivation";
import { composeBriefing } from "@/services/crm/CrmAgentBriefing";
import { buildWeeklyRecap } from "@/services/crm/CrmWeeklyRecap";
import { buildDailyOverview } from "@/services/crm/CrmDailyOverview";
import { filtrarParaEscada } from "@/services/crm/crmAgentLadderNoise";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const escopo = resolverEscopoDoAgente(req, req.nextUrl.searchParams.get("restaurantId"));
  if (!escopo) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const { restaurantId } = escopo;

  const [globallyEnabled, champions, shadow, campaigns, recap] = await Promise.all([
    isAgentGloballyEnabled(restaurantId).catch(() => true),
    findChampions(restaurantId).catch(() => ({ champions: [] })),
    replayShadow(restaurantId).catch(() => ({ campaigns: [], summary: { campaignsAnalyzed: 0, optimizing: 0, exploring: 0, avgProjectedLiftPct: null } })),
    prisma.campaign
      .findMany({
        where:   { restaurantId },
        select:  { id: true, name: true, scheduleConfig: true, templateId: true, status: true },
        orderBy: { updatedAt: "desc" },
        take:    200,
      })
      .catch(() => [] as Array<{ id: string; name: string; scheduleConfig: unknown; templateId: string | null; status: string }>),
    buildWeeklyRecap(restaurantId).catch(() => null),
  ]);

  // Fora da lista: registros `auto:` do motor de automações e campanhas já
  // encerradas. Interruptor nelas não liga nada — só escondiam as de verdade.
  const { vivas, ocultas } = filtrarParaEscada(campaigns);
  const activation = vivas.map((c) => ({ campaignId: c.id, name: c.name, agentActive: isAgentActive(c.scheduleConfig) }));
  const activeCount = activation.filter((a) => a.agentActive).length;

  // Diário do agente (1º módulo): retrospecto de ontem/semana + próximas ações,
  // derivadas das campeãs e das campanhas otimizando. Read-only.
  const daily = await buildDailyOverview(restaurantId, {
    agentName: "Recado",
    nextActions: {
      champions: champions.champions,
      shadow: shadow.summary,
      activeCount,
      totalCampaigns: activation.length,
    },
  }).catch(() => null);

  // O "recado do agente": só fala quando há algo que se destaca (senão, vazio).
  const briefing = globallyEnabled
    ? composeBriefing({ champions: champions.champions, shadowCampaigns: shadow.campaigns, activation })
    : [];

  return NextResponse.json({
    ok: true,
    globallyEnabled,
    daily,
    recap,
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
    /** Quanto ruído a lista deixou de fora — para o admin não achar que sumiu. */
    ocultas,
  });
}
