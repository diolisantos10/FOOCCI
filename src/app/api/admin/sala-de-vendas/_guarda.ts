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
