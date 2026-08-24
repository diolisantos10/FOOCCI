/**
 * O FUNIL — o quadro e o movimento.
 *
 *   GET  → colunas do Kanban, com contagem no escopo de quem pergunta
 *   POST → move o lead de etapa
 *
 * O escopo entra no `where` das colunas: o SDR vê o quadro DELE, e a soma das
 * colunas bate com a lista que ele consegue abrir. Um Kanban que mostra 40
 * cartões e deixa abrir 6 é pior que nenhum — ensina que o número mente.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardarSalaDeVendas, somenteLeitura, podeVerOLead, vePelaOperacaoToda } from "../_guarda";
import { colunasDoKanban, moverNaSala } from "@/services/salaDeVendas/funil";
import { escopoDaConsulta } from "@/services/salaDeVendas/filas";
import type { SiteLeadStage } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const portao = await guardarSalaDeVendas(req, "ler_funil");
  if (!portao.ok) return portao.resposta;

  const escopo = escopoDaConsulta(portao.sessao);

  const [colunas, motivos] = await Promise.all([
    colunasDoKanban(prisma, escopo),
    prisma.motivoDePerda.findMany({
      where: { ativo: true },
      orderBy: { ordem: "asc" },
      select: { id: true, rotulo: true, grupo: true, exigeDetalhe: true },
    }),
  ]);

  return NextResponse.json({ ok: true, data: { colunas, motivosDePerda: motivos } });
}

interface CorpoDoMovimento {
  leadId?: string;
  para?: SiteLeadStage;
  motivoPerdaId?: string | null;
  nota?: string | null;
}

export async function POST(req: NextRequest) {
  const portao = await guardarSalaDeVendas(req, "mover_no_funil");
  if (!portao.ok) return portao.resposta;

  if (somenteLeitura(portao.sessao)) {
    return NextResponse.json({ ok: false, error: "Auditoria lê e não escreve." }, { status: 403 });
  }

  let c: CorpoDoMovimento;
  try {
    c = (await req.json()) as CorpoDoMovimento;
  } catch {
    return NextResponse.json({ ok: false, error: "Corpo inválido." }, { status: 400 });
  }

  if (!c.leadId || !c.para) {
    return NextResponse.json({ ok: false, error: "leadId e para são obrigatórios." }, { status: 400 });
  }

  const acesso = await podeVerOLead(portao.sessao, c.leadId, "mover_no_funil");
  if (!acesso.ok) return acesso.resposta;

  const r = await moverNaSala(prisma, {
    leadId: c.leadId,
    para: c.para,
    actor: portao.sessao.userId,
    motivoPerdaId: c.motivoPerdaId ?? null,
    nota: c.nota ?? null,
    // "Gerente" aqui é quem enxerga a operação toda — é quem pode desfazer um
    // GANHO ou um PERDIDO, porque isso é correção e correção tem dono.
    ehGerente: vePelaOperacaoToda(portao.sessao),
  });

  if (!r.ok) {
    // 409 e não 400 quando outra pessoa moveu antes: não é o pedido que está
    // errado, é o estado que mudou embaixo. A tela recarrega e mostra o atual.
    if ("causa" in r && r.causa === "mudouAntes") {
      return NextResponse.json(
        { ok: false, error: "Alguém moveu este lead antes de você.", agoraEsta: r.agoraEsta },
        { status: 409 },
      );
    }
    if ("causa" in r) {
      return NextResponse.json({ ok: false, error: "Lead não encontrado." }, { status: 404 });
    }
    return NextResponse.json({ ok: false, recusas: r.recusas }, { status: 400 });
  }

  return NextResponse.json({ ok: true, data: r });
}
