/**
 * Interruptor de ativação do Agente de CRM (a escada, por campanha).
 *
 * GET  ?restaurantId=..            → lista campanhas + se o agente está ativo em cada
 * POST { restaurantId, campaignId, active }  → liga/desliga numa campanha
 * POST { restaurantId, panic:true }          → BOTÃO DE PÂNICO: desliga em TODAS
 *
 * Desligado (padrão) = agente em modo aprendiz; frases dele ficam estacionadas.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { isAgentActive, setAgentActive, panicDisableAll } from "@/services/crm/CrmAgentActivation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!checkAdminRequest(req)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const restaurantId = req.nextUrl.searchParams.get("restaurantId");
  if (!restaurantId) return NextResponse.json({ ok: false, error: "restaurantId é obrigatório." }, { status: 400 });

  const campaigns = await prisma.campaign
    .findMany({ where: { restaurantId }, select: { id: true, name: true, scheduleConfig: true }, orderBy: { updatedAt: "desc" }, take: 100 })
    .catch(() => [] as Array<{ id: string; name: string; scheduleConfig: unknown }>);
  const rows = campaigns.map((c) => ({ campaignId: c.id, name: c.name, agentActive: isAgentActive(c.scheduleConfig) }));
  return NextResponse.json({ ok: true, restaurantId, activeCount: rows.filter((r) => r.agentActive).length, campaigns: rows });
}

export async function POST(req: NextRequest) {
  if (!checkAdminRequest(req)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { restaurantId?: string; campaignId?: string; active?: boolean; panic?: boolean };
  if (!body.restaurantId) return NextResponse.json({ ok: false, error: "restaurantId é obrigatório." }, { status: 400 });

  if (body.panic === true) {
    const r = await panicDisableAll(body.restaurantId);
    return NextResponse.json({ ok: true, panic: true, disabled: r.disabled });
  }
  if (!body.campaignId || typeof body.active !== "boolean") {
    return NextResponse.json({ ok: false, error: "campaignId e active (boolean) são obrigatórios." }, { status: 400 });
  }
  const r = await setAgentActive(body.restaurantId, body.campaignId, body.active);
  return NextResponse.json(r, { status: r.ok ? 200 : 404 });
}
