/**
 * POST /api/admin/crm/agent/commit  { restaurantId, campaignId, count?, winningExample?, confirm:true }
 *
 * O Agente cria frases novas e AS SUBMETE À META pra aprovação (cresce o
 * repertório da campanha). Exige confirm:true. NUNCA envia ao cliente — a frase
 * só passa a rodar depois que a Meta aprovar e sob as travas de segurança.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { growAndSubmit } from "@/services/crm/CrmAgentRepertoireService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 250;

export async function POST(req: NextRequest) {
  if (!process.env.ADMIN_SECRET) {
    return NextResponse.json({ ok: false, error: "ADMIN_SECRET não configurado." }, { status: 403 });
  }
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    restaurantId?: string; campaignId?: string; count?: number; winningExample?: string; confirm?: boolean;
  };
  if (!body.restaurantId || !body.campaignId) {
    return NextResponse.json({ ok: false, error: "restaurantId e campaignId são obrigatórios." }, { status: 400 });
  }
  if (body.confirm !== true) {
    return NextResponse.json({ ok: false, error: "confirm:true é obrigatório (esta ação submete à Meta)." }, { status: 400 });
  }
  const result = await growAndSubmit({
    restaurantId: body.restaurantId,
    campaignId: body.campaignId,
    count: body.count,
    winningExample: body.winningExample,
  });
  return NextResponse.json(result);
}
