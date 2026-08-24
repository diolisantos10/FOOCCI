/**
 * TAREFAS E FOLLOW-UPS.
 *
 *   GET  ?fila=vencidos|semPlano|minhas
 *   POST → cria
 *   PATCH → conclui
 *
 * A fila `semPlano` é a que justifica a rota existir. As outras duas mostram
 * trabalho atrasado, que qualquer um percebe; `semPlano` mostra o lead que
 * ninguém está trabalhando E que não aparece em nenhuma lista de atraso — o
 * único jeito de vê-lo é perguntar por ele.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardarSalaDeVendas, somenteLeitura, podeVerOLead } from "../_guarda";
import { escopoDaConsulta } from "@/services/salaDeVendas/filas";
import {
  criarTarefa, concluirTarefa, followUpsVencidos, semProximaAcao,
} from "@/services/salaDeVendas/followUp";
import { comSessao } from "@/services/salaDeVendas/identidadeNoBanco";
import type { TipoDeTarefa } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const portao = await guardarSalaDeVendas(req, "ler_tarefas");
  if (!portao.ok) return portao.resposta;

  const agora = new Date();
  const escopo = escopoDaConsulta(portao.sessao);
  const fila = req.nextUrl.searchParams.get("fila") ?? "vencidos";

  if (fila === "semPlano") {
    const leads = await semProximaAcao(prisma, escopo);
    return NextResponse.json({ ok: true, data: { fila, leads } });
  }

  if (fila === "minhas") {
    // `lead_tarefas` está sob RLS: sem identidade a lista vem vazia.
    const tarefas = await comSessao(prisma, portao.sessao, (tx) => tx.leadTarefa.findMany({
      where: { responsavelId: portao.sessao.userId, situacao: "ABERTA" },
      orderBy: { venceEm: "asc" },
      take: 200,
      select: {
        id: true, titulo: true, tipo: true, venceEm: true, nota: true,
        lead: { select: { id: true, nome: true, whatsapp: true } },
      },
    }));
    return NextResponse.json({ ok: true, data: { fila, tarefas } });
  }

  const leads = await followUpsVencidos(prisma, agora, escopo);
  return NextResponse.json({ ok: true, data: { fila: "vencidos", leads } });
}

interface CorpoDaTarefa {
  leadId?: string;
  titulo?: string;
  venceEm?: string;
  tipo?: TipoDeTarefa;
  nota?: string | null;
  paraMim?: boolean;
}

export async function POST(req: NextRequest) {
  const portao = await guardarSalaDeVendas(req, "criar_tarefa");
  if (!portao.ok) return portao.resposta;

  if (somenteLeitura(portao.sessao)) {
    return NextResponse.json({ ok: false, error: "Auditoria lê e não escreve." }, { status: 403 });
  }

  let c: CorpoDaTarefa;
  try {
    c = (await req.json()) as CorpoDaTarefa;
  } catch {
    return NextResponse.json({ ok: false, error: "Corpo inválido." }, { status: 400 });
  }

  if (!c.leadId || !c.titulo || !c.venceEm) {
    return NextResponse.json(
      { ok: false, error: "leadId, titulo e venceEm são obrigatórios." },
      { status: 400 },
    );
  }

  const acesso = await podeVerOLead(portao.sessao, c.leadId, "criar_tarefa");
  if (!acesso.ok) return acesso.resposta;

  const venceEm = new Date(c.venceEm);
  if (Number.isNaN(venceEm.getTime())) {
    return NextResponse.json({ ok: false, error: "Data inválida." }, { status: 400 });
  }

  const r = await criarTarefa(prisma, {
    leadId: c.leadId,
    titulo: c.titulo,
    venceEm,
    tipo: c.tipo,
    nota: c.nota,
    responsavelId: c.paraMim === false ? null : portao.sessao.userId,
    criadaPor: "HUMANO",
  });

  if (!r.ok) return NextResponse.json({ ok: false, recusas: r.recusas }, { status: 400 });
  return NextResponse.json({ ok: true, data: r });
}

export async function PATCH(req: NextRequest) {
  const portao = await guardarSalaDeVendas(req, "concluir_tarefa");
  if (!portao.ok) return portao.resposta;

  if (somenteLeitura(portao.sessao)) {
    return NextResponse.json({ ok: false, error: "Auditoria lê e não escreve." }, { status: 403 });
  }

  let c: { tarefaId?: string };
  try {
    c = (await req.json()) as { tarefaId?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "Corpo inválido." }, { status: 400 });
  }

  if (!c.tarefaId) {
    return NextResponse.json({ ok: false, error: "tarefaId é obrigatório." }, { status: 400 });
  }

  const tarefa = await prisma.leadTarefa.findUnique({
    where: { id: c.tarefaId },
    select: { leadId: true },
  });
  if (!tarefa) {
    return NextResponse.json({ ok: false, error: "Tarefa não encontrada." }, { status: 404 });
  }

  const acesso = await podeVerOLead(portao.sessao, tarefa.leadId, "concluir_tarefa");
  if (!acesso.ok) return acesso.resposta;

  const r = await concluirTarefa(prisma, { tarefaId: c.tarefaId });
  if (!r.ok) {
    // "Já fechada" é 409: o duplo-clique é o gesto mais comum de todos, e a
    // segunda conclusão não é um erro do usuário — é o estado já resolvido.
    return NextResponse.json(
      { ok: false, error: r.causa },
      { status: r.causa === "jaFechada" ? 409 : 404 },
    );
  }

  return NextResponse.json({ ok: true, data: r });
}
