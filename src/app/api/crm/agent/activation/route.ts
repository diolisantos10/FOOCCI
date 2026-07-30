/**
 * POST /api/crm/agent/activation — os controles da escada do Agente.
 *
 * Estes controles vivem no ADMIN, não no painel do lojista: ligar o agente numa
 * campanha é decisão de operação do produto, não do dono do restaurante — que
 * vê o resultado e não precisa carregar o interruptor.
 *
 *   { campaignId, active }     → liga/desliga numa campanha
 *   { masterEnabled }          → liga/desliga a inteligência no restaurante
 *   { panic: true }            → BOTÃO DE PÂNICO: desliga em todas
 *   { restaurantId }           → só admin: escolhe de quem é o restaurante
 */

import { NextRequest, NextResponse } from "next/server";
import { resolverEscopoDoAgente } from "@/lib/agent-admin-scope";
import { setAgentActive, panicDisableAll, setAgentGloballyEnabled } from "@/services/crm/CrmAgentActivation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    campaignId?: string; active?: boolean; panic?: boolean;
    masterEnabled?: boolean; restaurantId?: string;
  };

  const escopo = resolverEscopoDoAgente(req, body.restaurantId);
  if (!escopo) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const { restaurantId } = escopo;

  // Master switch: liga/desliga o agente no restaurante inteiro (CRM na mão).
  if (typeof body.masterEnabled === "boolean") {
    const r = await setAgentGloballyEnabled(restaurantId, body.masterEnabled);
    return NextResponse.json(r);
  }
  if (body.panic === true) {
    const r = await panicDisableAll(restaurantId);
    return NextResponse.json({ ok: true, panic: true, disabled: r.disabled });
  }
  if (!body.campaignId || typeof body.active !== "boolean") {
    return NextResponse.json({ ok: false, error: "campaignId e active (boolean) são obrigatórios." }, { status: 400 });
  }
  const r = await setAgentActive(restaurantId, body.campaignId, body.active);
  return NextResponse.json(r, { status: r.ok ? 200 : 404 });
}
