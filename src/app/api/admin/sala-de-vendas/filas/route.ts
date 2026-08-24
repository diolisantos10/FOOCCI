/**
 * GET /api/admin/sala-de-vendas/filas?fila=aguardandoHumano
 *
 * As sete filas da Sala. Rota fina: o escopo do SDR é aplicado no `where` da
 * consulta, dentro do serviço — não aqui e não na tela.
 */

import { NextRequest, NextResponse } from "next/server";
import { guardarSalaDeVendas } from "../_guarda";
import { listarFila, FILAS, type NomeDaFila } from "@/services/salaDeVendas/filas";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const portao = await guardarSalaDeVendas(req, "ler_filas_da_sala_de_vendas");
  if (!portao.ok) return portao.resposta;

  const pedida = req.nextUrl.searchParams.get("fila");
  // Fila desconhecida cai em "todos" em vez de erro: link velho ou digitação
  // errada não deve derrubar a tela de quem está trabalhando.
  const fila: NomeDaFila = FILAS.some((f) => f.nome === pedida)
    ? (pedida as NomeDaFila)
    : "todos";

  const r = await listarFila(prisma, { fila, sessao: portao.sessao });

  if (!r.leituraOk) {
    return NextResponse.json({ ok: false, error: r.motivo }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    data: { fila, filas: FILAS, contagens: r.contagens, leads: r.leads },
  });
}
