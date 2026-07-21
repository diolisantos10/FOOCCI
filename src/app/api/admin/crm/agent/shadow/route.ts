/**
 * GET /api/admin/crm/agent/shadow?restaurantId=..&maxCampaigns=N
 *
 * A "sombra" do Agente de CRM: mostra, em cada campanha real, o que o agente
 * ponderaria e o ganho projetado sobre o sorteio uniforme atual — usando a
 * conversão já medida por frase. Read-only, não envia nada.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { replayShadow } from "@/services/crm/CrmShadowReplayService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const restaurantId = req.nextUrl.searchParams.get("restaurantId");
  if (!restaurantId) {
    return NextResponse.json({ ok: false, error: "restaurantId é obrigatório." }, { status: 400 });
  }
  const maxCampaigns = Number(req.nextUrl.searchParams.get("maxCampaigns") ?? 30);
  const result = await replayShadow(restaurantId, { maxCampaigns });
  return NextResponse.json(result);
}
