/**
 * Interruptor de ativação do Agente de CRM (a escada, por campanha).
 *
 * GET  ?restaurantId=..            → master switch + campanhas vivas (sem ruído
 *                                    auto:/encerradas) + se o agente está ativo em cada
 * POST { restaurantId, campaignId, active }  → liga/desliga numa campanha
 * POST { restaurantId, masterEnabled }       → liga/desliga a inteligência inteira
 * POST { restaurantId, panic:true }          → BOTÃO DE PÂNICO: desliga em TODAS
 *
 * Desligado (padrão) = agente em modo aprendiz; frases dele ficam estacionadas.
 *
 * Nota de arquitetura: a rota tenant (/api/crm/agent/activation) faz o mesmo
 * para o lojista, mas ela mora atrás do middleware de NextAuth — o cookie de
 * admin não passa por lá. Por isso a casa do agente consome ESTA rota, que
 * chama os MESMOS serviços (nenhuma mecânica duplicada).
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import {
  isAgentActive,
  isAgentGloballyEnabled,
  setAgentActive,
  setAgentGloballyEnabled,
  panicDisableAll,
} from "@/services/crm/CrmAgentActivation";
import { filtrarParaEscada } from "@/services/crm/crmAgentLadderNoise";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!checkAdminRequest(req)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const restaurantId = req.nextUrl.searchParams.get("restaurantId");
  if (!restaurantId) return NextResponse.json({ ok: false, error: "restaurantId é obrigatório." }, { status: 400 });

  const [globallyEnabled, campaigns] = await Promise.all([
    isAgentGloballyEnabled(restaurantId).catch(() => true),
    prisma.campaign
      .findMany({
        where: { restaurantId },
        select: { id: true, name: true, scheduleConfig: true, templateId: true, status: true },
        orderBy: { updatedAt: "desc" },
        take: 100,
      })
      .catch(() => [] as Array<{ id: string; name: string; scheduleConfig: unknown; templateId: string | null; status: string }>),
  ]);

  // Mesmo filtro da visão do lojista: registros `auto:` e campanhas encerradas
  // ficam de fora — interruptor nelas não liga nada.
  const { vivas, ocultas } = filtrarParaEscada(campaigns);
  const rows = vivas.map((c) => ({ campaignId: c.id, name: c.name, agentActive: isAgentActive(c.scheduleConfig) }));
  return NextResponse.json({
    ok: true,
    restaurantId,
    globallyEnabled,
    activeCount: rows.filter((r) => r.agentActive).length,
    ocultas,
    campaigns: rows,
  });
}

export async function POST(req: NextRequest) {
  if (!checkAdminRequest(req)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as {
    restaurantId?: string; campaignId?: string; active?: boolean; panic?: boolean; masterEnabled?: boolean;
  };
  if (!body.restaurantId) return NextResponse.json({ ok: false, error: "restaurantId é obrigatório." }, { status: 400 });

  if (body.panic === true) {
    const r = await panicDisableAll(body.restaurantId);
    return NextResponse.json({ ok: true, panic: true, disabled: r.disabled });
  }
  if (typeof body.masterEnabled === "boolean") {
    const r = await setAgentGloballyEnabled(body.restaurantId, body.masterEnabled);
    return NextResponse.json(r, { status: r.ok ? 200 : 404 });
  }
  if (!body.campaignId || typeof body.active !== "boolean") {
    return NextResponse.json({ ok: false, error: "campaignId e active (boolean) são obrigatórios." }, { status: 400 });
  }
  const r = await setAgentActive(body.restaurantId, body.campaignId, body.active);
  return NextResponse.json(r, { status: r.ok ? 200 : 404 });
}
