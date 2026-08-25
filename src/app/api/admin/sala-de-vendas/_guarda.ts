/**
 * A guarda da Sala de Vendas.
 *
 * ── QUEM ENTRA ──
 *
 * O SDR humano (`AGENTE_HUMANO`) entra — esta é a ÚNICA área do Admin que ele
 * alcança. O Agente Gerente Comercial, o Diretor e o CEO também. O auditor lê.
 *
 * `AGENTE_IA` não entra por aqui: ator técnico não abre tela. As ações da IA
 * passam pelo serviço, com autor registrado na trilha.
 *
 * ── O QUE ESTA GUARDA NÃO FAZ ──
 *
 * Não decide QUAIS leads a pessoa vê. Isso é do `escopoDaConsulta`, que entra no
 * `where` da consulta. A guarda protege o endereço; o escopo protege o dado.
 * Confundir os dois é como o RBAC vira porta com fechadura e janela aberta.
 */

import { NextRequest, NextResponse } from "next/server";
import { autorizarInterno, type SessaoInterna } from "@/lib/internal-auth";
import { prisma } from "@/lib/prisma";

export type Portao =
  | { ok: true; sessao: SessaoInterna }
  | { ok: false; resposta: NextResponse };

export async function guardarSalaDeVendas(req: NextRequest, acao: string): Promise<Portao> {
  const auth = autorizarInterno(req, {
    papeis: ["MASTER_CEO", "DIRETOR_FOOCCI", "GERENTE_DEPARTAMENTO", "AGENTE_HUMANO", "AUDITOR_QA"],
  });

  if (!auth.ok) {
    try {
      await prisma.internalAuditEvent.create({
        data: {
          actorType: auth.sessao ? "INTERNAL_USER" : "ANONIMO",
          actorLabel: auth.sessao ? `${auth.sessao.nome} (${auth.sessao.userId})` : "anônimo",
          acao,
          recurso: "sala-de-vendas",
          resultado: "NEGADO",
          motivo: auth.motivo,
        },
      });
    } catch {
      // Trilha indisponível não abre a porta: a negativa vale mesmo que o
      // registro dela falhe.
    }

    return {
      ok: false,
      resposta: NextResponse.json(
        { ok: false, error: auth.motivo, comoResolver: "scripts/criar-usuario-interno.ts" },
        { status: auth.status },
      ),
    };
  }

  return { ok: true, sessao: auth.sessao };
}

/** O auditor lê e não escreve. Quem audita não mexe no que auditou. */
export function somenteLeitura(sessao: SessaoInterna): boolean {
  return sessao.role === "AUDITOR_QA";
}

/** Quem enxerga a operação inteira, e não só o próprio quadro. */
export function vePelaOperacaoToda(sessao: SessaoInterna): boolean {
  return (
    sessao.role === "MASTER_CEO" ||
    sessao.role === "DIRETOR_FOOCCI" ||
    sessao.role === "GERENTE_DEPARTAMENTO" ||
    sessao.role === "AUDITOR_QA"
  );
}

export type AcessoAoLead =
  | { ok: true }
  | { ok: false; resposta: NextResponse };

/**
 * A TERCEIRA CAMADA, aplicada a UM lead.
 *
 * ── POR QUE ESTA FUNÇÃO PRECISA EXISTIR ─────────────────────────────────────
 *
 * `escopoDaConsulta` protege as LISTAS: entra no `where` e o SDR nunca vê na
 * fila um lead que não é dele. Mas a tela de atendimento não busca uma lista —
 * busca UM lead, por id, vindo da URL.
 *
 * Sem esta checagem, `/api/admin/sala-de-vendas/conversa?leadId=<qualquer>`
 * devolveria a conversa de qualquer prospecto a qualquer SDR autenticado: a
 * guarda de rota diria "sim, você é SDR" e entregaria o dado. É exatamente o
 * buraco que o item 19 manda fechar — "impedir acesso direto por URL ou API".
 *
 * O SDR alcança: o que é dele, o que não é de ninguém, e o que está esperando
 * gente. Não alcança conversa que outra pessoa está conduzindo — nem para ler.
 */
export async function podeVerOLead(
  sessao: SessaoInterna,
  leadId: string,
  acao: string,
): Promise<AcessoAoLead> {
  if (vePelaOperacaoToda(sessao)) return { ok: true };

  const lead = await prisma.siteLead.findUnique({
    where: { id: leadId },
    select: { atendenteUserId: true, atendidoPor: true },
  });

  const alcanca =
    lead !== null &&
    (lead.atendenteUserId === sessao.userId ||
      lead.atendidoPor === "NINGUEM" ||
      lead.atendidoPor === "AGUARDANDO_HUMANO");

  if (alcanca) return { ok: true };

  try {
    await prisma.internalAuditEvent.create({
      data: {
        actorType: "INTERNAL_USER",
        actorLabel: `${sessao.nome} (${sessao.userId})`,
        acao,
        recurso: `lead:${leadId}`,
        resultado: "NEGADO",
        motivo: lead ? "lead de outro atendente" : "lead inexistente",
      },
    });
  } catch {
    // Trilha fora do ar não abre a porta.
  }

  // ── POR QUE 404, E NÃO 403 ──
  //
  // Um 403 confirmaria que o lead existe — e num sistema comercial isso já é
  // informação: dá para varrer ids e medir o tamanho da base sem ler um dado
  // sequer. "Não encontrado" é a mesma resposta para o lead que não existe e
  // para o que não é seu, e as duas são verdade da posição de quem perguntou.
  return {
    ok: false,
    resposta: NextResponse.json(
      { ok: false, error: "Lead não encontrado." },
      { status: 404 },
    ),
  };
}
