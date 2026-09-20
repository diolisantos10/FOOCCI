/**
 * GET  — catálogo, progresso próprio e (para gestão) domínio do time.
 * POST — conclui uma unidade ou corrige uma prova do usuário autenticado.
 *
 * O agente de IA não faz login, portanto suas avaliações entram pelo serviço
 * de cenários e usam `OrigemDaAvaliacaoComercial.CENARIOS_DE_IA`; esta rota
 * nunca deixa uma pessoa atribuir nota manual a um agente.
 */

import { NextRequest, NextResponse } from "next/server";
import type { EixoDoTreinamentoComercial } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { guardarSalaDeVendas, somenteLeitura, vePelaOperacaoToda } from "../_guarda";
import {
  catalogoDoTreinamento,
  corrigirProva,
  nivelDeDominio,
  provaDoTreinamento,
} from "@/services/salaDeVendas/treinamento/catalogo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EIXOS = new Set<EixoDoTreinamentoComercial>(["PRODUTO", "VENDA_CONSULTIVA", "SEGURANCA_E_MARCA"]);

function eixoValido(valor: unknown): valor is EixoDoTreinamentoComercial {
  return typeof valor === "string" && EIXOS.has(valor as EixoDoTreinamentoComercial);
}

function ultimasPorEixo<T extends { eixo: EixoDoTreinamentoComercial }>(itens: readonly T[]): Map<EixoDoTreinamentoComercial, T> {
  const mapa = new Map<EixoDoTreinamentoComercial, T>();
  for (const item of itens) if (!mapa.has(item.eixo)) mapa.set(item.eixo, item);
  return mapa;
}

export async function GET(req: NextRequest) {
  const portao = await guardarSalaDeVendas(req, "ler_centro_de_treinamento");
  if (!portao.ok) return portao.resposta;

  const catalogo = catalogoDoTreinamento();
  const [progressos, avaliacoes] = await Promise.all([
    prisma.treinamentoComercialProgresso.findMany({
      where: { internalUserId: portao.sessao.userId },
      select: { unidadeId: true, eixo: true, concluidoEm: true },
    }),
    prisma.treinamentoComercialAvaliacao.findMany({
      where: { internalUserId: portao.sessao.userId },
      orderBy: { criadaEm: "desc" },
      select: { eixo: true, nota: true, acertos: true, total: true, origem: true, criadaEm: true },
    }),
  ]);

  const minhasUltimas = ultimasPorEixo(avaliacoes);
  const porEixo = Object.fromEntries(catalogo.map((trilha) => {
    const feitos = progressos.filter((p) => p.eixo === trilha.eixo).length;
    const ultima = minhasUltimas.get(trilha.eixo) ?? null;
    return [trilha.eixo, {
      concluidas: feitos,
      total: trilha.unidades.length,
      percentual: trilha.unidades.length > 0 ? Math.round((feitos / trilha.unidades.length) * 100) : 0,
      ultimaAvaliacao: ultima,
      nivel: nivelDeDominio(ultima?.nota ?? null),
    }];
  }));

  let equipe: unknown[] | null = null;
  if (vePelaOperacaoToda(portao.sessao)) {
    const pessoas = await prisma.internalUser.findMany({
      where: {
        isActive: true,
        OR: [
          { id: portao.sessao.userId },
          { memberships: { some: { department: { slug: "vendas" } } } },
          { role: "AGENTE_IA" },
        ],
      },
      orderBy: [{ role: "asc" }, { nome: "asc" }],
      select: {
        id: true,
        nome: true,
        role: true,
        progressoNoTreinamento: { select: { unidadeId: true, eixo: true } },
        avaliacoesDeTreinamento: {
          orderBy: { criadaEm: "desc" },
          select: { eixo: true, nota: true, origem: true, criadaEm: true },
        },
      },
    });

    equipe = pessoas.map((pessoa) => {
      const ultimas = ultimasPorEixo(pessoa.avaliacoesDeTreinamento);
      const notas = [...ultimas.values()].map((a) => a.nota);
      const notaGeral = notas.length === 0 ? null : Math.round(notas.reduce((a, b) => a + b, 0) / notas.length);
      return {
        id: pessoa.id,
        nome: pessoa.nome,
        tipo: pessoa.role === "AGENTE_IA" ? "Agente de IA" : "Humano",
        notaGeral,
        nivel: nivelDeDominio(notaGeral),
        concluidas: pessoa.progressoNoTreinamento.length,
        eixosAvaliados: [...ultimas.values()].map((a) => ({
          eixo: a.eixo,
          nota: a.nota,
          origem: a.origem,
          criadaEm: a.criadaEm,
        })),
      };
    });
  }

  return NextResponse.json({
    ok: true,
    data: {
      catalogo,
      progresso: { unidadesConcluidas: progressos.map((p) => p.unidadeId), porEixo },
      equipe,
      podeVerEquipe: equipe !== null,
    },
  });
}

