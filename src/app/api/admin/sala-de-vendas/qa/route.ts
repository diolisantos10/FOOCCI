/**
 * QA DAS CONVERSAS.
 *
 *   GET  ?fila=revisao|desempenho
 *   POST → avalia
 *   PATCH → contesta (o avaliado) ou revisa (a gestão)
 *
 * ── QUEM AVALIA E QUEM CONTESTA ─────────────────────────────────────────────
 *
 * Avaliar é da gestão e da auditoria. Contestar é de quem foi avaliado — e é a
 * única escrita que o `AGENTE_HUMANO` faz nesta rota. Sem ela, o QA seria uma
 * nota que cai de cima e não se discute, e um QA que não se discute é um QA que
 * o time aprende a ignorar.
 *
 * O `AUDITOR_QA` avalia e NÃO revisa contestação: quem deu a nota não julga o
 * recurso contra a própria nota. É a mesma regra da não conformidade — quem
 * encontra não assina a liberação.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardarSalaDeVendas, vePelaOperacaoToda, somenteLeitura } from "../_guarda";
import {
  avaliar, contestar, revisarContestacao, filaDeRevisao, desempenhoDe,
  type NotaDeCriterio,
} from "@/services/salaDeVendas/qa";
import { comSessao } from "@/services/salaDeVendas/identidadeNoBanco";
import type { AutorDaMensagem, SiteLeadStage } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const portao = await guardarSalaDeVendas(req, "ler_qa");
  if (!portao.ok) return portao.resposta;

  const fila = req.nextUrl.searchParams.get("fila") ?? "revisao";

  if (fila === "desempenho") {
    // O SDR vê o PRÓPRIO desempenho, sempre. A gestão vê o de quem pedir.
    const alvo = vePelaOperacaoToda(portao.sessao)
      ? (req.nextUrl.searchParams.get("userId") ?? portao.sessao.userId)
      : portao.sessao.userId;

    // `lead_avaliacoes_qa` está sob RLS.
    const [meu, daIA] = await comSessao(prisma, portao.sessao, (tx) =>
      Promise.all([
        desempenhoDe(tx, { avaliadoUserId: alvo }),
        desempenhoDe(tx, { avaliado: "IA" }),
      ]),
    );

    return NextResponse.json({ ok: true, data: { userId: alvo, desempenho: meu, ia: daIA } });
  }

  if (!vePelaOperacaoToda(portao.sessao)) {
    return NextResponse.json(
      { ok: false, error: "A fila de revisão é da gestão e da auditoria." },
      { status: 403 },
    );
  }

  const conversas = await filaDeRevisao(prisma, { agora: new Date() });
  return NextResponse.json({ ok: true, data: { fila: "revisao", conversas } });
}

interface CorpoDaAvaliacao {
  leadId?: string;
  avaliado?: AutorDaMensagem;
  avaliadoUserId?: string | null;
  etapa?: SiteLeadStage | null;
  notas?: NotaDeCriterio[];
  pontosFortes?: string | null;
  falhas?: string | null;
  oportunidades?: string | null;
  coaching?: string | null;
  riscoDePerda?: boolean;
  publicar?: boolean;
}

export async function POST(req: NextRequest) {
  const portao = await guardarSalaDeVendas(req, "avaliar_conversa");
  if (!portao.ok) return portao.resposta;

  // Avaliar é da gestão e da auditoria. Um SDR avaliando conversa de outro SDR
  // é hierarquia informal — e ela nasce exatamente assim, por um botão aberto.
  if (!vePelaOperacaoToda(portao.sessao)) {
    return NextResponse.json({ ok: false, error: "Avaliar é da gestão." }, { status: 403 });
  }

  let c: CorpoDaAvaliacao;
  try {
    c = (await req.json()) as CorpoDaAvaliacao;
  } catch {
    return NextResponse.json({ ok: false, error: "Corpo inválido." }, { status: 400 });
  }

  if (!c.leadId || !c.avaliado || !Array.isArray(c.notas)) {
    return NextResponse.json(
      { ok: false, error: "leadId, avaliado e notas são obrigatórios." },
      { status: 400 },
    );
  }

  const r = await avaliar(prisma, {
    leadId: c.leadId,
    avaliado: c.avaliado,
    avaliadoUserId: c.avaliadoUserId ?? null,
    avaliadorId: portao.sessao.userId,
    origem: "HUMANA",
    etapa: c.etapa ?? null,
    notas: c.notas,
    pontosFortes: c.pontosFortes,
    falhas: c.falhas,
    oportunidades: c.oportunidades,
    coaching: c.coaching,
    riscoDePerda: c.riscoDePerda,
    publicar: c.publicar,
  });

  if (!r.ok) return NextResponse.json({ ok: false, recusas: r.recusas }, { status: 400 });
  return NextResponse.json({ ok: true, data: r });
}

interface CorpoDaRevisao {
  avaliacaoId?: string;
  acao?: "contestar" | "revisar";
  texto?: string;
  novaNota?: number | null;
}

export async function PATCH(req: NextRequest) {
  const portao = await guardarSalaDeVendas(req, "contestar_ou_revisar_qa");
  if (!portao.ok) return portao.resposta;

  let c: CorpoDaRevisao;
  try {
    c = (await req.json()) as CorpoDaRevisao;
  } catch {
    return NextResponse.json({ ok: false, error: "Corpo inválido." }, { status: 400 });
  }

  if (!c.avaliacaoId || !c.texto?.trim()) {
    return NextResponse.json(
      { ok: false, error: "avaliacaoId e texto são obrigatórios." },
      { status: 400 },
    );
  }

  if (c.acao === "revisar") {
    // Responder à contestação é da GESTÃO, não da auditoria: quem deu a nota não
    // julga o recurso contra a própria nota.
    if (!vePelaOperacaoToda(portao.sessao) || somenteLeitura(portao.sessao)) {
      return NextResponse.json(
        { ok: false, error: "Revisar contestação é do gerente." },
        { status: 403 },
      );
    }

    const r = await revisarContestacao(prisma, {
      avaliacaoId: c.avaliacaoId,
      revisorId: portao.sessao.userId,
      resposta: c.texto,
      novaNota: c.novaNota,
    });

    if (!r.ok) {
      return NextResponse.json({ ok: false, error: r.causa }, { status: r.causa === "naoExiste" ? 404 : 400 });
    }
    return NextResponse.json({ ok: true });
  }

  // Contestar: a condição de ser o avaliado vai dentro do `where` do serviço.
  const r = await contestar(prisma, {
    avaliacaoId: c.avaliacaoId,
    porUserId: portao.sessao.userId,
    texto: c.texto,
  });

  if (!r.ok) {
    const status = r.causa === "naoEhSeu" ? 403 : r.causa === "naoExiste" ? 404 : 400;
    return NextResponse.json({ ok: false, error: r.causa }, { status });
  }

  return NextResponse.json({ ok: true });
}
