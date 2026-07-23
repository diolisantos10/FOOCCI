/**
 * POST /api/crm/agent/activation — liga/desliga o Agente numa campanha (tenant).
 *   { campaignId, active }  → liga/desliga
 *   { panic: true }         → BOTÃO DE PÂNICO: desliga em todas
 */

import { NextRequest, NextResponse } from "next/server";
import { getTenantId } from "@/lib/tenant";
import { setAgentActive, panicDisableAll, setAgentGloballyEnabled } from "@/services/crm/CrmAgentActivation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let restaurantId: string;
  try { restaurantId = getTenantId(); }
  catch { return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 }); }

  const body = (await req.json().catch(() => ({}))) as { campaignId?: string; active?: boolean; panic?: boolean; masterEnabled?: boolean };

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
