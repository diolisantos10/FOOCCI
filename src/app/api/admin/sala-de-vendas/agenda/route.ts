/**
 * A AGENDA.
 *
 *   GET  ?de=…&ate=…   → compromissos da janela
 *   POST               → agenda
 *   PATCH              → marca o desfecho, ou remarca
 *
 * O SDR vê a própria agenda; a gestão vê a de todos. A distinção é o parâmetro
 * `responsavelId` da consulta, que o SDR não consegue trocar.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardarSalaDeVendas, somenteLeitura, podeVerOLead, vePelaOperacaoToda } from "../_guarda";
import { agendar, marcarSituacao, remarcar, agendaDaJanela } from "@/services/salaDeVendas/agenda";
import { comSessao } from "@/services/salaDeVendas/identidadeNoBanco";
import type { SituacaoDoCompromisso } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const portao = await guardarSalaDeVendas(req, "ler_agenda");
  if (!portao.ok) return portao.resposta;

  const p = req.nextUrl.searchParams;
  const agora = new Date();
  const de = p.get("de") ? new Date(p.get("de")!) : agora;
  const ate = p.get("ate") ? new Date(p.get("ate")!) : new Date(agora.getTime() + 7 * 86_400_000);

  if (Number.isNaN(de.getTime()) || Number.isNaN(ate.getTime()) || de >= ate) {
    return NextResponse.json({ ok: false, error: "Período inválido." }, { status: 400 });
  }

  // Quem não enxerga a operação toda vê SÓ a própria agenda — e o filtro é
  // imposto aqui, não escolhido pelo cliente.
  const responsavelId = vePelaOperacaoToda(portao.sessao)
    ? (p.get("responsavelId") || null)
    : portao.sessao.userId;

  // `lead_compromissos` está sob RLS.
  const compromissos = await comSessao(prisma, portao.sessao, (tx) =>
    agendaDaJanela(tx, { de, ate, responsavelId }),
  );
  return NextResponse.json({ ok: true, data: { de, ate, compromissos } });
}

interface CorpoDaAgenda {
  leadId?: string;
  titulo?: string;
  comecaEm?: string;
  duracaoMin?: number;
  local?: string | null;
  nota?: string | null;
}

export async function POST(req: NextRequest) {
  const portao = await guardarSalaDeVendas(req, "agendar_compromisso");
  if (!portao.ok) return portao.resposta;

  if (somenteLeitura(portao.sessao)) {
    return NextResponse.json({ ok: false, error: "Auditoria lê e não escreve." }, { status: 403 });
  }

  let c: CorpoDaAgenda;
  try {
    c = (await req.json()) as CorpoDaAgenda;
  } catch {
    return NextResponse.json({ ok: false, error: "Corpo inválido." }, { status: 400 });
  }

  if (!c.leadId || !c.titulo || !c.comecaEm) {
    return NextResponse.json(
      { ok: false, error: "leadId, titulo e comecaEm são obrigatórios." },
      { status: 400 },
    );
  }

  const acesso = await podeVerOLead(portao.sessao, c.leadId, "agendar_compromisso");
  if (!acesso.ok) return acesso.resposta;

  const comecaEm = new Date(c.comecaEm);
  if (Number.isNaN(comecaEm.getTime())) {
    return NextResponse.json({ ok: false, error: "Data inválida." }, { status: 400 });
  }

  const r = await agendar(prisma, {
    leadId: c.leadId,
    titulo: c.titulo,
    comecaEm,
    duracaoMin: c.duracaoMin,
    local: c.local,
    nota: c.nota,
    responsavelId: portao.sessao.userId,
  });

  if (!r.ok) return NextResponse.json({ ok: false, recusas: r.recusas }, { status: 400 });
  return NextResponse.json({ ok: true, data: r });
}

interface CorpoDoDesfecho {
  compromissoId?: string;
  situacao?: SituacaoDoCompromisso;
  novoComecaEm?: string;
  nota?: string | null;
}

export async function PATCH(req: NextRequest) {
  const portao = await guardarSalaDeVendas(req, "atualizar_compromisso");
  if (!portao.ok) return portao.resposta;

  if (somenteLeitura(portao.sessao)) {
    return NextResponse.json({ ok: false, error: "Auditoria lê e não escreve." }, { status: 403 });
  }

  let c: CorpoDoDesfecho;
  try {
    c = (await req.json()) as CorpoDoDesfecho;
  } catch {
    return NextResponse.json({ ok: false, error: "Corpo inválido." }, { status: 400 });
  }

  if (!c.compromissoId) {
    return NextResponse.json({ ok: false, error: "compromissoId é obrigatório." }, { status: 400 });
  }

  const compromisso = await prisma.leadCompromisso.findUnique({
    where: { id: c.compromissoId },
    select: { leadId: true },
  });
  if (!compromisso) {
    return NextResponse.json({ ok: false, error: "Compromisso não encontrado." }, { status: 404 });
  }

  const acesso = await podeVerOLead(portao.sessao, compromisso.leadId, "atualizar_compromisso");
  if (!acesso.ok) return acesso.resposta;

  if (c.novoComecaEm) {
    const novo = new Date(c.novoComecaEm);
    if (Number.isNaN(novo.getTime())) {
      return NextResponse.json({ ok: false, error: "Data inválida." }, { status: 400 });
    }

    const r = await remarcar(prisma, {
      compromissoId: c.compromissoId,
      novoComecaEm: novo,
      motivo: c.nota,
    });

    if (!r.ok) {
      if ("recusas" in r) return NextResponse.json({ ok: false, recusas: r.recusas }, { status: 400 });
      return NextResponse.json({ ok: false, error: r.causa }, { status: 409 });
    }
    return NextResponse.json({ ok: true, data: r });
  }

  if (!c.situacao) {
    return NextResponse.json({ ok: false, error: "situacao é obrigatória." }, { status: 400 });
  }

  const r = await marcarSituacao(prisma, {
    compromissoId: c.compromissoId,
    situacao: c.situacao,
    nota: c.nota,
  });

  if (!r.ok) {
    return NextResponse.json({ ok: false, error: r.causa }, { status: r.causa === "naoExiste" ? 404 : 409 });
  }
  return NextResponse.json({ ok: true });
}
