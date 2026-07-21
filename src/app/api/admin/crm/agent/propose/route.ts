/**
 * POST /api/admin/crm/agent/propose  { restaurantId, campaignId, count?, winningExample? }
 *
 * PREVIEW: o Agente de CRM propõe frases novas para uma campanha (ancoradas, no
 * tom, passando pelo piso de segurança). NÃO escreve na campanha, NÃO submete à
 * Meta, NÃO envia — só devolve as candidatas pra você VER antes de qualquer efeito.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { proposeForCampaign } from "@/services/crm/CrmAgentRepertoireService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 200;

export async function POST(req: NextRequest) {
  if (!process.env.ADMIN_SECRET) {
    return NextResponse.json({ ok: false, error: "ADMIN_SECRET não configurado." }, { status: 403 });
  }
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    restaurantId?: string; campaignId?: string; count?: number; winningExample?: string;
  };
  if (!body.restaurantId || !body.campaignId) {
    return NextResponse.json({ ok: false, error: "restaurantId e campaignId são obrigatórios." }, { status: 400 });
  }
  const result = await proposeForCampaign({
    restaurantId: body.restaurantId,
    campaignId: body.campaignId,
    count: body.count,
    winningExample: body.winningExample,
  });
  return NextResponse.json({ ok: !("ok" in result && result.ok === false), ...result });
}
