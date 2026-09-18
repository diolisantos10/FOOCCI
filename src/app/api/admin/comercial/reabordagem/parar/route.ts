/**
 * POST /api/admin/comercial/reabordagem/parar        → PARA TUDO, agora.
 * POST /api/admin/comercial/reabordagem/parar?retomar=1 → solta o freio.
 *
 * ⛔ O INTERRUPTOR DE PÂNICO.
 *
 * A parada é lida do banco ANTES DE CADA CONTATO, e não uma vez por lote — por
 * isso ela funciona com lote em andamento: o lote para na pessoa seguinte, não
 * no fim. Ver `reabordagem/interruptor.ts`.
 *
 * ⚠️ Retomar é ATO SEPARADO. Se disparar um lote soltasse o freio sozinho, o
 * interruptor duraria até o próximo disparo distraído.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { CABECALHO_DO_SEGREDO, conferirSegredo } from "@/services/salaDeVendas/reabordagem/guarda";
import { conferirInterruptor, pararTudo, retomar } from "@/services/salaDeVendas/reabordagem/interruptor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const guarda = conferirSegredo({
    proprio: req.headers.get(CABECALHO_DO_SEGREDO),
    authorization: req.headers.get("authorization"),
  });
  if (!guarda.ok) {
    return NextResponse.json({ ok: false, error: guarda.motivo }, { status: guarda.status });
  }

  const q = req.nextUrl.searchParams;
  // Retomar exige o valor EXATO "1". Qualquer outra coisa é PARAR — o lado
  // seguro de um interruptor de pânico é estar puxado.
  const querRetomar = q.get("retomar") === "1";
  const quem = (q.get("quem") ?? "comando administrativo").slice(0, 200);

  try {
    if (querRetomar) {
      await retomar(prisma, { quemRetomou: quem });
      return NextResponse.json({ ok: true, data: await conferirInterruptor(prisma) });
    }

    const motivo = (q.get("motivo") ?? "parada pedida pelo comando").slice(0, 500);
    const r = await pararTudo(prisma, { motivo, quemParou: quem });
    return NextResponse.json({ ok: true, data: r });
  } catch (e) {
    const detalhe = e instanceof Error ? e.message.slice(0, 200) : "erro desconhecido";
    console.error("[admin/comercial/reabordagem/parar] falhou", { detalhe });
    // ⚠️ Falhar ao GRAVAR a parada é grave e não pode virar 200. Mas a máquina
    // continua segura: `conferirInterruptor` é fail-closed e uma leitura que
    // falha já vale como parada.
    return NextResponse.json({ ok: false, error: detalhe }, { status: 500 });
  }
}

/** O estado do freio, para conferir sem mudar nada. */
export async function GET(req: NextRequest) {
  const guarda = conferirSegredo({
    proprio: req.headers.get(CABECALHO_DO_SEGREDO),
    authorization: req.headers.get("authorization"),
  });
  if (!guarda.ok) {
    return NextResponse.json({ ok: false, error: guarda.motivo }, { status: guarda.status });
  }
  return NextResponse.json({ ok: true, data: await conferirInterruptor(prisma) });
}