interface Corpo {
  acao?: unknown;
  eixo?: unknown;
  unidadeId?: unknown;
  respostas?: unknown;
}

export async function POST(req: NextRequest) {
  const portao = await guardarSalaDeVendas(req, "avancar_no_centro_de_treinamento");
  if (!portao.ok) return portao.resposta;
  if (somenteLeitura(portao.sessao)) {
    return NextResponse.json({ ok: false, error: "Auditoria lê o treinamento, mas não altera progresso." }, { status: 403 });
  }

  const corpo = (await req.json().catch(() => ({}))) as Corpo;
  if (!eixoValido(corpo.eixo)) {
    return NextResponse.json({ ok: false, error: "eixo inválido" }, { status: 400 });
  }

  if (corpo.acao === "concluir-unidade") {
    const unidadeId = typeof corpo.unidadeId === "string" ? corpo.unidadeId : "";
    const trilha = catalogoDoTreinamento().find((t) => t.eixo === corpo.eixo);
    const existe = trilha?.unidades.some((u) => u.id === unidadeId) ?? false;
    if (!existe) return NextResponse.json({ ok: false, error: "unidade não pertence à trilha" }, { status: 400 });

    await prisma.treinamentoComercialProgresso.upsert({
      where: { internalUserId_unidadeId: { internalUserId: portao.sessao.userId, unidadeId } },
      create: { internalUserId: portao.sessao.userId, unidadeId, eixo: corpo.eixo },
      update: { eixo: corpo.eixo, concluidoEm: new Date() },
    });
    return NextResponse.json({ ok: true, data: { unidadeId, concluida: true } });
  }

  if (corpo.acao === "enviar-prova") {
    if (!Array.isArray(corpo.respostas)) {
      return NextResponse.json({ ok: false, error: "respostas obrigatórias" }, { status: 400 });
    }
    const respostas = corpo.respostas
      .filter((r): r is { questaoId: string; opcaoId: string } =>
        Boolean(r) && typeof r === "object" && typeof (r as { questaoId?: unknown }).questaoId === "string" && typeof (r as { opcaoId?: unknown }).opcaoId === "string")
      .map((r) => ({ questaoId: r.questaoId, opcaoId: r.opcaoId }));
    const resultado = corrigirProva(corpo.eixo, respostas);
    if (resultado.total === 0 || respostas.length !== provaDoTreinamento(corpo.eixo).length) {
      return NextResponse.json({ ok: false, error: "prova incompleta" }, { status: 400 });
    }

    await prisma.treinamentoComercialAvaliacao.create({
      data: {
        internalUserId: portao.sessao.userId,
        eixo: corpo.eixo,
        origem: "PROVA_HUMANA",
        nota: resultado.nota,
        acertos: resultado.acertos,
        total: resultado.total,
        evidencia: resultado.itens,
      },
    });
    return NextResponse.json({ ok: true, data: { ...resultado, nivel: nivelDeDominio(resultado.nota) } });
  }

  if (corpo.acao === "abrir-prova") {
    return NextResponse.json({ ok: true, data: { questoes: provaDoTreinamento(corpo.eixo) } });
  }

  return NextResponse.json({ ok: false, error: "ação inválida" }, { status: 400 });
}
