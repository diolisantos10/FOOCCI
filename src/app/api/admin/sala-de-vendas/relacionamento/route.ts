/**
 * FOLLOW-UP AUTOMÁTICO E PÓS-VENDA — só leitura.
 *
 * GET → os catorze estados com contagem, as cadências e a jornada do cliente.
 *
 * ⚠️ A classificação é calculada na leitura e **não é gravada**. Gravar aqui
 * encheria a linha do tempo de cada lead com uma nota por F5. Quem grava é a
 * CRM IA, uma vez por dia, por `registrarClassificacao`.
 *
 * ⚠️ Nada é inscrito em cadência nem enviado por esta rota.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardarSalaDeVendas } from "../_guarda";
import { escopoDaConsulta } from "@/services/salaDeVendas/filas";
import { panoramaDoRelacionamento } from "@/services/salaDeVendas/telas/relacionamento";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const portao = await guardarSalaDeVendas(req, "ler_relacionamento");
  if (!portao.ok) return portao.resposta;

  const data = await panoramaDoRelacionamento(prisma, { escopo: escopoDaConsulta(portao.sessao) });
  return NextResponse.json({ ok: true, data });
}
