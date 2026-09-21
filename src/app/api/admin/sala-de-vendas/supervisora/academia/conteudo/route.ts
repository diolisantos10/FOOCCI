/**
 * /api/admin/sala-de-vendas/supervisora/academia/conteudo?versaoId=…
 *
 *   GET → os ITENS de uma versão da Academia Comercial, para a tela poder
 *         mostrar em português o que aquela versão ensina.
 *
 * ── POR QUE UM SEGUNDO ENDPOINT, E SÓ DE LEITURA ────────────────────────────
 *
 * `../route.ts` devolve a LISTA de versões (número, situação, quantos itens) —
 * é o que a tela precisa para desenhar o histórico. Ele não devolve o conteúdo,
 * e não deveria: são até 50 versões por resposta, e carregar os itens de todas
 * para mostrar os de uma é pagar cinquenta vezes por um.
 *
 * ⛔ Este arquivo NÃO publica nada e não tem POST. Publicar continua sendo um só
 * lugar — `publicarVersaoDaAcademia`, chamado pelo POST de `../route.ts`. Uma
 * segunda porta de publicação seria exatamente o que a doutrina do interruptor
 * existe para impedir.
 *
 * ── A MESMA GUARDA ──────────────────────────────────────────────────────────
 *
 * `guardarPainelDaSupervisora`, igual ao GET de `../route.ts`: quem já enxerga
 * o painel enxerga o conteúdo. Não há `exigirPodeDecidir` aqui porque não há
 * decisão aqui — ler não é decidir, e o auditor lê.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardarPainelDaSupervisora } from "../../_guardaDoPainel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const portao = await guardarPainelDaSupervisora(req, "ler_conteudo_da_academia");
  if (!portao.ok) return portao.resposta;

  const pedido = req.nextUrl.searchParams.get("versaoId");

  // Sem `versaoId` a pergunta é "o que está valendo agora" — e a resposta pode
  // legitimamente ser "nenhuma versão". Isso NÃO é erro: é o estado de estreia,
  // e a tela precisa poder dizê-lo com todas as letras.
  let versaoId = pedido;
  if (!versaoId) {
    const config = await prisma.academiaComercialConfig.findUnique({
      where: { id: "singleton" },
      select: { versaoAtivaId: true },
    });
    versaoId = config?.versaoAtivaId ?? null;
    if (!versaoId) {
      return NextResponse.json({ ok: true, data: { versao: null, itens: [] } });
    }
  }

  const versao = await prisma.academiaComercialVersao.findUnique({
    where: { id: versaoId },
    select: {
      id: true,
      numero: true,
      situacao: true,
      notaDaVersao: true,
      publicadaEm: true,
      criadaEm: true,
      publicadaPor: { select: { id: true, nome: true } },
    },
  });

  if (!versao) {
    return NextResponse.json({ ok: false, error: "versão não existe" }, { status: 404 });
  }

  const itens = await prisma.academiaComercialItem.findMany({
    where: { versaoId },
    orderBy: [{ categoria: "asc" }, { etapa: "asc" }, { titulo: "asc" }],
    select: {
      id: true,
      categoria: true,
      etapa: true,
      titulo: true,
      conteudo: true,
      ruim: true,
      corrigido: true,
      tags: true,
      fonteUrl: true,
      fonteData: true,
    },
  });

  return NextResponse.json({ ok: true, data: { versao, itens } });
}
