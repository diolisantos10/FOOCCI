/**
 * A FICHA 360º — o painel direito da tela de atendimento.
 *
 *   PATCH → grava o que foi descoberto e RECALCULA o score
 *
 * ── POR QUE SALVAR A FICHA REPONTUA O LEAD ──────────────────────────────────
 *
 * Score e ficha são a mesma informação em duas formas. Deixar o recálculo para
 * um botão separado garante o pior dos mundos: a ficha diz "5 unidades, depende
 * do iFood, quer para ontem" e o score continua o de três dias atrás, porque
 * ninguém lembra de apertar. A tela mostraria dois números que se contradizem, e
 * o time aprenderia a não confiar em nenhum dos dois.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardarSalaDeVendas, somenteLeitura, podeVerOLead } from "../_guarda";
import { pontuar } from "@/services/salaDeVendas/score";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CorpoDaFicha {
  leadId?: string;
  email?: string | null;
  tags?: string[];
  prioritario?: boolean;
  segmento?: string | null;
  unidades?: number | null;
  volumeMensal?: number | null;
  canaisAtuais?: string[];
  sistemaAtual?: string | null;
  dorPrincipal?: string | null;
  objetivo?: string | null;
  planoDeInteresse?: string | null;
  urgencia?: string | null;
  poderDeDecisao?: string | null;
  faixaDeOrcamento?: string | null;
  observacoes?: string | null;
  ehRestaurante?: boolean | null;
}

export async function PATCH(req: NextRequest) {
  const portao = await guardarSalaDeVendas(req, "editar_ficha_do_lead");
  if (!portao.ok) return portao.resposta;

  if (somenteLeitura(portao.sessao)) {
    return NextResponse.json({ ok: false, error: "Auditoria lê e não escreve." }, { status: 403 });
  }

  let c: CorpoDaFicha;
  try {
    c = (await req.json()) as CorpoDaFicha;
  } catch {
    return NextResponse.json({ ok: false, error: "Corpo inválido." }, { status: 400 });
  }

  const leadId = c.leadId?.trim();
  if (!leadId) {
    return NextResponse.json({ ok: false, error: "leadId é obrigatório." }, { status: 400 });
  }

  const acesso = await podeVerOLead(portao.sessao, leadId, "editar_ficha_do_lead");
  if (!acesso.ok) return acesso.resposta;

  const daFicha = {
    segmento: c.segmento ?? null,
    unidades: c.unidades ?? null,
    volumeMensal: c.volumeMensal ?? null,
    canaisAtuais: c.canaisAtuais ?? [],
    sistemaAtual: c.sistemaAtual ?? null,
    dorPrincipal: c.dorPrincipal ?? null,
    objetivo: c.objetivo ?? null,
    planoDeInteresse: c.planoDeInteresse ?? null,
    urgencia: c.urgencia ?? null,
    poderDeDecisao: c.poderDeDecisao ?? null,
    faixaDeOrcamento: c.faixaDeOrcamento ?? null,
    observacoes: c.observacoes ?? null,
  };

  await prisma.$transaction(async (tx) => {
    await tx.leadQualificacao.upsert({
      where: { leadId },
      create: { leadId, ...daFicha, atualizadoPorId: portao.sessao.userId },
      update: { ...daFicha, atualizadoPorId: portao.sessao.userId },
    });

    await tx.siteLead.update({
      where: { id: leadId },
      data: {
        email: c.email ?? undefined,
        tags: c.tags ?? undefined,
        prioritario: c.prioritario ?? undefined,
      },
    });
  });

  // Quantas mensagens o lead mandou — engajamento OBSERVADO, e não declarado
  // por ninguém. É o único sinal do score que o vendedor não consegue inflar.
  const mensagensDoLead = await prisma.leadMensagem.count({
    where: { leadId, direcao: "ENTRADA" },
  });

  const score = await pontuar(prisma, {
    leadId,
    sinais: { ...daFicha, mensagensDoLead, ehRestaurante: c.ehRestaurante ?? null },
  });

  return NextResponse.json({ ok: true, data: { score } });
}
