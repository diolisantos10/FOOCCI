/**
 * QUALIFICAÇÃO / LEAD SCORE — só leitura.
 *
 * GET → o termômetro da base, a régua lida do código e o que falta perguntar.
 *
 * Não há POST: pontuar um lead é ato do TA e da ficha, e já tem caminho. Uma
 * segunda porta de escrita de score seria um segundo lugar onde a régua pode
 * divergir.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardarSalaDeVendas } from "../_guarda";
import { escopoDaConsulta } from "@/services/salaDeVendas/filas";
import { panoramaDaQualificacao } from "@/services/salaDeVendas/telas/qualificacao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const portao = await guardarSalaDeVendas(req, "ler_qualificacao");
  if (!portao.ok) return portao.resposta;

  const data = await panoramaDaQualificacao(prisma, {
    escopo: escopoDaConsulta(portao.sessao),
  });

  return NextResponse.json({ ok: true, data });
}
