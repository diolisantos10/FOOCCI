/**
 * POST /api/cron/prospeccao/pre-voo
 *
 * A CONFERÊNCIA DOS MODELOS LIBERADOS, SOZINHA — sem fila, sem lead, sem enviar nada.
 *
 * O envio real da Sala sorteia entre os modelos que estão APPROVED e liberados
 * para envio. Este endpoint confere exatamente esse conjunto contra a Meta ao
 * vivo, antes de qualquer contato ser consumido.
 *
 * Não monta fila, não materializa lead, não grava mensagem e não chama
 * `abordarLead`. É leitura de banco + Meta. Rodar isto não fala com ninguém.
 *
 * A guarda é a mesma da rodada, e fail-closed: sem `CRON_SECRET`, 503.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { preVooDosModelosLiberados } from "@/services/foocci-sdr/preVooModelosLiberados";
import { canalDeVendasPronto } from "@/services/foocci-sdr/FoocciSalesChannel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function conferirCron(req: NextRequest): { ok: true } | { ok: false; status: 401 | 503; erro: string } {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron/prospeccao/pre-voo] CRON_SECRET não configurado — ausência de segredo é recusa.");
    return { ok: false, status: 503, erro: "CRON_SECRET não configurado" };
  }
  if ((req.headers.get("authorization") ?? "") !== `Bearer ${secret}`) {
    return { ok: false, status: 401, erro: "Unauthorized" };
  }
  return { ok: true };
}

export async function POST(req: NextRequest) {
  const guarda = conferirCron(req);
  if (!guarda.ok) {
    return NextResponse.json({ ok: false, error: guarda.erro }, { status: guarda.status });
  }

  const conferencia = await preVooDosModelosLiberados(prisma);
  const data = {
    canalPronto: canalDeVendasPronto(),
    conferencia,
  };

  console.info("[cron/prospeccao/pre-voo] conferência dos modelos liberados", data);

  return NextResponse.json({ ok: true, data });
}
