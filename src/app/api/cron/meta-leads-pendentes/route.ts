/**
 * POST /api/cron/meta-leads-pendentes
 *
 * A SEGUNDA CHANCE DO LEAD QUE A GRAPH NÃO ENTREGOU.
 *
 * O webhook `leadgen` responde 200 para a Meta e, quando a busca na Graph
 * falha, grava o `leadgen_id` em `meta_lead_pendentes`. Sem esta rodada, esse
 * registro seria só um obituário bem escrito: a Meta considera entregue e nunca
 * reenvia. É aqui que o pendente vira lead quando o token aparece ou a Graph
 * volta.
 *
 * **Fail-closed:** sem `CRON_SECRET`, 503 e nada roda.
 */

import { NextRequest, NextResponse } from "next/server";
import { reprocessarLeadsPendentes } from "@/services/meta-leads/recepcaoDoLeadgen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo) {
    console.error("[cron/meta-leads-pendentes] CRON_SECRET não configurado — a rodada NÃO roda.");
    return NextResponse.json({ erro: "CRON_SECRET não configurado" }, { status: 503 });
  }
  if ((req.headers.get("authorization") ?? "") !== `Bearer ${segredo}`) {
    return NextResponse.json({ erro: "Unauthorized" }, { status: 401 });
  }

  try {
    const r = await reprocessarLeadsPendentes({});
    if (r.aindaPendentes > 0) {
      console.error(`[cron/meta-leads-pendentes] ${r.aindaPendentes} lead(s) pago(s) continuam sem entrar no Foocci`);
    }
    return NextResponse.json({ ok: true, ...r });
  } catch (err) {
    console.error("[cron/meta-leads-pendentes] falha na rodada", err);
    return NextResponse.json({ erro: "falha na rodada" }, { status: 500 });
  }
}
