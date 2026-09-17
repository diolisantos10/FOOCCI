/**
 * O DEPARTAMENTO DE CRM — a CRM IA, na leitura que a tela precisa.
 *
 *   GET ?limite=5000
 *
 * ── O QUE ELA DEVOLVE ───────────────────────────────────────────────────────
 *
 * O plano do dia (as filas de trabalho e a receita potencial), a contagem dos
 * catorze estados de follow-up, a cadência que atende cada estado, as
 * condições de parada da cadência e a régua da jornada de pós-venda.
 *
 * ── PLANO, E NÃO EXECUÇÃO ───────────────────────────────────────────────────
 *
 * `montarPlanoDoDia` só lê e classifica. Quem inscreve alguém numa cadência é
 * `enfileirarPlano`, e ele NÃO é chamado aqui — de propósito. Abrir um painel
 * não pode ser um ato: um GET que enfileira transforma "dar uma olhada" em
 * "mandar mensagem para setecentas pessoas", e ninguém descobre isso a tempo.
 * Esta rota não escreve no banco e não agenda envio nenhum.
 *
 * ── A PORTA ─────────────────────────────────────────────────────────────────
 *
 * A mesma lista explícita dos outros painéis de gestão, repetida de propósito.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { autorizarInterno } from "@/lib/internal-auth";
import { comSessao } from "@/services/salaDeVendas/identidadeNoBanco";
import { montarPlanoDoDia, CADENCIA_POR_ESTADO } from "@/services/salaDeVendas/crm/planoDoDia";
import { REGUA } from "@/services/salaDeVendas/crm/estadoDeFollowUp";
import { PARADAS, CATALOGO_DE_CONDICOES } from "@/services/salaDeVendas/crm/cadenciaPorComportamento";
import {
  REGUA_DO_POS_VENDA,
  REGUA_DE_CHURN,
  SINAIS_DE_CHURN,
} from "@/services/salaDeVendas/crm/posVenda";
import {
  ESTADOS_DE_FOLLOW_UP,
  EXPLICACAO_DO_ESTADO,
  ROTULO_DO_ESTADO,
  ROTULO_DO_MARCO,
} from "@/services/salaDeVendas/crm/rotulosDoFollowUp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = autorizarInterno(req, {
    papeis: ["MASTER_CEO", "DIRETOR_FOOCCI", "GERENTE_DEPARTAMENTO", "AUDITOR_QA"],
  });

  if (!auth.ok) {
    try {
      await prisma.internalAuditEvent.create({
        data: {
          actorType: auth.sessao ? "INTERNAL_USER" : "ANONIMO",
          actorLabel: auth.sessao ? `${auth.sessao.nome} (${auth.sessao.userId})` : "anônimo",
          acao: "ler_painel_da_crm_ia",
          recurso: "sala-de-vendas/crm",
          resultado: "NEGADO",
          motivo: auth.motivo,
        },
      });
    } catch {
      /* trilha fora do ar não abre a porta */
    }
    return NextResponse.json({ ok: false, error: auth.motivo }, { status: auth.status });
  }

  const agora = new Date();
  const bruto = req.nextUrl.searchParams.get("limite");
  const limite = bruto ? Math.min(Math.max(Number.parseInt(bruto, 10) || 5000, 1), 20_000) : undefined;

  const plano = await comSessao(prisma, auth.sessao, (tx) =>
    montarPlanoDoDia(tx as never, { agora, limite }),
  );

  return NextResponse.json({
    ok: true,
    data: {
      plano,
      /** Os catorze estados, com rótulo, explicação e a cadência que os atende. */
      estados: ESTADOS_DE_FOLLOW_UP.map((estado) => ({
        estado,
        rotulo: ROTULO_DO_ESTADO[estado],
        explicacao: EXPLICACAO_DO_ESTADO[estado],
        quantos: plano.porEstado[estado],
        cadencia: CADENCIA_POR_ESTADO[estado] ?? null,
      })),
      regua: REGUA,
      cadencia: {
        paradas: PARADAS.map((p) => ({ motivo: p.motivo, explicacao: p.explicacao })),
        condicoes: Object.entries(CATALOGO_DE_CONDICOES).map(([chave, c]) => ({
          chave,
          descricao: c.descricao,
          estados: c.estados,
          temFiltroExtra: c.extra !== undefined,
        })),
      },
      posVenda: {
        marcos: Object.entries(ROTULO_DO_MARCO).map(([marco, rotulo]) => ({ marco, rotulo })),
        regua: REGUA_DO_POS_VENDA,
        reguaDeChurn: REGUA_DE_CHURN,
        sinaisDeChurn: SINAIS_DE_CHURN.map((s) => ({
          codigo: s.codigo,
          peso: s.peso,
          descricao: s.descricao,
        })),
      },
    },
  });
}
