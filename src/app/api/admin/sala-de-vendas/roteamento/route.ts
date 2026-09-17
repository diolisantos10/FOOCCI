/**
 * MOTOR DE DECISÃO / ROTEAMENTO — só leitura.
 *
 * GET → o modo corrente, quem está apto, o SLA e as regras que existem.
 *
 * ── POR QUE NÃO TEM POST ────────────────────────────────────────────────────
 *
 * Distribuir, transferir e assumir já moram em
 * `/api/admin/sala-de-vendas/distribuicao`, com as travas de papel que separam
 * "puxar da fila" de "tirar lead de alguém". Repetir qualquer uma delas aqui
 * seria abrir a mesma ação por uma porta com outra guarda.
 *
 * ── E POR QUE A LEITURA É DA OPERAÇÃO TODA ──────────────────────────────────
 *
 * Esta tela mostra a CARGA e o ESTADO dos colegas, que é exatamente o que o
 * painel do SDR não entrega. Por isso ela é da gestão — a mesma régua que a
 * distribuição automática usa para decidir de quem é o trabalho dos outros.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardarSalaDeVendas, vePelaOperacaoToda } from "../_guarda";
import { panoramaDoRoteamento } from "@/services/salaDeVendas/telas/roteamento";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const portao = await guardarSalaDeVendas(req, "ler_roteamento");
  if (!portao.ok) return portao.resposta;

  if (!vePelaOperacaoToda(portao.sessao)) {
    return NextResponse.json(
      { ok: false, error: "O motor de decisão mostra a carga do time inteiro. É da gestão." },
      { status: 403 },
    );
  }

  const data = await panoramaDoRoteamento(prisma);
  return NextResponse.json({ ok: true, data });
}
