/**
 * QUALIFICAÇÃO / LEAD SCORE — só leitura.
 *
 * GET → o termômetro da base, a régua lida do código, o que falta perguntar,
 * a MESA DE TRABALHO (a tabela de leads do desenho, paginada e filtrada) e a
 * conversão medida por degrau.
 *
 * Não há POST: pontuar um lead é ato do TA e da ficha, e já tem caminho. Uma
 * segunda porta de escrita de score seria um segundo lugar onde a régua pode
 * divergir. **Mover de etapa também não passa por aqui** — o seletor de Stage
 * da tabela fala com `/funil`, que é onde a regra de movimento mora.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardarSalaDeVendas } from "../_guarda";
import { escopoDaConsulta } from "@/services/salaDeVendas/filas";
import { telaDaQualificacao } from "@/services/salaDeVendas/telas/qualificacao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Número da URL que não é número vira o padrão, nunca `NaN` nem página vazia. */
function inteiro(bruto: string | null, padrao: number): number {
  const n = Number(bruto ?? "");
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : padrao;
}

export async function GET(req: NextRequest) {
  const portao = await guardarSalaDeVendas(req, "ler_qualificacao");
  if (!portao.ok) return portao.resposta;

  const q = req.nextUrl.searchParams;

  const data = await telaDaQualificacao(prisma, {
    escopo: escopoDaConsulta(portao.sessao),
    filtro: {
      busca: q.get("busca"),
      origem: q.get("origem"),
      produto: q.get("produto"),
      temperatura: q.get("temperatura"),
      stage: q.get("stage"),
      pagina: inteiro(q.get("pagina"), 1),
      porPagina: inteiro(q.get("porPagina"), 10),
    },
  });

  return NextResponse.json({ ok: true, data });
}
