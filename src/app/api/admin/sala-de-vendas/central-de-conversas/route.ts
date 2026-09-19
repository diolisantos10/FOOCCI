/**
 * GET /api/admin/sala-de-vendas/central-de-conversas?caixa=&canal=&busca=&ordem=
 *
 * A coluna esquerda e a lista do meio da Central de Atendimento (tela 03): as
 * Caixas de Conversa, os Canais de Origem e as conversas da caixa escolhida.
 *
 * ⛔ Esta rota **não envia nada**. Ela lê. Atribuir, transferir, priorizar e
 * encerrar já têm rota própria (`/responsavel`, `/distribuicao`, `/ficha`,
 * `/funil`), com as travas que essas ações exigem — duplicá-las aqui criaria um
 * segundo caminho para o mesmo ato, e é assim que uma trava fica para trás.
 *
 * O escopo da sessão entra no `where` da consulta, dentro do serviço. A guarda
 * protege o endereço; o escopo protege o dado.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardarSalaDeVendas } from "../_guarda";
import {
  montarCentralDeConversas,
  CAIXAS,
  CANAIS,
  type NomeDaCaixa,
  type NomeDoCanal,
} from "@/services/salaDeVendas/caixasDeConversa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const portao = await guardarSalaDeVendas(req, "ler_central_de_conversas");
  if (!portao.ok) return portao.resposta;

  const p = req.nextUrl.searchParams;

  // Caixa desconhecida cai na primeira em vez de erro: link velho ou digitação
  // errada não pode derrubar a mesa de trabalho de quem está atendendo.
  const pedida = p.get("caixa");
  const caixa: NomeDaCaixa = CAIXAS.some((c) => c.nome === pedida)
    ? (pedida as NomeDaCaixa)
    : CAIXAS[0]!.nome;

  const pedidoDeCanal = p.get("canal");
  const canal: NomeDoCanal | null = CANAIS.some((c) => c.nome === pedidoDeCanal)
    ? (pedidoDeCanal as NomeDoCanal)
    : null;

  const ordem = p.get("ordem") === "antigas" ? ("antigas" as const) : ("recentes" as const);

  try {
    const data = await montarCentralDeConversas(prisma, {
      sessao: portao.sessao,
      caixa,
      canal,
      busca: p.get("busca") ?? "",
      ordem,
    });
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    // A falha vira falha. Uma resposta com listas vazias faria banco fora do ar
    // parecer "nenhuma conversa hoje".
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Falha ao montar a central." },
      { status: 500 },
    );
  }
}
