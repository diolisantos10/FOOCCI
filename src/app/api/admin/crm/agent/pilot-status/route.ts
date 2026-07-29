/**
 * GET /api/admin/crm/agent/pilot-status?restaurantId=..&dias=30
 *
 * O relatório do piloto do Agente de CRM: em que degrau da escada o restaurante
 * está, se os portões passam, e o que a prova A/B diz — com o veredito de SE JÁ
 * DÁ PARA CONCLUIR alguma coisa.
 *
 * Read-only. Este endpoint NÃO promove: a promoção continua sendo uma chamada
 * separada, com confirm explícito e reconhecimento de clientes reais. Aqui é só
 * a leitura que precede a decisão.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { observarPiloto } from "@/services/crm/CrmPilotObservability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  if (!checkAdminRequest(req)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const restaurantId = req.nextUrl.searchParams.get("restaurantId");
  if (!restaurantId) return NextResponse.json({ ok: false, error: "restaurantId é obrigatório." }, { status: 400 });

  const diasCru = Number(req.nextUrl.searchParams.get("dias"));
  const dias = Number.isFinite(diasCru) && diasCru > 0 ? Math.min(diasCru, 365) : null;
  const desde = dias ? new Date(Date.now() - dias * 24 * 60 * 60 * 1000) : undefined;

  try {
    const relatorio = await observarPiloto(restaurantId, desde);
    return NextResponse.json({ ok: true, ...relatorio });
  } catch (err) {
    console.error("[GET /api/admin/crm/agent/pilot-status]", err);
    return NextResponse.json({ ok: false, error: "Falha ao ler o piloto." }, { status: 500 });
  }
}
