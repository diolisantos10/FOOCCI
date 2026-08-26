/**
 * GET /api/admin/sala-de-vendas/meus-numeros
 *
 * Os números de QUEM PEDIU, e de mais ninguém.
 *
 * ── POR QUE ESTA ROTA NÃO ACEITA PARÂMETRO ──────────────────────────────────
 *
 * Nenhum `?userId=`. A identidade sai da sessão e não há como trocá-la.
 *
 * A tentação de aceitar o parâmetro é grande e chega disfarçada de coisa boa —
 * *"para o gerente poder abrir os números de cada um"*. O gerente já tem o
 * painel dele, que foi desenhado para essa pergunta. Um `?userId=` aqui daria
 * a mesma capacidade a **qualquer sessão da Sala**, porque a guarda que protege
 * o endereço não sabe distinguir os parâmetros que passam por ela.
 *
 * ── QUEM ENTRA ──────────────────────────────────────────────────────────────
 *
 * A guarda comum da Sala, que inclui `AGENTE_HUMANO` — ao contrário da rota do
 * painel do gerente, que o exclui de propósito. É a diferença entre "os meus
 * números" e "os números de todo mundo": a primeira é de quem trabalha.
 */

import { NextRequest, NextResponse } from "next/server";
import { guardarSalaDeVendas } from "../_guarda";
import { meusNumeros } from "@/services/salaDeVendas/meusNumeros";
import { comSessao } from "@/services/salaDeVendas/identidadeNoBanco";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const portao = await guardarSalaDeVendas(req, "ler_meus_numeros");
  if (!portao.ok) return portao.resposta;

  // A identidade declarada no banco: as tabelas da Sala estão sob RLS, e sem
  // ela o painel devolveria zero em tudo — que é pior que um erro, porque
  // parece um dia parado.
  const data = await comSessao(prisma, portao.sessao, (tx) =>
    meusNumeros(tx as never, { sessao: portao.sessao }),
  );

  return NextResponse.json({ ok: true, data });
}
